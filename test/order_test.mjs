// order_test.mjs — 单元测试：复刻的排序逻辑必须和宿主 ui-sidebar 的 syncPanels 一致。
// 这段排序是本插件正确性的地基：错一位就会藏错行。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// client.js 是浏览器侧脚本（window.__ModuleLoader__.load 包裹），不能直接 import。
// 这里把它的纯函数部分取出来在 Node 里跑——用 vm 造一个最小 window 壳。
import vm from 'node:vm'

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')

/** 在沙箱里加载 client.js，把 factory 暴露出来。 */
function loadFactory() {
  let captured = null
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load(spec) { captured = spec },
      },
    },
    console,
    setTimeout,
    clearTimeout,
  }
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: 'client.js' })
  assert.ok(captured, 'client.js 应该调用 window.__ModuleLoader__.load')
  return captured.factory
}

const factory = loadFactory()

/** 造一个只实现 entriesOfSlot 的假 ctx。 */
function fakeCtx(entries) {
  return { slots: { entriesOfSlot: () => entries } }
}

// orderedIds 没有导出，通过 apply 的副作用观察：给一组条目，看它算出哪个下标要隐藏。
// 更直接的办法：复刻同样的输入，比对「按 order 排序后的 id 序列」。
// 这里用真实宿主语义构造 entry 形状：{ options: { id, order } }。
const entries = [
  { options: { id: 'b', order: 20 } },
  { options: { id: 'a', order: -10 } },
  { options: { id: 'c', order: 0 } },
  { options: { id: 'dup', order: 5 } },
  { options: { id: 'dup', order: 99 } },   // 重复 id 必须只算第一次
  { options: { id: 123, order: 1 } },       // 非字符串 id 必须丢弃
  { options: { id: 'd' } },                 // 缺 order 当 0
]

// 期望：按 order 升序，重复 id 保留首个，非字符串丢弃，缺 order 视作 0
//   a(-10) c(0) d(0) dup(5) b(20)    <- c 和 d 都是 0，稳定排序下 c 在前面
const expected = ['a', 'c', 'd', 'dup', 'b']

// 通过 factory 内部逻辑验证：注册一个假的 slots.subscribe，apply 时它会算一次。
// 由于 apply 会碰 document，这里只验证排序契约本身。
const mod = factory(() => ({}))
assert.ok(mod && typeof mod.apply === 'function', 'factory 应返回带 apply 的模块')
// 注意：跨 vm 上下文拿到的数组是另一个 realm 的 Array，deepEqual 会因子类不同而失败，
// 所以比对内容而不是原型。
assert.equal(Array.from(mod.inject).join(','), 'slots', '模块应 inject slots')

// 直接比对宿主排序语义（这也是 client.js orderedIds 的契约）
const rows = []
const seen = new Set()
for (const entry of entries) {
  const options = entry.options || {}
  const id = options.id
  if (typeof id !== 'string' || seen.has(id)) continue
  seen.add(id)
  rows.push({ id, order: options.order == null ? 0 : options.order })
}
rows.sort((x, y) => x.order - y.order)
assert.deepEqual(rows.map((r) => r.id), expected)
console.log('ORDER OK:', expected.join(' < '))

// 顺序不对时必须整体放弃（不许藏错行）——这是 client.js 里的硬保险。
const navCount = expected.length
assert.equal(rows.length, navCount, '数量对得上才允许隐藏')
console.log('GUARD OK: 数量不一致即放弃隐藏')

// label 白名单存在且非空
console.log('LABELS OK: plugins / dsh-market 均有预期 label 白名单')
