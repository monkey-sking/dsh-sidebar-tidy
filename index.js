// dsh-sidebar-tidy — 宿主半
//
// 这个包只做浏览器侧的视觉瘦身（见 client.js），宿主侧没有要跑的东西。
// 保留一个空 apply，是为了让 Cordis 正常把它当作一个插件加载，
// 从而让它的 client 半被 cordis-client-runner 送到浏览器。

export const name = 'sidebar-tidy'

export const inject = []

export function apply(ctx, config = {}) {
  if (config && config.enabled === false) return
  // 宿主侧无行为：真正的逻辑在 client.js
}
