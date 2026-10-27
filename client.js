// dsh-sidebar-tidy — 浏览器半：把侧栏图标行里的指定条目隐藏掉
//
// 为什么这么做：sidebar.panellist 的注册选项只有 { id, order, label }，
// 没有 hidden / visible 字段；ui-sidebar 的 syncPanels() 直接遍历
// ctx.slots.entriesOfSlot('sidebar.panellist') 生成列表，宿主也没有提供
// 任何过滤/隐藏 API（ctx.slots 只有 register/registerFactory/inject）。
// 所以这里从「同一份数据源」算出顺序，再到 DOM 里把对应那一行 display:none。
//
// 顺序是怎么对齐的：
//   ui-sidebar 的 panels = entriesOfSlot(...).map(({options}) => ({id, order, label}))
//                                    .sort((a, b) => a.order - b.order)
//   <nav aria-label=...>{panels.map(p => <PanelRow key={p.id} .../>)}</nav>
// 也就是说 nav 的第 i 个子元素 === 按 order 排序后的第 i 个 id。
// 本插件复刻这段排序，就能稳定算出「要隐藏的 id」落在第几个子元素上。

window.__ModuleLoader__.load({
  id: 'dsh-sidebar-tidy',
  factory(require) {
    const NS = 'sidebar-tidy'
    const SLOT = 'sidebar.panellist'
    const MARK = 'data-sidebar-tidy'

    // 要隐藏的侧栏条目。改这里后需要重载插件（set_plugin 关-开）。
    //   plugins    = 「插件」
    //   dsh-market = 「插件市场」（更推荐用它自己的官方开关，见 cordis.patch.yml 注释）
    const HIDE_IDS = ['plugins']

    // 每个 id 允许出现的 aria-label，用于「顺序算错时别乱隐藏」的保险。
    // 命中其一才隐藏；都不命中就跳过并打日志。
    const EXPECTED_LABELS = {
      plugins: ['插件', 'plugins', 'plugin', 'Plugin manager'],
      'dsh-market': ['插件市场', 'plugins market', 'market', 'plugin market'],
    }

    const norm = (s) => String(s == null ? '' : s).trim().toLowerCase()

    function expectedFor(id) {
      const list = EXPECTED_LABELS[id]
      return list ? list.map(norm) : null
    }

    // 复刻 ui-sidebar syncPanels 的顺序
    function orderedIds(ctx) {
      let entries
      try {
        entries = ctx.slots.entriesOfSlot(SLOT)
      } catch (err) {
        return []
      }
      if (!entries || !entries.length) return []
      const seen = new Set()
      const rows = []
      for (const entry of entries) {
        const options = (entry && entry.options) || {}
        const id = options.id
        if (typeof id !== 'string' || seen.has(id)) continue
        seen.add(id)
        rows.push({ id, order: options.order == null ? 0 : options.order })
      }
      rows.sort((a, b) => a.order - b.order)
      return rows.map((r) => r.id)
    }

    // 找侧栏那个 nav：子元素都是「带 aria-label 的按钮行」的那个。
    function findPanelNav() {
      let best = null
      const navs = document.querySelectorAll('nav')
      for (const nav of navs) {
        const kids = Array.from(nav.children)
        if (!kids.length) continue
        const allRows = kids.every(
          (el) => el && el.querySelector && el.querySelector('button[aria-label]'),
        )
        if (!allRows) continue
        if (!best || kids.length > best.children.length) best = nav
      }
      return best
    }

    function rowLabel(el) {
      const btn = el && el.querySelector && el.querySelector('button[aria-label]')
      return btn ? btn.getAttribute('aria-label') : null
    }

    function unhide(el) {
      if (!el.hasAttribute(MARK)) return
      el.style.removeProperty('display')
      el.removeAttribute(MARK)
    }

    function hide(el) {
      if (el.getAttribute(MARK) === 'hidden') return
      el.setAttribute(MARK, 'hidden')
      el.style.setProperty('display', 'none', 'important')
    }

    function apply(ctx) {
      const ids = orderedIds(ctx)
      const nav = findPanelNav()
      if (!nav) return
      const kids = Array.from(nav.children)

      // 长度对不上说明拿到的快照和 DOM 不同步（或宿主升级改了结构），
      // 这种情况下宁可不动，也不要把错的行隐藏掉。
      if (ids.length !== kids.length) {
        // 先把之前标记过、但现在已经不该隐藏的恢复回来
        kids.forEach(unhide)
        return
      }

      const targets = new Set()
      for (const id of HIDE_IDS) {
        const idx = ids.indexOf(id)
        if (idx < 0) continue
        const label = rowLabel(kids[idx])
        const allowed = expectedFor(id)
        if (allowed && label != null && !allowed.includes(norm(label))) {
          // 顺序可能对不上，跳过这一行
          if (typeof console !== 'undefined') {
            console.warn(
              '[sidebar-tidy] skip hiding "' + id + '": row ' + idx +
                ' has label "' + label + '", expected one of ' + allowed.join(' / '),
            )
          }
          continue
        }
        targets.add(idx)
      }

      kids.forEach((el, i) => (targets.has(i) ? hide(el) : unhide(el)))
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.effect(() => {
          let timer = 0
          const schedule = () => {
            if (timer) return
            timer = setTimeout(() => {
              timer = 0
              try {
                apply(ctx)
              } catch (err) {
                // 纯装饰逻辑，出错不影响宿主
              }
            }, 16)
          }

          // 1) 首屏
          schedule()

          // 2) DOM 变化（React 重渲染 / 折叠展开 / 语言切换都会重建行）
          let observer = null
          if (typeof MutationObserver !== 'undefined' && document.body) {
            observer = new MutationObserver(schedule)
            observer.observe(document.body, {
              childList: true,
              subtree: true,
            })
          }

          // 3) 槽位变化（插件装卸导致条目增减 / 顺序变化）
          const offSlot = ctx.slots.subscribe(SLOT, schedule)

          // 4) 语言变化（label 文案会变，用于保险校验）
          let offLocale = null
          try {
            if (ctx.locale && typeof ctx.locale.subscribe === 'function') {
              offLocale = ctx.locale.subscribe(schedule)
            }
          } catch (err) {
            /* locale 可选 */
          }

          return () => {
            if (timer) {
              clearTimeout(timer)
              timer = 0
            }
            if (observer) observer.disconnect()
            if (typeof offSlot === 'function') offSlot()
            if (typeof offLocale === 'function') offLocale()
            // 插件卸载时把标记恢复，别留下隐藏的行
            document.querySelectorAll('[' + MARK + ']').forEach((el) => {
              el.style.removeProperty('display')
              el.removeAttribute(MARK)
            })
          }
        }, 'sidebar-tidy: hide sidebar rows')
      },
    }
  },
})
