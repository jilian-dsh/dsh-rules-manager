# dsh-rules-manager-client

> DeepSeek Harness 设置页「规则、命令与技能」面板（client 插件），是 **dsh-rules-manager** 的配套浏览器端。

## 功能

- **规则**：可视化编辑用户全局规则（AGENTS.md）——全文展示、编辑、新增、删除、禁用/恢复，保存即生效并自动备份；支持独立「自由区域」（F 编号规则）分组展示与管理；
- **命令**：只读展示所有可用斜杠命令；
- **自定义命令**：定义你自己的快捷指令（保存后即注册为可用斜杠命令）；**支持带参数**——预设内容里写 `{input}`，输入命令时 `{input}` 会被替换成你输入的内容；没写 `{input}` 时参数自动追加到末尾；不带参数则只发预设内容；支持禁用/启用；
- **技能管理**：查看已安装技能、禁用/启用、删除进回收站；
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

## 许可证

[MIT](LICENSE)。
