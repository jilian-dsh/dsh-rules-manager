# DSH 会话历史锁死 Bug：message.id 校验不对称

> 记录日期：2026-08-14 ｜ 状态：已修复（插件侧）+ 已反馈官方（GitHub Discussions）
> 关联反馈帖：https://github.com/deepseek-ai/deepseek-harness/discussions/1121

本插件（`dsh-rules-manager`）在真实使用中触发了一个 DSH 会话持久化的严重缺陷：**一条缺少 `message.id` 的用户消息事件，会导致整个会话历史永久无法加载**。本文记录完整排查过程、根因、修复与验证，以及对 DSH 官方的反馈。

---

## 1. 问题现象

DSH 打开某会话时，历史加载失败：

```
history unavailable for session "session-xxxx":
SessionPersistenceCorruptionError: stored session failed validation:
Error: session event at seq 440160 lacks an identified message
```

- 会话日志共 **508,525 条事件**，仅 **1 条**（seq 440160）损坏，其余全部完好；
- 但加载校验是"全有或全无"——单条坏事件导致**整个会话**无法读取，`request/header` 等后续正常事件全部不可达；
- 会话标题、统计等元数据（`session_projcache.json`）不受影响，但历史文本完全不可见。

## 2. 根因：DSH 写入路径与加载路径的校验不对称

### 2.1 写入路径（零校验）

插件命令 handler 通过官方投递通道发送用户消息：

```js
invocation.agent.followup(message);
```

DSH 实现（`packages/core/agent-loop`）：

```js
send(message, target, wakeup) {
    this.inbox.splice(resolvedTarget, Infinity, 0, [message]);   // 原样入队，零校验
}
followup(input) { this.send(input, "next-turn", true); }
```

- `Agent.followup()` → `inbox.splice()` 对消息**不校验 `message.id`**；
- `session.append()` 只校验 JSON 可序列化，同样**不校验消息身份**；
- 因此一条缺 `id` 的 `user/message` 事件会被**静默持久化**到 `session.jsonl.zstd`。

### 2.2 加载路径（严格校验）

恢复会话时（`packages/core/session`）：

```js
function assertMessageEventShape(event, subject) {
    const message = type === "user/message" ? record : record?.["message"];
    if (typeof message !== "object" || message === null
        || typeof message["id"] !== "string" || message["id"] === "") {
        throw new Error(`${subject} lacks an identified message`);   // 严格：id 必须非空
    }
    ...
}
```

- `Session.fromRestore()` 对每条消息事件**强制要求非空 `message.id`**；
- 坏事件位于**已提交的日志前缀**中，崩溃恢复逻辑不会截断它，于是整个会话被拒载。

### 2.3 一句话

> **写入宽松（不查 id）、加载严格（必查 id）的不对称**，让缺 id 的坏事件能在写入时蒙混过关，事后一次性引爆，锁死整个会话历史。

## 3. 事件证据（本机真实日志）

| seq | 类型 | 内容 |
|---|---|---|
| 440154 | `command/run` | 自定义命令 `hello` 被触发 |
| 440155 | `agent/inbox/spliced` | 插入的消息对象：`{role, content, source}` —— **无 id** |
| 440158 | `command/done` | "已发送自定义命令「hello」的预设内容给 AI。" |
| 440160 | `user/message` | 内容「和我打个招呼吧，介绍一下你自己」，data **缺 `id`**（对比正常消息 seq 7 有 `id: "b928f044-..."`） |

正常 GUI 消息的 `source` 带 `rpcId`（客户端生成）；命令注入的消息 `source` 只有 `{kind:"user"}` 且无 `id`，来源特征与 GUI 消息明显不同。

## 4. 修复（插件侧）与验证

### 4.1 修复

`service.js` 命令 handler 构造消息时补上 `id`：

```js
// 修复前（触发 bug）
const message = { role: "user", content: [{ type: "text", text: cmd.prompt }], source: { kind: "user" } };

// 修复后
import { randomUUID } from "node:crypto";
const message = {
    id: randomUUID(),                                  // ← 消息必须带 id！
    role: "user",
    content: [{ type: "text", text: cmd.prompt }],
    source: { kind: "user" }
};
```

### 4.2 验证

- `test-service.js` 新增 **id 断言**（"投递了用户消息（含 id）"、"更新后投递新内容（含 id）"），44 项断言全过；
- 两个版本文件（生效版 `~/.dsh/profiles/web/rules-manager/service.js` 与源码版 `oss/dsh-rules-manager/service.js`）SHA-256 一致；
- ESM 语法检查通过。

### 4.3 已损坏会话数据的恢复

对已被坏事件锁死的会话，可按以下流程无损修复（本机已实测）：

1. 按 RFC 8878 扫描 `session.jsonl.zstd` 的 zstd 帧边界（魔数 `28 B5 2F FD`），逐帧解压为 JSONL（注意 `node:zlib` 的 `zstdDecompressSync` **只解首帧**）；
2. 定位缺 id 的消息事件，补 `id: crypto.randomUUID()`，其余事件原样保留；
3. 重新压缩（带 checksum 的 zstd frame），用 `Session.fromRestore` 验证可加载。

> 完整脚本见本仓库配套排查目录（`_session-repair/`，位于开发工作区，未纳入本仓库发布）。

## 5. 对插件作者的防范建议

- **务必使用 DSH 官方消息构造器** `createUserMessage()`（`@deepseek-ai/dsh-llm`），它自动生成 `id: crypto.randomUUID()` 并冻结消息；
- 手动构造消息时**必须包含非空 `id`**，`role/content/source` 缺一不可；
- 任何 `agent.followup / send / steer / inject` 投递的消息，先自检 `typeof message.id === "string" && message.id !== ""`。

## 6. 官方反馈（已发布）

- **状态**：已发布 ｜ **日期**：2026-08-14
- **帖子**：https://github.com/deepseek-ai/deepseek-harness/discussions/1121
- **渠道说明**：DeepSeek Harness 官方 [CONTRIBUTING.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/CONTRIBUTING.md) 明确：**不接受外部 PR**、**不开放 issue**，反馈/bug 报告请走 **GitHub Discussions**（发帖 + upvote）。

### 帖子正文存档（英文）

> **Title**: `[Bug] A plugin appending user/message without message.id permanently bricks the session history`
>
> **Summary**
> A single malformed `user/message` event (missing `message.id`) can permanently block an entire session's history from loading: the session fails with `SessionPersistenceCorruptionError ... session event at seq N lacks an identified message`. We hit this in a real session (508k events; one bad event at seq 440160).
>
> **Root cause — write/load validation asymmetry**
> - Write path: `Agent.followup()` → `send()` → `inbox.splice()` (packages/core/agent-loop) performs **no validation** of `message.id`; `session.append` only checks JSON-serializability. A `user/message` without `id` is silently persisted.
> - Load path: `Session.fromRestore()` → `assertMessageEventShape()` (packages/core/session) **strictly requires** a non-empty `message.id`. Because the bad event sits inside an already-committed prefix, the whole session refuses to load; the only recovery is manual log surgery.
>
> **Reproduction**
> 1. Any plugin registers a command whose handler calls `agent.followup({ role: "user", content: [...], source: { kind: "user" } })` without an `id` (easy in plain JS — the `UserMessage` type is not enforced at runtime).
> 2. Run the command in a session.
> 3. Restart DSH and reopen the session → "history unavailable … lacks an identified message".
>
> **Suggested fixes**
> 1. Validate `message.id` on the write path (in `Agent.followup`/`send`, or in `session.append` for message events), matching the load-time invariant — turn silent data corruption into a loud, early error.
> 2. Optionally, make the load path resilient: skip/quarantine a single malformed message event with a warning instead of refusing the whole log.
>
> **Workaround for plugin authors**: always build messages with `createUserMessage()` (from `@deepseek-ai/dsh-llm`) or include `id: crypto.randomUUID()`.
>
> **Environment**: DSH 0.1.0-rc.6 (npm), Windows, web profile.

> **中文摘要**：发现 DSH 写入/加载校验不对称的 bug——`agent.followup` 和 `session.append` 对消息 `id` 零校验，而加载历史时严格校验 `message.id` 非空。插件构造消息漏写 id 会让坏事件落盘，最终锁死整个会话历史（实测：50.8 万事件中仅 1 条坏事件即可导致全部历史无法加载）。建议：① 写入路径补校验（与加载对齐）；② 加载路径对单条坏事件容错。插件作者应使用官方 `createUserMessage()`（自动生成 id）。

## 7. 参考

- 官方仓库：https://github.com/deepseek-ai/deepseek-harness
- 官方 CONTRIBUTING：https://github.com/deepseek-ai/deepseek-harness/blob/master/CONTRIBUTING.md
- 官方 README（Community and support）：https://github.com/deepseek-ai/deepseek-harness
- 官方反馈（Discussions）：https://github.com/deepseek-ai/deepseek-harness/discussions
- 官方 Discord：https://discord.gg/Ycq5dCaS4
- 本插件（发现方式：GitHub 话题 `dsh-plugin`）：https://github.com/jilian-dsh/dsh-rules-manager
