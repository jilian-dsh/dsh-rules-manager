# dsh-rules-manager（规则与命令管理）

![license](https://img.shields.io/github/license/jilian-dsh/dsh-rules-manager)
![version](https://img.shields.io/badge/version-1.0.0-blue)
![node](https://img.shields.io/badge/node-%3E%3D22-green)
![topic](https://img.shields.io/badge/topic-dsh--plugin-blue)
![lang](https://img.shields.io/badge/lang-中文%20%7C%20English-lightgrey)

> DeepSeek Harness（DSH）的规则与命令管理插件：**/rules 斜杠命令** + 设置页**「命令与规则」面板**（可视化编辑规则、查看命令清单、**自定义你自己的命令**）。
>
> ⚡ 规则保存在 `$DSH_HOME/AGENTS.md`，任何修改**实时生效**（DSH 自动热加载），每次修改前**自动备份**。

## ✨ 功能

| 能力 | 入口 | 说明 |
|---|---|---|
| 列出 / 查看 / 新增 / 修改 / 删除规则 | `/rules` 命令 或 设置→命令与规则 | 规则 = 用户全局规则（AGENTS.md），按分区组织，全文可视化编辑 |
| 命令清单 | 设置→命令与规则 →「命令」 | 只读展示所有可用斜杠命令（名称/说明/用法） |
| **自定义命令** | 设置→命令与规则 →「自定义命令」 | 你自己定义快捷指令：在聊天框输入 `/名字`，把预设内容发送给 AI 执行 |

### 使用示例

```
/rules                    列出全部规则
/rules show 2             查看规则 2 全文
/rules add 我的规则｜这是正文  新增规则（｜ 分隔标题和正文，全角半角均可）
/rules edit 2 新正文       修改规则 2 正文
/rules delete 3           删除规则 3（编号不复用）
```

自定义命令：设置页定义 `hello` = "请热情地欢迎我"，聊天框输入 `/hello` 即可触发。

## 🛡️ 安全设计

- **自动备份**：每次修改 AGENTS.md 前，完整备份到 `$DSH_HOME/.backups/AGENTS.md-<时间戳>.bak`，保留最近 **5 份**；
- **删除不改编号**：删除规则后其余编号不变，避免引用错乱；
- **命令名冲突防护**：自定义命令与系统命令（/rules、/compact 等）同名会被拒绝；
- **命令名规范**：只能小写字母、数字、连字符或下划线（`/^[a-z][a-z0-9_-]*$/`）。

## 📦 安装（DSH 插件装配三步）

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

3. **重启** DSH（Electron 窗口 ✕ → 重新打开）。设置页出现「命令与规则」，聊天框可用 `/rules`。

> 说明：client 包必须放在 `profiles/node_modules/`（DSH 的 client 插件发现机制按 npm 包名解析）；依赖通过 `profiles/node_modules` 的 junction 森林解析 DSH 自带包。

## 🏗️ 架构

```
dsh-rules-manager/              host 插件（纯 Node，无需构建）
├── index.js                    /rules 斜杠命令（聊天框管理规则）
├── service.js                  Remote 服务（TypertRemoteService，供设置面板调用）
├── rules-core.js               共享核心：AGENTS.md 解析 / 备份 / 增删改
dsh-rules-manager-client/       client 插件（浏览器 bundle）
├── index.js                    host 面占位入口
└── client.js                   设置页「命令与规则」面板（手写 __ModuleLoader__ bundle）
```

- host 端定位 home 用 `@deepseek-ai/dsh-home-paths` 的 `resolveDshHome()`；
- client→host 通过 Typert Remote：`ctx.remote.$mount({package, descriptors})` + `ctx.get("remote.rulesManager")`；
- 自定义命令执行时用 `invocation.agent.followup(message)` 把预设内容投递给 AI（官方投递通道）。

## 🧪 开发与测试

```sh
node test-service.js   # 31 项断言：Remote 标记 + 规则 CRUD + 用户命令（隔离环境）
node test-local.js     # 16 项断言：/rules 命令全场景（隔离环境）
```

两个测试都用**临时 DSH_HOME + AGENTS.md 副本**，不触碰真实文件。

## 📄 许可证

[MIT](LICENSE)。版权 (c) 2026 季涟。

---

*本项目为社区插件，与 DeepSeek Harness 官方仓库相互独立。发现方式：GitHub 话题 `dsh-plugin`。*
