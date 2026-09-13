# DSH plugin intake protocol

## Contents

1. Goal
2. Minimal brief
3. Full structured brief
4. Safe defaults
5. What the user supplies and what the agent derives
6. Clarification and blocking rules
7. Brief completeness score
8. Architecture and risk derivation
9. Outputs generated from a ready brief
10. Examples

## 1. Goal

Turn a product idea into an implementation-ready DSH plugin brief without forcing the user to understand Cordis, Bundle patches, Client slots, Profile transactions, or test tooling.

The user owns product intent, sensitive boundaries, and acceptance. The agent owns technical normalization, architecture comparison, risk classification, package structure, interfaces, tests, and evidence planning.

## 2. Minimal brief

Accept this Chinese template directly:

```markdown
本次模式：生成源码
插件名称：（可选）
目标用户：（可选）
现在的问题：
希望达到的结果：
核心能力：（可选，可写 1–5 条）
需要模型工具/卡片：（可选；说明工具用途即可，卡片类型由 Agent 按 DSH 契约推导）
需要读取的数据：（可选；不写则默认无）
需要执行的动作：（可选；不写则默认只读）
需要界面：（可选；不写则默认 Host-only）
外部依赖：（可选；不写则默认无网络、进程、账号、凭据或设备）
明确不能做什么：（可选；默认不改 DSH 核心、官方插件和真实 Profile）
怎么才算成功：
交付位置：（可选；不写则先提出建议路径）
希望上架 DSH STORE：（可选；不写则只生成商城兼容结构，不提交）
第三方 GitHub 仓库：（评估现有插件时提供）
```

Only `现在的问题`, `希望达到的结果`, and one observable `怎么才算成功` are semantic blockers for source generation. Name, target user, trigger, capability split, UI, and delivery path may be inferred and shown as assumptions.

Also accept a one-paragraph request if it contains the same semantics. Normalize it into the structured form before implementation.

## 3. Full structured brief

Use [plugin-brief.template.json](../assets/plugin-brief.template.json) for complex R2/R3 work. Main fields:

| Field | Purpose | Required for source | Required for real operation |
| --- | --- | --- | --- |
| `mode` | Choose plan, source build, audit, release plan, or acceptance plan | Defaults to `build-source` | Yes for release/install |
| `plugin.name` | Human working name | No; infer | Yes before release |
| `problem` | Describe current pain and context | Yes | Yes |
| `outcome.expectedResult` | Define desired user-visible result | Yes | Yes |
| `outcome.acceptanceCriteria` | Define observable completion | Yes, at least one | Yes |
| `targetUsers` | Identify whose workflow changes | No; default `DSH user` | Recommended |
| `trigger` | State how capability begins | No; infer manual | Required for automation/remote triggers |
| `capabilities` | List user abilities, not technical functions | No; infer | Required before interface freeze |
| `presentation` | State whether model Tools need cards and any user-visible card outcome | Defaults to derived generic fallback/no custom Client card | Exact Tool/card matrix before Tool implementation |
| `data.read` / `data.write` | Bound information access | Explicit empty defaults | Exact for real writes |
| `ui` | State whether/where UI is needed | Defaults Host-only | Exact before UI acceptance |
| `external` | List network/process/account/credential/device dependencies | Explicit none defaults | Exact for R2/E5 |
| `profile` | List Profile lifecycle changes/restart | Explicit none defaults | Exact target/scope for R3 |
| `security` | Sensitive data, exposure, auth/encryption, forbidden actions | Safe local defaults | Exact for LAN/Internet/credentials |
| `constraints` | Record must-use, must-not, privacy, compatibility | Defaults to DSH hard boundaries | Exact when product/legal constraint exists |
| `delivery` | Workspace, repository, license, release target, artifact type, direct-download, metadata authority, and marketplace intent | May be proposed | Exact before publishing/listing |
| `delivery.marketplace` | DSH STORE target, assess/approved/blocked/unlisted intent, repository, manifest/install path, immutable Commit, and categories | Defaults none; package structure remains marketplace-compatible | Exact before catalog submission |
| `acceptance` | Target E-level and real-environment permission | Defaults E3/no real state | Exact before E4/E5 |

Never put actual secrets, tokens, cookies, passwords, or private file contents in the brief. Record only ownership and delivery mechanism.

## 4. Safe defaults

Apply and disclose these defaults when fields are absent:

| Missing field | Default | Benefit | Cost |
| --- | --- | --- | --- |
| Mode | `build-source` | Produces useful code without external mutation | Does not install or publish |
| Name/package | Derive a `dsh-*-plugin` slug | Reduces user effort | User may rename before release |
| Target user | `DSH user` | Keeps work moving | Less precise UX until refined |
| Trigger | Explicit manual action | Avoids surprise automation | No background behavior |
| Capability mode | Read-only | Lowest blast radius | Write outcome may require later expansion |
| Tool presentation | Derive from Tool semantics; generic fallback; no custom Client card | Preserves cross-client compatibility and avoids official-card collisions | Rich custom visuals may require a later explicit Client decision |
| UI | Host-only | Smallest architecture | No visual page unless requested |
| Profile mutation | None | Protects active state | Installation/enablement remains separate |
| Restart | False | Avoids downtime | Runtime activation is not proven |
| External dependencies | None | Smaller supply-chain/trust surface | Cannot use external channels yet |
| Credentials | None | Prevents secret handling | Account integrations remain abstract |
| Exposure | Local only | Safer default | No LAN/Internet access |
| Publication | None; public download false; release manifest authority proposed | Prevents accidental release while preserving a standard publication path | Repository/website step remains pending until authorized |
| Marketplace | No STORE submission; reusable DSH Bundles still use marketplace-compatible manifest/Patch/ID/lifecycle structure | Avoids late structural rewrites without changing another repository | Catalog fields and public listing remain pending |
| Evidence target | E3 disposable | Proves integration safely | Does not prove real Profile/device/public state |

Defaults are assumptions, not hidden requirements. If a default conflicts with the stated outcome, mark the conflict and ask only the deciding question.

## 5. What the user supplies and what the agent derives

The user should supply:

- who has the problem, when known;
- the current problem and why it matters;
- the desired result;
- any must-have capability or UI behavior;
- any known data, external service, account, device, or Profile write;
- explicit prohibitions, privacy, compliance, or compatibility constraints;
- observable acceptance criteria;
- authorization only when a later real mutation/release is wanted.
- for public distribution: artifact type, repository authority, chosen license/copyright holder, direct-download intent, and observable public readback.
- for an existing third-party STORE assessment: public GitHub URL, desired outcome (`approved`, `blocked` discovery, or assessment), target DSH/Profile/system, and repository-change authority when known.

The agent derives and explains:

- standard DSH compatibility and adapter need;
- `R0–R3` risk class and `E0–E5` target;
- Host-only, Host+Client, optional Web, Skill Adapter, ApiProxy, or lifecycle architecture;
- package name, entry IDs, project tree, Patch and manifests;
- Host services, Client slots, schemas, permissions, redaction, limits, and failures;
- canonical Tool outputs, model renderers, pending/completed cards, durable metadata, generic fallbacks, and live/replay tests;
- test/fault matrix, disposable Profile strategy, audit score, and next gate;
- build/package/source/release plan;
- direct/monorepo/adapter-required/blocked marketplace route, catalog candidate, current Registry gaps, and submission evidence plan;
- assumptions and questions that remain before E4/E5.

Do not ask the user to choose implementation details that can be safely derived. Present architecture alternatives only when they materially change capability, UX, risk, operating cost, or delivery.

## 6. Clarification and blocking rules

Block source generation only when:

- the current problem is missing;
- the expected result is missing;
- no observable acceptance criterion exists;
- the requested target is clearly not DSH and no adapter direction was authorized;
- requirements contradict a hard boundary.

Allow source generation with assumptions, but block the corresponding real action when:

- Profile mutation is requested without exact Profile, operation, scope, and source;
- credentials are required without owner, storage/injection mechanism, and redaction boundary;
- LAN/Internet exposure is requested without authentication, encryption/transport, listener, and threat boundary;
- device/account/public acceptance is requested without an authorized real target;
- publication is requested without repository/license/source authority;
- a requested Tool card requires secret/full-file projection, unsupported card discriminants, stateful/I/O presenters, or replacement of an official Tool card;
- public download is requested without an immutable release manifest, embedded/preserved license notice, source link, ZIP checksum, or matching release assets;
- approved DSH STORE listing is requested without a public canonical GitHub repository, standard DSH Bundle/adapter, full immutable Commit, current category, usable license authority, or matching manifest/Patch/entry/lifecycle data;
- a third-party project needs DSH core/official-package changes, disables/shadows official inventory, or has no authorized reproducible source;
- restart is requested without process owner, approved supervisor/manual mechanism, health, and rollback.

Ask the smallest set of questions, preferably one grouped question and never a generic discovery questionnaire after a usable brief is present.

## 7. Brief completeness score

Use the normalizer's `/100` score to measure input completeness, not plugin quality:

| Field group | Points |
| --- | ---: |
| Current problem | 15 |
| Expected outcome | 15 |
| Acceptance criteria | 15 |
| Target user | 5 |
| Trigger | 5 |
| Capabilities | 10 |
| Explicit data boundary | 10 |
| UI decision | 5 |
| External dependency boundary | 5 |
| Profile mutation/restart boundary | 10 |
| Constraints/non-goals | 5 |

Interpretation:

- `85–100 READY`: start directly; few assumptions.
- `60–84 READY_WITH_ASSUMPTIONS`: start source generation and list assumptions.
- `<60 LOW_DETAIL`: if the three semantic facts are present, use `READY_WITH_ASSUMPTIONS`; otherwise use `NEEDS_INPUT` and ask only critical questions.
- Any hard contradiction: `BLOCKED`.

The score's benefit is consistent intake; its limitation is that a concise but precise brief may score lower than a verbose one. The semantic blockers and risk boundary override points.

## 8. Architecture and risk derivation

Derive the highest risk:

- `R3`: Profile lifecycle, restart, remote control, or broad management.
- `R2`: network, external process, account, credential, device, or bridge.
- `R1`: plugin-owned persistent write/import/export with no Profile lifecycle.
- `R0`: read-only metadata, analysis, or UI projection.

Derive architecture candidates:

- start with `host-only`;
- add `host-client` when UI is needed;
- add `optional-web` when HTTP/Browser routes are needed;
- add `skill-adapter` when mounting skills or adapting an external CLI;
- add a `tool-card` decision for every registered model Tool without increasing the risk class by itself; classify the Tool's actual reads, writes, process, network, credentials, and Profile effects separately;
- add `api-proxy` for bounded DSH remote/device actions;
- add `lifecycle-manager` for Profile operations.

These are candidates, not an automatic final design. Phase 1 host evidence and Phase 3 trade-off analysis still choose the architecture.

## 9. Outputs generated from a ready brief

For `build-source`, produce in order:

1. normalized brief and disclosed assumptions;
2. host-fit result;
3. risk register and evidence target;
4. architecture comparison and chosen pattern;
5. permission matrix and interface contract;
6. package name, entry IDs, project tree, source and tests;
7. static audit and Phase 6 report;
8. disposable E3 plan or execution when safe and supported;
9. marketplace route/candidate/preflight when the plugin is reusable or a STORE target was requested;
10. explicit line stating real Profile, repository release, Registry PR/merge, public marketplace, device, account, and public state.

Do not stop at a plan when the requested mode is `build-source` and no blocker prevents implementation. Do not cross into release or real mutation merely because source generation succeeded.

## 10. Examples

### Minimal read-only UI request

```markdown
本次模式：生成源码
插件名称：DSH 会话健康概览
现在的问题：会话很多时，很难快速找到失败或长期无响应的任务。
希望达到的结果：在 DSH 设置页看到异常会话及原因摘要。
核心能力：读取会话状态；按失败和无响应筛选；展示详情。
怎么才算成功：一次性 Profile 中页面可见；异常夹具分类正确；不修改会话和 Profile。
```

Expected derivation: `R0`, Host+Client, read-only, E3, no real Profile change.

### High-risk lifecycle request

```markdown
本次模式：生成源码
插件名称：DSH 插件更新器
现在的问题：插件版本和来源难以统一检查与升级。
希望达到的结果：先只读检查；用户单独确认后更新一个指定插件并可回滚。
核心能力：清单、固定来源校验、一次性更新计划、备份、健康检查、回滚。
需要执行的动作：对指定 Profile 执行单个包更新和单独重启。
明确不能做什么：不能修改 DSH 核心、官方清单或其他插件；不能复用确认。
怎么才算成功：故障矩阵全部通过；一次性 Profile E3 成功；真实 Profile 仅在新确认后 E4。
```

Expected derivation: `R3`, lifecycle manager, full mutation protocol, source build allowed, real Profile blocked pending exact plan and confirmation.

### Existing third-party plugin for DSH STORE

```markdown
本次模式：审计并准备商城候选
现在的问题：这个第三方插件能手工安装，但不知道为什么不能进入 DSH STORE。
希望达到的结果：给出 direct、monorepo、adapter-required 或 blocked 结论，并生成可验证的 Catalog 候选或最小整改清单。
第三方 GitHub 仓库：https://github.com/owner/repository
希望上架 DSH STORE：优先 approved；证据不足时保持 blocked，不猜权限或兼容性。
怎么才算成功：通用审计和商城预检通过；固定 Commit 源验证路径明确；不修改 DSH STORE 或真实 Profile。
```

Expected derivation: inspect the current Registry contract; derive manifest/install path, Patch IDs, lifecycle, license, permissions, compatibility, and route; generate a candidate plus evidence gaps. A catalog candidate is not a merged listing.
