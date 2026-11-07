# DSH tool card contract

## Contents

1. Scope and authority
2. Two card mechanisms
3. Card selection matrix
4. Pending and completed states
5. Replay and persistence
6. Data and permission boundary
7. Fallback and forward compatibility
8. Implementation workflow
9. Test and evidence gates
10. Decision analysis

## 1. Scope and authority

Use this reference whenever a plugin registers a model Tool, returns tool-specific UI, or proposes a custom Tool card. Verify the contract against the target DSH version before coding. The contract re-inspected on `0.1.2-alpha.5` is owned by `@deepseek-ai/dsh-tools`: `ToolDefinition.presentCall`, `ToolDefinition.presentResult`, `output.presentationMeta`, `ToolCallView`, and `ToolResultView`. Its inspected card discriminants remain compatible with `0.1.2-alpha.3` and `0.1.2-alpha.4`.

Treat cards as a presentation contract, not a second business API. The canonical Tool output and `output.render` remain model-facing. Card data is a pure, provider-neutral projection for Host/Client bridges and session replay.

## 2. Two card mechanisms

Keep these mechanisms distinct:

| Mechanism | Owner | Purpose | Default decision |
| --- | --- | --- | --- |
| Tool render intent | Host Tool definition | Describe one call through `presentCall` and `presentResult` | Prefer for every Tool that benefits from structured display |
| Client Slot card | Browser Client through `tool.call.toolview` | Replace or extend the renderer for one Tool key | Use only for a plugin-owned Tool after querying the current Slot and props |

Do not build a Client component merely to obtain a normal terminal, diff, search, read, or web card. Use the provider-neutral Tool render intent so every capable DSH client can render it and other clients can degrade safely.

Registering `tool.call.toolview` with an existing key may replace the product's default card. Never replace an official Tool card as a default plugin behavior. A separately authorized product customization must prove the exact Tool schema, Slot props, fallback, disposal, accessibility, and non-shadowing behavior.

## 3. Card selection matrix

Choose the card from the operation's user meaning, not from visual preference:

| Operation | Pending `presentCall` | Completed `presentResult` | Why | Avoid when |
| --- | --- | --- | --- | --- |
| Ordinary action or status | `generic` | `generic` or omitted | Smallest stable fallback | A more specific built-in semantic exactly fits |
| Foreground shell command | `terminal` | `terminal` | Preserves command, cwd, raw output, exit code or signal | The Tool merely invokes an internal process and the command is not the user-facing operation |
| File create/edit | `diff` | `diff` | Shows intended and applied changes | The operation changes non-file state or cannot produce truthful before/after text |
| Content/path discovery | `generic` with `kind: 'search'` | `search` | Matches exist only after execution; `truncated` and `total` keep partial results honest | The result is not a search or has no structured retained/total semantics |
| File text read | `generic` with `kind: 'read'` | `read` | Result carries line numbers, offset, total lines and optional language | The Tool returns arbitrary content rather than a file window |
| Web search/fetch | `generic` with `kind: 'search'` or `kind: 'fetch'` | `web` | Preserves sources or fetch summary without duplicating the body | The Tool is not web retrieval or cannot supply the required truthful fields |

Pending cards support `generic`, `terminal`, and `diff`. Completed cards support `generic`, `terminal`, `diff`, `search`, `read`, and `web`. Reinspect the exported union before using a newer discriminant; do not invent `card` values.

## 4. Pending and completed states

### Pending state

Implement `presentCall(args)` as a pure function of validated Tool arguments:

- keep `title` short and specific to this call;
- use `rawInput` only for salient, bounded details, not the complete arguments by habit;
- use `locations` only for files the call actually reads or changes and use 1-based lines;
- use an absolute terminal `cwd` as-is or a relative one for the bridge to resolve against the session workspace;
- use `oldText: null` for a create or overwrite when the call-time presenter cannot know prior content.

### Completed state

Implement `presentResult(args, result)` from arguments plus durable result fields:

- omit the method or return `undefined` when generic fallback is correct;
- keep `exitCode` and `signal` mutually exclusive;
- return a completed `diff` when the completed view must retain the applied change instead of being replaced by raw result text;
- for `search`, always provide `truncated` and `total`; never show a capped retained page as complete;
- for `read`, provide truthful `path`, 1-based `offset`, numbered `lines`, and exact `totalLines`;
- for `web`, use `kind: 'search'` for sources/answer or `kind: 'fetch'` for URL/status/truncation, without copying the fetched body into the card.

Treat an execution error separately. A malformed or failed card projection must not hide the Tool failure or crash replay; return `undefined` and let DSH use its generic error/result presentation.

## 5. Replay and persistence

Both presenters run during live streaming and session-log replay. They MUST therefore be deterministic pure functions:

- no filesystem, network, subprocess, database, credential, or session reads;
- no clock, randomness, mutable global state, or dependence on the current Profile;
- no parsing of previously rendered natural language when the canonical value can provide a field;
- identical arguments and durable result metadata produce an equivalent card on live and replay paths.

When the completed card needs structured facts that the model-facing content cannot reconstruct, derive JSON through `output.presentationMeta(args, value)`. DSH persists that metadata on `tool/result` and passes it back as `result.meta` to `presentResult`. Keep it JSON-serializable and bounded. Nested Code dispatches have no cards and do not compute this metadata, so the canonical Tool value must remain sufficient for programmatic callers.

Do not persist the entire canonical value merely for the UI. Project only the minimum card fields and retain explicit caps for bytes, items, lines, diffs, sources, and preview text.

## 6. Data and permission boundary

Cards are user-visible projections and can widen disclosure even when Tool execution is correct. Apply the same permission and redaction matrix as the Tool result:

- never include credentials, authorization headers, cookies, environment secrets, system/plugin prompts, model reasoning, or full private files;
- do not expose a Host absolute path when a workspace-relative model-facing path is sufficient;
- do not place the full args object in `rawInput` unless every field is intentionally user-visible and bounded;
- do not duplicate large output into both model content and card metadata;
- preserve `truncated`, `total`, status, and error facts so a visual summary cannot overstate completeness or success;
- keep UI-only fences, relative-path formatting, and visual labels out of the canonical value and model-facing `output.render`.

Adding a card does not authorize new reads or writes. If the desired card requires data the Tool does not already own, redesign the canonical result or defer the card rather than reading extra state inside a presenter.

## 7. Fallback and forward compatibility

Every Tool card needs a meaningful generic fallback:

1. `presentCall` may return `undefined`; DSH shows the Tool name and raw arguments.
2. `presentResult` may return `undefined`; DSH keeps the pending title and renders raw result content.
3. A client that does not support a specific result card uses raw result content or the contract's declared fallback field.
4. Malformed old arguments or metadata must degrade without throwing.
5. A client switch over card discriminants must preserve a documented default for a future unknown card instead of crashing the conversation.

Do not use fallback to conceal missing required fields. A producer must satisfy the current exported union; fallback is for absent optional presentation, old durable records, incapable clients, or independently invalid presentation data.

## 8. Implementation workflow

For every Tool, add a card decision row before implementation:

1. identify the canonical output and model-facing renderer;
2. choose the pending and completed card or justify generic fallback;
3. list which fields come from args, canonical value, and `presentationMeta`;
4. set size/item/text caps and redaction rules;
5. define live, completion, failure, replay, old-record, and unsupported-client behavior;
6. implement presenters beside the Tool definition without importing UI packages;
7. add Client Slot code only when the built-in card vocabulary cannot meet the user outcome;
8. record the inspected DSH version/Commit and reconsider when its exported union or Client bridge changes.

Use this artifact:

```markdown
| Tool | Canonical value | Pending card | Completed card | Durable meta | Bounds/redaction | Generic fallback | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | | generic/terminal/diff/none | generic/terminal/diff/search/read/web/none | fields/none | | | |
```

## 9. Test and evidence gates

Require E2 coverage for every custom presenter:

- exact discriminant and required fields for representative calls;
- deterministic equality across repeated invocations;
- failure returns generic fallback without masking `isError`;
- malformed legacy args/meta do not throw;
- metadata is JSON-serializable and respects byte/item caps;
- secret/private-path fixtures do not appear in the card;
- search/read/web truncation and total/status fields remain truthful;
- Tool source imports no Client/UI package.

Require E3 for a DSH compatibility claim:

- official CLI installs the package in a disposable `DSH_HOME`;
- `--dump-config` contains the intended unique rows;
- an isolated runtime registers the Tool and produces the expected live card;
- a persisted session replay produces the equivalent completed card;
- an incapable/default client renders the generic fallback;
- optional custom Client card disposes cleanly and does not replace an official card.

Require visible E4 readback before claiming the card works in the user's real DSH Profile. Unit tests, JSON snapshots, or a successful package install alone do not prove visible UI.

## 10. Decision analysis

### Prefer provider-neutral render intents

- **Objective**: make Tool calls readable in DSH without coupling the Tool to one Client.
- **Why**: the Host owns Tool semantics while clients own rendering; a `card`-tagged intent lets both evolve around a bounded shared vocabulary.
- **Benefits**: live/replay parity, generic fallback, less Client code, cross-client reuse, and no UI dependency in the Tool package.
- **Costs**: the vocabulary is intentionally limited; presenters and durable metadata need separate tests and caps.
- **Applies when**: a built-in card meaning matches the Tool.
- **Alternative**: custom Client Slot card; use only for a plugin-owned Tool with an outcome the built-in vocabulary cannot express.
- **Evidence/stop**: stop on stateful presentation, secret projection, invented discriminants, missing fallback, or replay mismatch.
- **Reconsider when**: DSH changes the exported presentation union or adds a built-in card that replaces custom UI.

### Keep card data separate from canonical Tool output

- **Objective**: preserve a stable programmatic API and model-visible result while adding rich UI.
- **Why**: Code Mode consumes canonical JSON, models consume rendered content, and clients consume card intent; mixing these concerns forces every consumer to parse UI formatting.
- **Benefits**: typed automation, smaller model content, replayable UI, and independent visual evolution.
- **Costs**: requires `presentationMeta` when result-time structure is not otherwise durable and creates another bounded projection to maintain.
- **Applies when**: structured UI needs fields not losslessly present in model text.
- **Alternative**: generic raw-result card; prefer it when richer UI would duplicate large values or require new permissions.
- **Evidence/stop**: stop when card-only needs cause extra I/O, unbounded persistence, or model/UI status disagreement.
- **Reconsider when**: the canonical result contract changes and can provide the same facts without extra persistence.
