// dsh-rule-engine-client —— host 面入口（占位）
// 浏览器 bundle 由 dsh-client-modules 根据 package.json 的 dsh.client 声明
// 单独发现并 serve（/plugins/dsh-rule-engine-client/client.js），此文件只是
// 让 loader 能加载本包（空插件）。
export const name = "dsh-rule-engine-client";

export function apply() {
	// host 面无职责：所有逻辑在 client.js（回合末裁决卡片 + 设置页开关）
}
