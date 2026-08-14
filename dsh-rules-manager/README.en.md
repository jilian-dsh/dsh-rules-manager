# dsh-rules-manager (Rules & Commands Manager)

![license](https://img.shields.io/github/license/jilian-dsh/dsh-rules-manager)
![version](https://img.shields.io/badge/version-1.1.0-blue)
![node](https://img.shields.io/badge/node-%3E%3D22-green)
![topic](https://img.shields.io/badge/topic-dsh--plugin-blue)
![lang](https://img.shields.io/badge/lang-English%20%7C%20%E4%B8%AD%E6%96%87-lightgrey)

> A DeepSeek Harness (DSH) plugin for managing your user-global rules and commands:
> the **`/rules` slash command** plus a **settings panel "命令与规则"** with visual rule editing,
> a slash-command list, **user-defined custom commands**, and **backup restore**.
>
> ⚡ Rules live in `$DSH_HOME/AGENTS.md`; every change takes effect **immediately**
> (DSH hot-reloads the file) and is **automatically backed up** before each write —
> you can restore to any backup snapshot at any time.

## Features

| Capability | Where | Notes |
|---|---|---|
| List / view / add / edit / delete rules | `/rules` command or Settings → 命令与规则 | Rules are the user-global instructions (AGENTS.md), grouped by section, full-text visual editing |
| Command list | Settings → 命令与规则 → 命令 | Read-only list of all available slash commands (name/description/usage) |
| **Custom commands** | Settings → 命令与规则 → 自定义命令 | Define your own shortcuts: type `/name` in the chat box to send a preset prompt to the AI |
| **Backup & restore** | Settings → 命令与规则 → 备份与恢复 | Browse all auto backups (time / rule count / size), restore to any snapshot with one click |

### Examples

```
/rules                    list all rules
/rules show 2             show full text of rule 2
/rules add 我的规则｜这是正文   add a rule (｜ separates title and body)
/rules edit 2 新正文       edit rule 2's body
/rules delete 3           delete rule 3 (numbers are never reused)
```

Custom commands: define `hello` = "Please greet me warmly" in the panel, then type `/hello` in the chat box.

## Safety

- **Auto backup**: before every AGENTS.md write, a full copy is saved to
  `$DSH_HOME/.backups/AGENTS.md-<timestamp>.bak` (last 5 kept; timestamps include
  milliseconds so rapid consecutive writes never overwrite each other);
- **One-click restore (double safety)**: restoring a backup first backs up the
  current AGENTS.md automatically — you can always revert again, data is never lost;
- **No renumbering**: deleting a rule keeps the remaining numbers stable;
- **Name-conflict guard**: custom commands colliding with system commands (e.g. `/rules`, `/compact`) are rejected;
- **Name rules**: lowercase letters, digits, hyphen, underscore only (`/^[a-z][a-z0-9_-]*$/`).

## Install

Both packages must be installed:

1. **Copy** `dsh-rules-manager/` into `$DSH_HOME/profiles/web/`, and `dsh-rules-manager-client/` into `$DSH_HOME/profiles/node_modules/`;
2. **Wire** them in `$DSH_HOME/profiles/web/cordis.patch.yml`:

   ```yaml
   - insert:
       - id: rules-manager
         name: './rules-manager/index.js'
       - id: rules-manager-service
         name: './rules-manager/service.js'
       - id: rules-manager-client
         name: 'dsh-rules-manager-client'
   ```

3. **Restart** DSH. The settings panel shows "命令与规则"; the `/rules` command works in the chat box.

> The client package must live under `profiles/node_modules/` (DSH discovers client plugins by npm package name).
> Host dependencies resolve through the junction forest in `profiles/node_modules`.

## Architecture

```
dsh-rules-manager/              host plugin (pure Node, no build)
├── index.js                    /rules slash command
├── service.js                  Remote service (TypertRemoteService) backing the settings panel
├── rules-core.js               shared core: AGENTS.md parse / backup / CRUD
dsh-rules-manager-client/       client plugin (browser bundle)
├── index.js                    host-side placeholder entry
└── client.js                   settings panel (hand-written __ModuleLoader__ bundle)
```

- Host home resolution uses `resolveDshHome()` from `@deepseek-ai/dsh-home-paths`;
- client→host RPC uses Typert Remote: `ctx.remote.$mount({package, descriptors})` + `ctx.get("remote.rulesManager")`;
- Custom commands deliver the preset prompt via `invocation.agent.followup(message)` (the official inbox channel).

## Development

```sh
node test-service.js   # 58 assertions: Remote markers + rule CRUD + user commands + backup restore (isolated)
node test-local.js     # 16 assertions: /rules command end-to-end (isolated)
```

Both tests use a **temporary DSH_HOME + AGENTS.md copy**; they never touch your real files.

## License

[MIT](LICENSE). Copyright (c) 2026 季涟.

---

*Community plugin, independent of the DeepSeek Harness official repository. Discover via the `dsh-plugin` topic.*
