# dsh-rules-manager（规则、命令与技能管理）

![license](https://img.shields.io/github/license/jilian-dsh/dsh-rules-manager)
![version](https://img.shields.io/badge/version-1.4.1-blue)
![node](https://img.shields.io/badge/node-%3E%3D22-green)
![topic](https://img.shields.io/badge/topic-dsh--plugin-blue)
![lang](https://img.shields.io/badge/lang-中文%20%7C%20English-lightgrey)

> DeepSeek Harness（DSH）的规则、命令与技能管理插件：**/rules 斜杠命令** + 设置页**「规则、命令与技能」面板**（可视化编辑规则、查看命令清单、**自定义你自己的命令**（支持禁用/启用）、**管理技能**（查看/禁用/启用/删除进回收站）、**备份与一键恢复**）。
>
> ⚡ 规则保存在 `$DSH_HOME/AGENTS.md`，任何修改**实时生效**（DSH 自动热加载），每次修改前**自动备份**，可随时**一键恢复到任意备份时刻**。

## ✨ 功能

| 能力 | 入口 | 说明 |
|---|---|---|
| 列出 / 查看 / 新增 / 修改 / 删除 / **禁用 / 恢复**规则 | `/rules` 命令 或 设置→规则、命令与技能 | 规则 = 用户全局规则（AGENTS.md），按分区组织，全文可视化编辑 |
| 命令清单 | 设置→规则、命令与技能 →「命令」 | 只读展示所有可用斜杠命令（名称/说明/用法） |
| **自定义命令** | 设置→规则、命令与技能 →「自定义命令」 | 你自己定义快捷指令：在聊天框输入 `/名字`，把预设内容发送给 AI 执行；**支持带参数**（见下）；**支持禁用/启用**（禁用后斜杠命令停用、内容保留、随时恢复） |
| **技能管理** | 设置→规则、命令与技能 →「技能」 | 查看已安装技能（名称+简介+全文）、**禁用**（移出技能目录，内容原样保留）、**启用**（原样搬回）、**删除**（移入回收站 `~/.dsh/.backups/trash-<时间戳>/`，随时可恢复）；禁用/删除需重启 DSH 后完全生效 |
| **备份与恢复** | 设置→规则、命令与技能 →「备份与恢复」 | 查看所有自动备份（时间 / 规则条数 / 大小），一键恢复到某个备份时刻；打开本页时自动把超出的旧备份移入回收站（保留最近 5 份） |

### 使用示例

```
/rules                    列出全部规则
/rules show 2             查看规则 2 全文
/rules add 我的规则｜这是正文  新增规则（｜ 分隔标题和正文，全角半角均可）
/rules edit 2 新正文       修改规则 2 正文
/rules delete 3           删除规则 3（编号不复用）
```

自定义命令：设置页定义 `hello` = "请热情地欢迎我"，聊天框输入 `/hello` 即可触发。

### 自定义命令带参数（迭代③）

命令名后面可以跟**参数**，参数会拼进预设内容再发给 AI。规则 3 条：

1. **预设内容里写了 `{input}`** → 参数整体替换到每个 `{input}` 位置（可多处使用）；**该命令不带参数时会提示用法，不发送残缺内容**；
2. **没写 `{input}` 且有参数** → 参数自动追加到预设内容末尾（换行分隔）；
3. **没写 `{input}` 且不带参数** → 只发预设内容本身（和之前行为完全一致，老命令不受影响）。

```
预设：请用一句话总结：{input}
输入：/summarize 本周工作进展
发送：请用一句话总结：本周工作进展

预设：请生成周报
输入：/weekly-report 本月收入 5 万
发送：请生成周报
     本月收入 5 万        ← 参数自动追加到末尾

预设：请热情地欢迎我
输入：/hello             ← 不带参数
发送：请热情地欢迎我
```

## 🛡️ 安全设计

- **自动备份**：每次修改 AGENTS.md 前，完整备份到 `$DSH_HOME/.backups/AGENTS.md-<时间戳>.bak`，时间戳含毫秒，同一秒内连续操作也不会互相覆盖；
- **保留最近 5 份（移入回收站）**：自动保留最近 5 份备份；超出部分**移入回收站**（`.backups/trash-<时间戳>/`，可恢复，不永久删除）。打开「备份与恢复」页时也会自动执行一次超额清理；
- **一键恢复（双保险）**：恢复备份时，先把当前 AGENTS.md **再自动备份一份**再写回——恢复错了也能随时退回，永远不会丢数据；
- **删除不改编号**：删除规则后其余编号不变，避免引用错乱；
- **命令名冲突防护**：自定义命令与系统命令（/rules、/compact 等）同名会被拒绝；
- **命令名规范**：只能小写字母、数字、连字符或下划线（`/^[a-z][a-z0-9_-]*$/`）；
- **参数拼装**：预设内容里的 `{input}` 占位符会被命令后输入的内容替换（可多处使用）；没写 `{input}` 时参数自动追加到预设末尾（换行分隔）；含 `{input}` 的命令不带参数会提示用法（不发送残缺内容），不含 `{input}` 的命令不带参数则只发预设内容（兼容旧行为）。
- **技能管理防乱序**：技能以目录名为唯一标识，无编号无分区——禁用=整目录移走、启用=原样搬回、删除=整目录进回收站，不存在"插回排序"逻辑，天然不会乱序；启用时目标已存在会被拒绝（绝不覆盖）；技能名仅限字母/数字/连字符/下划线（防路径穿越）。
- **命令禁用防乱序**：禁用/启用只改 `commands.json` 条目上的 `disabled` 字段，不搬移、不改列表顺序。

## ⚠️ 已知问题与踩坑

- **投递消息必须带 `id`**（严重，已修复）：早期版本自定义命令投递给 AI 的用户消息缺 `id` 字段，会写坏 DSH 会话日志、**锁死整个会话历史**（`history unavailable … lacks an identified message`）。修复：消息补 `id: randomUUID()`，测试已加 id 断言。
- **这是 DSH 自身的机制缺口**：写入路径（`agent.followup`→`inbox.splice`、`session.append`）对消息 `id` 零校验，加载路径（`Session.fromRestore → assertMessageEventShape`）严格校验——不对称导致坏数据落盘后整会话拒载。已反馈官方：https://github.com/deepseek-ai/deepseek-harness/discussions/1121
- 详细排查与修复记录见 [`docs/dsh-session-message-id-bug.md`](../docs/dsh-session-message-id-bug.md)。

## 📦 安装

### 方式一：bundle 一键安装（推荐，标准 DSH 插件）

`dsh-rules-manager` 是符合官方规范的 **bundle 包**（package.json 声明 `dsh.bundle`，包内自带 `cordis.patch.yml`），可通过官方插件命令一键安装：

```sh
dsh plugin --profile web add dsh-rules-manager
```

dsh 会自动：安装本包及其依赖（含配套面板 `dsh-rules-manager-client`）、把本包追加进该 profile 的 `dsh.profile.bundles`、加载包内 `cordis.patch.yml` 挂载三个插件行（host 命令 / Remote 服务 / client 面板）。重启 DSH 后设置页出现「规则、命令与技能」，聊天框可用 `/rules`。

卸载：

```sh
dsh plugin --profile web remove dsh-rules-manager
```

> 本 bundle 同时满足插件市场（如 DSH Creative Workshop 类目录）的 `dsh.bundle.patch` 结构验证收录条件。

### 方式二：npm 安装 + 手动装配（自动管理依赖，保持原装配方式）

本插件发布在 npm，包名 `dsh-rules-manager`（配套面板 `dsh-rules-manager-client`）：

```sh
# 在 $DSH_HOME/profiles/web 目录下安装（或你配置的插件目录）
npm install dsh-rules-manager dsh-rules-manager-client
```

然后在 `$DSH_HOME/profiles/web/cordis.patch.yml` 装配（见下方「DSH 插件装配三步」第 2 步，host 引用改成 npm 包名），重启 DSH 即可。

> 注：npm 包与下方「拷贝」方式内容一致，二选一即可；DSH 依赖（`@deepseek-ai/*`）会自动按 peerDependencies 解析。

### 方式三：源码拷贝（DSH 插件装配三步）

本仓库包含两个包，都需要装配：

1. **拷贝**：把 `dsh-rules-manager/` 放到 `$DSH_HOME/profiles/web/` 下；把 `dsh-rules-manager-client/` 放到 `$DSH_HOME/profiles/node_modules/` 下；
2. **装配**：在 `$DSH_HOME/profiles/web/cordis.patch.yml` 追加：

   ```yaml
   - insert:
       - id: rules-manager
         name: './rules-manager/index.js'
       - id: rules-manager-service
         name: './rules-manager/service.js'
       - id: rules-manager-client
         name: 'dsh-rules-manager-client'
   ```

3. **重启** DSH（Electron 窗口 ✕ → 重新打开）。设置页出现「规则、命令与技能」，聊天框可用 `/rules`。

> 说明：client 包必须放在 `profiles/node_modules/`（DSH 的 client 插件发现机制按 npm 包名解析）；依赖通过 `profiles/node_modules` 的 junction 森林解析 DSH 自带包。

## 🏗️ 架构

```
dsh-rules-manager/              host 插件（纯 Node，无需构建）
├── index.js                    /rules 斜杠命令（聊天框管理规则）
├── service.js                  Remote 服务（TypertRemoteService，供设置面板调用）
├── rules-core.js               共享核心：AGENTS.md 解析 / 备份 / 增删改
dsh-rules-manager-client/       client 插件（浏览器 bundle）
├── index.js                    host 面占位入口
└── client.js                   设置页「规则、命令与技能」面板（手写 __ModuleLoader__ bundle）
```

- host 端定位 home 用 `@deepseek-ai/dsh-home-paths` 的 `resolveDshHome()`；
- client→host 通过 Typert Remote：`ctx.remote.$mount({package, descriptors})` + `ctx.get("remote.rulesManager")`；
- 自定义命令执行时用 `invocation.agent.followup(message)` 把预设内容投递给 AI（官方投递通道）。

## 🧪 开发与测试

```sh
node test-service.js   # 73 项断言：Remote 标记 + 规则 CRUD + 用户命令（含参数）+ 备份恢复（隔离环境）
node test-local.js     # 16 项断言：/rules 命令全场景（隔离环境）
```

两个测试都用**临时 DSH_HOME + AGENTS.md 副本**，不触碰真实文件。

## 📄 许可证

[MIT](LICENSE)。版权 (c) 2026 季涟。

---

*本项目为社区插件，与 DeepSeek Harness 官方仓库相互独立。发现方式：GitHub 话题 `dsh-plugin`。*
