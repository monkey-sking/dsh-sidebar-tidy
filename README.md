# dsh-sidebar-tidy

<!-- badges:start -->
[![Stars](https://img.shields.io/github/stars/monkey-sking/dsh-sidebar-tidy?style=flat-square)](https://github.com/monkey-sking/dsh-sidebar-tidy/stargazers) [![Forks](https://img.shields.io/github/forks/monkey-sking/dsh-sidebar-tidy?style=flat-square)](https://github.com/monkey-sking/dsh-sidebar-tidy/network/members) [![Last commit](https://img.shields.io/github/last-commit/monkey-sking/dsh-sidebar-tidy?style=flat-square)](https://github.com/monkey-sking/dsh-sidebar-tidy/commits/main) [![License](https://img.shields.io/github/license/monkey-sking/dsh-sidebar-tidy?style=flat-square)](https://github.com/monkey-sking/dsh-sidebar-tidy/blob/main/LICENSE) [![Language](https://img.shields.io/github/languages/top/monkey-sking/dsh-sidebar-tidy?style=flat-square)](https://github.com/monkey-sking/dsh-sidebar-tidy/search?l=)
<!-- badges:end -->

隐藏 DSH 侧边栏里用不上的面板入口（默认藏「插件」那一行）。

**只做视觉隐藏，不卸载任何宿主插件** —— 被藏起来的插件照常加载、照常工作。

## 为什么需要它

`sidebar.panellist` 的注册选项只有 `{ id, order, label }`，**没有 `hidden` / `visible` 字段**；
宿主 `ui-sidebar` 的 `syncPanels()` 直接遍历 `ctx.slots.entriesOfSlot('sidebar.panellist')`
生成列表，也没有提供任何过滤 API（`ctx.slots` 只有 `register` / `registerFactory` / `inject`）。

所以只能从浏览器侧动手。

## 怎么做的

不是靠选择器猜，而是**复刻宿主的排序逻辑**再按位置隐藏：

```
ui-sidebar: panels = entriesOfSlot('sidebar.panellist')
                      .map(({options}) => ({id, order, label}))
                      .sort((a, b) => a.order - b.order)
            <nav>{panels.map(p => <PanelRow key={p.id} .../>)}</nav>
```

即 `nav` 的第 i 个子元素 === 按 `order` 排序后的第 i 个 id。
本插件算同一份排序结果，把目标 id 的下标对应到 DOM 子元素上，`display: none !important`。

**两道保险**：

1. 算出的 id 数量与 `nav` 子元素数量**不一致时，一行都不藏**（宁可不动，不藏错行）；
2. 即使下标对上了，还要校验该行的 `aria-label` 是否在预期列表里，
   对不上就跳过并打 `console.warn`。

React 重渲染会重建节点，所以用 `MutationObserver` 盯着 `document.body`，
变了就重新扫一遍；同时订阅 `sidebar.panellist` 槽位变化和 locale 变化（label 文案会变）。

## 配置

改 `client.js` 顶部的 `HIDE_IDS`：

```js
const HIDE_IDS = ['plugins']
```

- `plugins` → 「插件」
- `dsh-market` → 「插件市场」（**更推荐用它自己的官方开关**，见 `cordis.patch.yml` 注释）

改完需要重载插件（`set_plugin` 关-开，或刷新页面）。

## 已知限制

- 纯视觉 hack。宿主升级改了侧边栏 DOM 结构后，选择器可能失效 ——
  表现是「藏不住了」，**不会报错、不会崩**。
- 隐藏行对屏幕阅读器也只是隐藏，不影响实际功能可达性（菜单里仍能进）。

## License

MIT
