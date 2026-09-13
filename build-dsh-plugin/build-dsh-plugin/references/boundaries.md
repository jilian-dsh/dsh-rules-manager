# DSH plugin boundaries

## Contents

1. Host-fit gate
2. Standard bundle contract
3. Profile and patch semantics
4. Host/Client boundary
5. Tool card boundary
6. External runtime and bridge boundary
7. Mutation boundary
8. Test and evidence boundary
9. Marketplace listing boundary
10. Hard blockers

## 1. Host-fit gate

Prove that the requested project can be represented as a DSH/Cordis bundle before installing or adapting it.

A valid standard plugin has:

- a package manifest declaring `dsh.bundle.patch`;
- a package-resolvable patch layer such as `cordis.patch.yml`;
- Host entries that consume public services from the inspected DSH version;
- optional Browser Client code registered through the DSH client module/slot system;
- no required modification to the DSH source tree, official packages, or official inventory.

An Obsidian plugin, VS Code extension, browser extension, desktop app, or standalone MCP server is not automatically a DSH plugin. If only an external protocol is compatible, call it an adapter and define both sides explicitly.

## 2. Standard bundle contract

Use this minimum structure unless the inspected official docs require a newer form:

```text
plugin/
├── package.json
├── cordis.patch.yml
├── index.mjs
├── lib/client.js        # only when Browser UI is needed
├── test/
└── SECURITY.md          # when permissions/external dependencies matter
```

Minimum manifest shape:

```json
{
  "name": "dsh-example-plugin",
  "version": "0.1.0",
  "type": "module",
  "main": "index.mjs",
  "files": ["index.mjs", "cordis.patch.yml"],
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

Create a unique patch row:

```yaml
- insert:
    - id: dsh-example-plugin
      name: dsh-example-plugin
```

The patch references the installed package name, not a source-tree-relative Host path. Keep entry IDs globally unique; a duplicate across bundle/Profile layers can make cold start fail.

When a Patch config needs a package-owned resource directory, do not assume expression `baseUrl` is the Bundle source directory after Profile composition. Resolve the installed package identity from the Profile with a fixed package name, or compute the path inside a Host entry from its own `import.meta.url`; prove the exact resulting directory and Skill/resource discovery at E3.

## 3. Profile and patch semantics

Effective configuration applies in this order:

1. each bundle in `dsh.profile.bundles` order;
2. the Profile `cordis.patch.yml`;
3. the home-level `$DSH_HOME/cordis.patch.yml`;
4. command-line `--patch` overlays.

Later layers win per row. Replacing a row replaces its complete `config`; it does not deep-merge keys. Preserve required runtime expressions and keys when overriding a row.

The Profile is user state, not plugin source. Let the official CLI maintain dependencies and `dsh.profile.bundles`:

```text
dsh plugin --profile <name> add <package-or-git-spec>
dsh plugin --profile <name> remove <package>
dsh --profile <name> --dump-config
```

Invoke these through fixed argv arrays when automated. Never edit the Profile manifest as an informal shortcut.

## 4. Host/Client boundary

Host code may use Node and injected Cordis services. Browser Client code may use the DSH client runtime only.

For Browser UI:

- register through `window.__ModuleLoader__.load()`;
- add UI through `ctx.slots.register()` or the current inspected slot API;
- use DSH theme variables and accessible roles;
- do not import Node filesystem, child process, secrets, or Host modules;
- treat visible state as a projection of narrow Host APIs, not direct Profile access.

Treat `webServer` as optional and possibly late-mounted:

```js
ctx.inject(['webServer'], webCtx => {
  // register narrow routes and return a disposer
})
```

Headless/no-Web profiles must not fail because the UI service is absent.

## 5. Tool card boundary

For model Tools, keep four contracts separate:

1. canonical JSON output for programmatic callers;
2. `output.render` content visible to the model;
3. provider-neutral `presentCall`/`presentResult` card intent;
4. optional Browser Client rendering for a plugin-owned Tool.

Presenters run on live and replay paths. They must be deterministic pure functions of validated args and durable result fields: no I/O, current session/Profile reads, clock, randomness, mutable globals, or extra permissions. Use bounded JSON `output.presentationMeta` only when a completed card needs facts that model-facing text cannot reconstruct.

Use only card discriminants exported by the inspected DSH version. The contract re-inspected on `0.1.2-alpha.5` preserves the `0.1.2-alpha.3`/`alpha.4` vocabulary: pending calls support `generic`, `terminal`, and `diff`; completed results support `generic`, `terminal`, `diff`, `search`, `read`, and `web`. Preserve a meaningful generic fallback, truthful truncation/total/status fields, and soft degradation for malformed old records or incapable clients.

Do not put secrets, full private files, unbounded args, system/plugin context, or model reasoning in `rawInput`, content, diffs, sources, or durable metadata. Do not register a Client `tool.call.toolview` key that replaces an official Tool card. Read [card-contract.md](card-contract.md) for the selection matrix, decision analysis, and evidence gates.

## 6. External runtime and bridge boundary

For Skill adapters:

- install only the DSH adapter unless the user separately authorizes external runtime installation;
- disclose Python/CLI/browser-extension/account dependencies;
- do not collect or proxy credentials through the Skill package;
- run a real external doctor/read test before claiming a channel works.

For ApiProxy/mobile/network bridges:

- expose an allowlist, not the entire Host API;
- redact `cwd`, system/plugin context, credentials, model reasoning, and private files;
- use explicit authentication and application-layer encryption when transport is not already trusted;
- bound frame size, parsing time, sequence, retries, and reconnect state;
- reject replay, gaps, reordering, malformed messages, unknown actions, and permanent approvals;
- keep LAN listeners off public interfaces by default and never expose a raw control port to the Internet;
- defer a cloud relay until real demand and give it its own threat model.

## 7. Mutation boundary

Read-only inspection and planning are the default. A write requires a fresh single-use plan and exact confirmation.

Every Profile mutation needs:

- typed operation and exact target;
- immutable source identity;
- exact file scope;
- precondition hashes and concurrency rejection;
- backup and atomic commit;
- official CLI fixed argv;
- health checks and rollback;
- audit status that does not include secrets or full files.

Restart is a separate mutation. If the Host process must restart itself, use an approved external supervisor/guardian. Do not report success when a port appears briefly; require a stable boot identity, sustained heartbeat, health checks, and bounded retry/circuit breaking.

## 8. Test and evidence boundary

Tests use disposable directories and explicit temporary `DSH_HOME`/Profile roots. They must never write to real `~/.dsh`.

Required test families scale with risk:

- pure unit tests for parsing, schemas, and transforms;
- contract tests for bundle/Client/API boundaries;
- negative tests for malformed profiles, traversal, unknown official components, secrets, and cross-origin access;
- transaction fault injection for command failure, config failure, concurrent change, and rollback;
- disposable official-CLI install plus `--dump-config`;
- isolated startup/API/UI smoke;
- live/replay Tool card parity, malformed-record fallback, metadata bounds, and redaction tests when a Tool presenter exists;
- separately approved real Profile readback;
- device/public/rollback tests when those surfaces exist.

Keep evidence levels distinct. A result is only as strong as its highest directly observed gate.

## 9. Marketplace listing boundary

Build reusable packages with marketplace-compatible structure, but keep the DSH STORE repository outside the plugin's write scope unless a separate contribution is explicitly requested.

For approved listing, require a public GitHub repository pinned to one full Commit, safe manifest/install paths, matching package name/version/license, a resolvable `dsh.bundle.patch`, exact unique entry IDs, exact lifecycle-script declaration, current catalog categories, conservative permission/dependency/compatibility metadata, and current Registry source verification.

Use `manifestPath` plus `installPath` for a self-contained monorepo package. Use a separately owned adapter when the upstream project targets another host and only exposes a compatible public seam. Do not fork-copy or redistribute unlicensed code to manufacture compatibility.

Unknown permission or compatibility evidence stays unknown and may justify a `blocked` discovery entry; it must never be guessed into an approved claim. Keep these evidence states separate: local candidate, pinned-source verified, Registry CI passed, PR merged, public page visible, and Profile installed.

## 10. Hard blockers

Stop mutation, installation, or release when any blocker exists:

- target host contract is incompatible or unproven;
- implementation modifies DSH source or `@deepseek-ai/*` packages;
- plugin disables, replaces, or shadows official inventory;
- Host calls Loader/Fiber mutation APIs;
- Browser bundle imports Host/Node modules or receives secrets/full files;
- Tool presenters perform I/O or depend on current session/Profile state, time, randomness, or mutable globals;
- card data leaks secrets/private files, persists unbounded values, invents an unsupported discriminant, lacks generic fallback, or disagrees with canonical success/truncation state;
- a Client contribution replaces an official Tool card key;
- Profile/package operation uses shell strings instead of fixed argv;
- Profile write lacks a typed single-use plan, confirmation, hashes, backup, health check, or rollback;
- tests target real `~/.dsh`;
- official component identity, path, Profile, or source is ambiguous;
- secrets may be logged, returned, committed, or uploaded;
- release/version/source metadata is inconsistent;
- approved marketplace listing uses a floating/non-GitHub source, unsafe/ambiguous package path, mismatched manifest/Patch/entry/lifecycle data, duplicate catalog identity, invalid category, or unverifiable license authority;
- marketplace work requires DSH core/official-package mutation, official inventory shadowing, secret exposure, or unauthorized copying of third-party code;
- a local catalog candidate or passing plugin tests are being presented as a merged/public marketplace listing;
- public download lacks license authority, immutable release identity, matching manifest/ZIP/SHA, an embedded license notice where redistribution requires it, or a retained source link;
- a lower evidence level is being presented as runtime/device/public acceptance.

Hard blockers override the readiness score. Report `BLOCKED` and the smallest safe next action.
