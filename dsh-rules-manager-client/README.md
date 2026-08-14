# dsh-rules-manager-client

> DeepSeek Harness 设置页「命令与规则」面板（client 插件），是 **dsh-rules-manager** 的配套浏览器端。

## 功能

- **规则**：可视化编辑用户全局规则（AGENTS.md）——全文展示、编辑、新增、删除，保存即生效并自动备份；
- **命令**：只读展示所有可用斜杠命令；
- **自定义命令**：定义你自己的快捷指令（保存后即注册为可用斜杠命令）。

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
