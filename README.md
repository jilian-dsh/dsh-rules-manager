# dsh-rules-manager

![license](https://img.shields.io/github/license/jilian-dsh/dsh-rules-manager)
![version](https://img.shields.io/badge/version-1.0.0-blue)
![node](https://img.shields.io/badge/node-%3E%3D22-green)
![topic](https://img.shields.io/badge/topic-dsh--plugin-blue)

> 规则与命令管理插件 for **DeepSeek Harness (DSH)**：用 `/rules` 斜杠命令或设置页**「命令与规则」**面板，可视化地管理你的用户全局规则（`AGENTS.md`）、查看全部斜杠命令、**创建你自己的自定义命令**。

[English](dsh-rules-manager/README.en.md) | 中文

## 功能一览

| 能力 | 入口 | 说明 |
|---|---|---|
| 规则管理 | `/rules` 命令 或 设置→命令与规则 | 列出 / 查看 / 新增 / 修改 / 删除用户全局规则（AGENTS.md），**保存即生效**，每次修改**自动备份** |
| 命令清单 | 设置→命令与规则 →「命令」 | 只读展示所有可用斜杠命令 |
| 自定义命令 | 设置→命令与规则 →「自定义命令」 | 定义你自己的快捷指令：聊天框输入 `/名字`，把预设内容发送给 AI 执行 |

## 仓库结构

```
dsh-rules-manager/             host 插件（纯 Node，无需构建）
├── index.js                   /rules 斜杠命令
├── service.js                 Remote 服务（支撑设置面板）
├── rules-core.js              共享核心：AGENTS.md 解析 / 备份 / 增删改
└── README.md                  完整使用文档（中文）/ README.en.md（英文）
dsh-rules-manager-client/      client 插件（浏览器 bundle）
├── client.js                  设置页「命令与规则」面板（手写 __ModuleLoader__ bundle）
└── README.md                  面板说明
docs/                          踩坑与反馈记录（DSH message.id 校验不对称 bug：修复 + 官方反馈存档）
```

## 快速开始

1. 把 `dsh-rules-manager/` 拷贝到 `$DSH_HOME/profiles/web/`，把 `dsh-rules-manager-client/` 拷贝到 `$DSH_HOME/profiles/node_modules/`；
2. 在 `$DSH_HOME/profiles/web/cordis.patch.yml` 追加装配（见 `dsh-rules-manager/README.md`）；
3. 重启 DSH → 设置页出现「命令与规则」，聊天框可用 `/rules`。

## 安全

- 每次写入 AGENTS.md 前自动备份到 `$DSH_HOME/.backups/`（保留最近 5 份）；
- 自定义命令与系统命令同名会被拒绝；命令名限小写字母/数字/连字符/下划线。

## 开发

```sh
node dsh-rules-manager/test-service.js   # 31 项断言（隔离环境）
node dsh-rules-manager/test-local.js     # 16 项断言（隔离环境）
```

## 许可证

[MIT](dsh-rules-manager/LICENSE)

---

*社区插件，与 DeepSeek Harness 官方仓库相互独立。发现方式：GitHub 话题 `dsh-plugin`。*
