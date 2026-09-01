# dsh-rule-engine-client

DeepSeek Harness (DSH) 规则引擎的浏览器端（client bundle）：**回合末裁决卡片**。

## 这是什么

规则引擎（dsh-rule-engine）在拦截工具调用时，会在回合末生成一份「裁决摘要」。本包在会话流中把它渲染成一张可交互小卡片：

- 卡片内容：你的原文、被拦的工具与原因、命中规则编号；
- 两个按钮：**✅ 拦对了** / **❌ 拦错了**——点选即登记判例；
- ❌（拦错了）会同时记录命令指纹：同类命令下次直接放行（与 `/guard label ... incorrect` 同链路，可通过 `/guard label clear <指纹>` 撤销）；
- ✅ / ❌ 状态可反复切换；重复点击幂等。
- ✅ / ❌ **判定登记为一次性**（2026-09-02 起实际语义）：选择后按钮锁定，不能再改（详见下节「判例一次性语义」）。

## 判例一次性语义（为什么不可反复切换）

判例登记影响引擎的**学习放行**：❌（拦错了）会写入命令指纹——同类命令下次直接放行。这是有后果的"定案"操作，不是普通反馈：

- **点选即锁定**：✅/❌ 登记后按钮禁用，不能再改判；
- **为什么**：随意反复切换会把"学习放行"这种影响行为的后果变成可误操作的对象（误点 ❌ → 同指纹命令被放行 → 需再次撤销才恢复）；
- **改判途径**：确需改判时使用 `/guard label <ERR-码> <correct|incorrect>` 命令（或 `/guard label clear <指纹>` 撤销指纹放行）——命令行是有明确意图的操作，保留为改判通道；
- 与 `/guard label ... incorrect` 同链路：卡片 ❌ 与命令行为一致。

## 多次裁决（同一回合多条）

同一回合多次被拦 → **一张卡片内逐条分组显示**：每条独立展开/收起、**独立 ✅/❌**（不共用一对按钮）、独立一次性锁定（一条的判定不影响其他条）；标题显示已判进度（如"已判 2/3（✅1，❌1）"）。

## 持久化（重启不丢）

卡片与判例登记**落盘**到 `~/.dsh/rule-engine-turn-cards.json`（上限 200 条）——重启 DSH 后历史裁决按钮/判例状态依然存在（判例=教学数据，不因进程重启丢失）。

## 开关

默认**关闭**（面向大众/通用性——用户按需打开）。设置页「规则、命令与技能 → 规则引擎」页签中与「任务契约」同组的「回合末裁决卡片」开关控制；关闭时卡片不显示、也不产生任何远程调用开销。

## 装配

本包是 client 插件（`dsh.client.platform: web`），通过 profile 的 `dsh-rule-engine` 组合（bundle patch）或等效装配挂载；宿主为 `dsh-rule-engine`（host 端，≥0.5.15）。

## 契约要点（手写 bundle）

- 槽位：`conversation.chat.assistant-actions`（list，多 entry 共存；官方 feedback 为 order 10，本卡片 order 20）；
- Remote：`ruleEngine.getTurnCard(messageId)` / `ruleEngine.rateTurnCard(messageId, verdict, expectedVerdict)`；
- 组件为 React 函数组件、`react.createElement` 构建（无 JSX 构建链）；
- 无卡片 / 开关关闭 / 拉取失败 → 渲染 null（静默，不占位、不报错）。
