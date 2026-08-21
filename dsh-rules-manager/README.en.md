# dsh-rules-manager (Rules, Commands & Skills Manager)

![license](https://img.shields.io/github/license/jilian-dsh/dsh-rules-manager)
![version](https://img.shields.io/badge/version-1.5.0-blue)
![node](https://img.shields.io/badge/node-%3E%3D22-green)
![topic](https://img.shields.io/badge/topic-dsh--plugin-blue)
![lang](https://img.shields.io/badge/lang-English%20%7C%20%E4%B8%AD%E6%96%87-lightgrey)

> A DeepSeek Harness (DSH) plugin for managing your user-global rules and commands:
> the **`/rules` slash command** plus a **settings panel "规则、命令与技能"** with visual rule editing,
> a slash-command list, **user-defined custom commands**, **skill management**, and **backup restore**.
>
> ⚡ Rules live in `$DSH_HOME/AGENTS.md`; every change takes effect **immediately**
> (DSH hot-reloads the file) and is **automatically backed up** before each write —
> you can restore to any backup snapshot at any time.

## Features

| Capability | Where | Notes |
|---|---|---|
| List / view / add / edit / delete / **disable / restore** rules | `/rules` command or Settings → 规则、命令与技能 | Rules are the user-global instructions (AGENTS.md), grouped by section, full-text visual editing |
| Command list | Settings → 规则、命令与技能 → 命令 | Read-only list of all available slash commands (name/description/usage) |
| **Custom commands** | Settings → 规则、命令与技能 → 自定义命令 | Define your own shortcuts: type `/name` in the chat box to send a preset prompt to the AI; **supports arguments** (see below); **disable/enable** supported; long presets are collapsed by default — click "详情" to expand |
| **Skill management** | Settings → 规则、命令与技能 → 技能 | View installed skills (name/description/full text), **disable** (moved out of the skills dir, content preserved), **enable** (moved back), **delete** (moved to `~/.dsh/.backups/trash-<timestamp>/`, recoverable); disable/delete fully takes effect after restarting DSH |
| **Backup & restore** | Settings → 规则、命令与技能 → 备份与恢复 | Browse all auto backups (time / rule count / size), restore to any snapshot with one click |

### Examples

```
/rules                    list all rules
/rules show 2             show full text of rule 2
/rules add 我的规则｜这是正文   add a rule (｜ separates title and body)
/rules edit 2 新正文       edit rule 2's body
/rules delete 3           delete rule 3 (numbers are never reused)
/rules health             rule health check: counts, sections, free zone, missing level, empty/long body, duplicate titles
```

Custom commands: define `hello` = "Please greet me warmly" in the panel, then type `/hello` in the chat box.

### ⚖️ Execution levels (must-read for new users)

Every rule title ends with an **execution level**, e.g. `### [规则 9] PS 编码与命令执行（执行等级：A+D）`. It decides how strictly the rule is **machine-enforced**:

| Level | Meaning | Machine behavior |
|---|---|---|
| **A** | Hard block | Rule-violating tool calls are **directly denied** (the model cannot bypass) |
| **B** | Audit & correct | Violating text is **logged + a correction reminder is injected** |
| **C** | Sequence check | Judged by event order; violations are **denied** (e.g. authorize before acting) |
| **D** | Self-certify | Requires a **self-certification statement**, no hard block |
| **M** | Meta | Rules about the rules themselves |

- Levels can combine (e.g. `A+D` = hard block + self-certify).
- **When adding a rule without a level in the title**, `（执行等级：D）` is appended automatically with a hint — level D is only a self-certify reminder and **never hard-blocks**. For a hard block, write `（执行等级：A）` in the title (combinable).
- The rule engine (dsh-rule-engine) only hard-blocks tool calls for rules whose level contains A/C/M; B/D levels get text auditing and self-certify hints.

### Custom commands with arguments

Anything typed after the command name is treated as an **argument** and merged into the preset prompt before delivery. Three rules:

1. **The preset contains `{input}`** → the argument replaces every `{input}` occurrence (usable multiple times); running it **without an argument shows a usage hint instead of sending a truncated prompt**;
2. **No `{input}` and an argument is given** → the argument is appended to the preset (newline-separated);
3. **No `{input}` and no argument** → only the preset is sent (identical to previous behavior; existing commands are unaffected).

```
Preset: Please summarize in one sentence: {input}
Type:   /summarize this week's progress
Sent:   Please summarize in one sentence: this week's progress

Preset: Please generate a weekly report
Type:   /weekly-report monthly revenue 50k
Sent:   Please generate a weekly report
        monthly revenue 50k          ← argument appended

Preset: Please greet me warmly
Type:   /hello                       ← no argument
Sent:   Please greet me warmly
```

## 🕊️ Free Zone

AGENTS.md supports a **free zone**: the section framed by the `<!-- free-zone:start -->` / `<!-- free-zone:end -->` comment markers. **The model can read it and it still works as instructions, but the rule engine (dsh-rule-engine) does not parse or enforce it** (no hard block, no auditing, not in `/guard rules`) — ideal for soft constraints, third-party codes of conduct (e.g. a legal work code), etc.

- **Entries inside use** `### [规则 F<n>]` (F = Free prefix, e.g. `F1`, `F2`); using the main numbering `### [规则 N]` inside the zone is forbidden;
- **Management**: free-zone entries appear under a separate "自由区域" group in `/rules list` and the settings panel — **editable / disableable / deletable** like normal rules;
- **Adding normal rules**: `/rules add` always inserts **before** `free-zone:start`, so new rules never fall into the free zone;
- **Adding free-zone rules**: must be written manually between the `free-zone:start/end` markers using the `### [规则 F2]` format;
- **Promotion**: rename the F number to a main number and move it out of the zone — the rule engine takes over enforcement automatically;
- **Command support**: `/rules show F1`, `/rules edit F1 新正文`, `/rules delete F1` (letter indices supported since 1.4.3).

### 📝 Adding a free-zone rule (3 steps)

`/rules add` **cannot** place a rule into the free zone (by design — it prevents normal rules from landing in an area the engine does not enforce). Do this instead:

1. If dsh-rule-engine is installed: first type **`/guard unlock`** in the chat box (AGENTS.md is write-protected; unlock allows edits for 10 minutes by default; only the user holds the key);
2. Open `$DSH_HOME/AGENTS.md` with a text editor (typically `D:\DeepSeek harness\.dsh\AGENTS.md`), scroll to the **end**, find the `<!-- free-zone:start -->` and `<!-- free-zone:end -->` markers, and paste **between them** in this format (numbering continues from F2; F1 is already taken by the example; never reuse an existing number):

   ```markdown
   ### [规则 F2] Your code-of-conduct title
   Your content here (multiple lines are fine).
   ```

3. Save the file — **takes effect immediately, no restart needed**. You can also ask your AI assistant to write it for you (run `/guard unlock` first).

> Note: **do not** write outside the free-zone markers — the rule engine would parse it as a normal rule (without an execution level it will not hard-block, but it will appear in `/guard rules`).

## Safety

- **Auto backup**: before every AGENTS.md write, a full copy is saved to
  `$DSH_HOME/.backups/AGENTS.md-<timestamp>.bak` (last 5 kept; timestamps include
  milliseconds so rapid consecutive writes never overwrite each other);
- **One-click restore (double safety)**: restoring a backup first backs up the
  current AGENTS.md automatically — you can always revert again, data is never lost;
- **No renumbering**: deleting a rule keeps the remaining numbers stable;
- **Name-conflict guard**: custom commands colliding with system commands (e.g. `/rules`, `/compact`) are rejected;
- **Name rules**: lowercase letters, digits, hyphen, underscore only (`/^[a-z][a-z0-9_-]*$/`);
- **Argument merging**: `{input}` placeholders in the preset are replaced by the typed argument (multiple allowed); without `{input}`, the argument is appended (newline-separated); a command with `{input}` run without an argument shows a usage hint (no truncated prompt is sent), while a command without `{input}` run without an argument sends only the preset (backward compatible).

## Install

### Option 1: npm (recommended — dependencies resolved automatically)

Both packages are published on npm as `dsh-rules-manager` and `dsh-rules-manager-client`:

```sh
# Run inside your plugin directory (e.g. $DSH_HOME/profiles/web)
npm install dsh-rules-manager dsh-rules-manager-client
```

Then wire them in `cordis.patch.yml` (step 2 below; reference the npm package names) and restart DSH.
DSH dependencies (`@deepseek-ai/*`) resolve automatically via peerDependencies.

### Option 2: copy from source

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

3. **Restart** DSH. The settings panel shows "规则、命令与技能"; the `/rules` command works in the chat box.

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
node test-service.js   # 101 assertions: Remote markers + rule CRUD + user commands (with args) + backup restore (isolated)
node test-local.js     # 33 assertions: /rules command end-to-end (including health check, isolated)
```

Both tests use a **temporary DSH_HOME + AGENTS.md copy**; they never touch your real files.

## License

[MIT](LICENSE). Copyright (c) 2026 季涟.

---

*Community plugin, independent of the DeepSeek Harness official repository. Discover via the `dsh-plugin` topic.*
