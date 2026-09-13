# dsh-rules-manager-client

![version](https://img.shields.io/badge/version-1.5.0-blue)
![topic](https://img.shields.io/badge/topic-dsh--plugin-blue)

> DeepSeek Harness 设置页「规则、命令与技能」面板（client 插件），是 **dsh-rules-manager** 的配套浏览器端。
>
> 当前版本 **1.5.0**（技能卡片新增使用次数徽章与核心资产保护标记及开关；卡片头改为「名称＋操作」与「状态徽章」两行布局）。

## 功能

- **规则**：可视化编辑用户全局规则（AGENTS.md）——全文展示、编辑、新增、删除、禁用/恢复，保存即生效并自动备份；支持独立「自由区域」（F 编号规则）分组展示与管理；
- **命令**：只读展示所有可用斜杠命令；
- **自定义命令**：定义你自己的快捷指令（保存后即注册为可用斜杠命令）；**支持带参数**——预设内容里写 `{input}`，输入命令时 `{input}` 会被替换成你输入的内容；没写 `{input}` 时参数自动追加到末尾；不带参数则只发预设内容；支持禁用/启用；
- **技能管理**：查看已安装技能、禁用/启用、删除进回收站；卡片显示「用过 N 次／未使用」使用次数徽章与「⚠️ 核心」保护标记及开关按钮——**是否值得保护由技能自身声明**（其 `SKILL.md` frontmatter 写 `protected: true`），插件不预设名单；无 `SKILL.md` 的目录自动过滤；
- **规则引擎**：查看 `dsh-rule-engine` 状态、版本、审计日志、规则理解产物；管理任务边界与反过度工程总开关（默认关闭）；
- **备份与恢复**：列出所有自动备份（时间 / 规则条数 / 大小），一键恢复到某个备份时刻（恢复前自动再备份当前状态，双保险）。

## 安装

本包发布在 npm（`dsh-rules-manager-client`），与主包 `dsh-rules-manager` 配套：

```sh
# 在 $DSH_HOME/profiles/web 目录下安装
npm install dsh-rules-manager dsh-rules-manager-client
```

然后按下方「装配」接入 `cordis.patch.yml` 并重启 DSH。

## 装配

本包必须放在 `$DSH_HOME/profiles/node_modules/` 下（DSH 的 client 插件发现机制按 npm 包名解析），并在 `$DSH_HOME/profiles/web/cordis.patch.yml` 装配（见主包 README）。

```yaml
- insert:
    - id: rules-manager-client
      name: 'dsh-rules-manager-client'
```

## 技术要点（开发者）

- bundle 为手写 `window.__ModuleLoader__.load({ id, factory })`（CJS factory），未用构建工具；
- 面板通过 `ctx.slots.inject("settings.section", ...)` 注册；
- host 服务经 Typert Remote 贡献挂载：`ctx.remote.$mount({ package, descriptors })`（schema 用 passthrough），组件内经 `ctx.get("remote.rulesManager")` 取服务实例（绕开 Cordis 的 inject 守卫）；
- 注意 RPC 返回值是 `{ ok, value }` 信封，`value` 才是 host 的返回值。

## 变更记录

| 版本 | 日期 | 要点 |
|---|---|---|
| **1.5.0** | 2026-09-14 | 技能卡片新增「用过 N 次／未使用」使用次数徽章（数据源 `dsh-skill-scoreboard` 记分板，会话去重口径，只统计该插件装上之后的调用；插件未装或请求失败时静默降级）＋「⚠️ 核心」保护标记与开关按钮（实现＝写技能自身 `SKILL.md` frontmatter 的 `protected: true`，改写前自动备份）；技能列表过滤无 `SKILL.md` 的目录；卡片头改为「名称＋操作」与「状态徽章」两行布局 |
| **1.4.5** | 2026-08-28 | 版本号发布（无功能变更；发布时补记 1.4.4 的修复说明） |
| **1.4.4** | 2026-08-28 | 白名单面板渲染修复——DSH @Remote 调用返回两层壳 `{ok, value:{...}}`，数据在 `r.value`；旧代码读外层 `r.permanent` 致面板恒显"白名单为空"（文件有 3 条不显示）。修复 = 读 `r.value`（兼容直返）+ 三态渲染（加载/错误/空区分）+ 错误可见。根因与修复详版本记录 v4.75。 |

> 更早版本见 git 提交历史。

## 发行固定源

- **1.5.0（当前）** 固定于 main Commit `b4a4a1f`（`git checkout b4a4a1f` + 发布 bump 可复现 npm `dsh-rules-manager-client@1.5.0` 与 GitHub Release v1.5.0 同源代码）。**注：release 提交号由发布脚本自动回填。**

- **1.4.5** 固定于 main Commit `a36c9d0`（`git checkout a36c9d0` 可复现 npm `dsh-rules-manager-client@1.4.5` 与 GitHub Release v1.4.5 同源代码）。

## 许可证

[MIT](LICENSE)。
