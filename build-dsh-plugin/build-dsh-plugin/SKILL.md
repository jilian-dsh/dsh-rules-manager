---
name: build-dsh-plugin
description: Convert natural-language or structured briefs into plans, source, audits, packages, releases, DSH STORE catalog candidates, public artifacts, installations, or verification for standard non-destructive DeepSeek Harness (DSH) plugins. Use for DSH/Cordis Host plugins, model Tools and card contracts, Browser Clients, Skill adapters, ApiProxy bridges, marketplace listing failures/submissions, Profile lifecycle managers, fixed releases, public distribution, and third-party compatibility requests. Normalize goals, problems, capabilities, data, mutations, Tool presentation, UI, external dependencies, constraints, delivery, marketplace intent, and acceptance; apply safe defaults; enforce host, card, and marketplace preflight, quantified gates, disposable tests, official CLI-only package changes, licensed immutable distribution, separate repository/catalog/Profile acceptance, and evidence-based status.
---

# Build DSH Plugin

Use this workflow to turn a DSH plugin idea into a standard bundle without modifying or shadowing the Harness itself.

## Normalize the user brief

Read [intake.md](references/intake.md) for every new plugin request. Accept either ordinary language, the minimal Chinese brief, or the structured JSON template at [plugin-brief.template.json](assets/plugin-brief.template.json).

Require only three semantic facts before source generation:

1. the current user problem;
2. the expected user outcome;
3. at least one observable acceptance criterion.

Infer names, package IDs, architecture candidates, risk class, project structure, tests, and safe defaults. Do not ask the user to design Host APIs, Cordis entries, schemas, build tooling, or test strategy unless they have a preference.

When optional fields are absent, default to source generation only, standard DSH Bundle, read-only behavior, no real Profile mutation, no restart, no external network/process/account/device, no credentials, local-only exposure, no publication, and E3 disposable acceptance. Build reusable DSH Bundles with marketplace-compatible package structure by default, but do not infer authorization to submit or change DSH STORE. State every default as an assumption. `No publication` is an authorization default, not a permanent prohibition: an explicitly authorized, properly licensed, internally consistent fixed release may be distributed from a website or proposed to a marketplace.

Ask only questions whose answers materially change the product outcome or risk boundary. Missing problem, outcome, or acceptance blocks generation. Missing target Profile, mutation scope, credential owner, LAN/Internet security, or real device/account blocks only the corresponding real operation; it does not block a safe source scaffold when interfaces can remain abstract.

Run the deterministic normalizer when a JSON brief is available:

```bash
node scripts/normalize-brief.mjs /absolute/path/to/plugin-brief.json
node scripts/normalize-brief.mjs /absolute/path/to/plugin-brief.json --json
```

If the normalized status is `READY` or `READY_WITH_ASSUMPTIONS` and the requested mode is `build-source`, proceed through Phases 0–6 without another broad clarification round. Stop before release, real Profile mutation, restart, credentials, device, or public exposure unless separately authorized and fully specified.

## Establish the contract

Start read-only. Inspect repository instructions, the target DSH version, official plugin docs, the active Profile only when relevant, and one current standard plugin example. Do not assume an API or package contract from an older project.

Always enforce these rules:

- Build a DSH bundle, not a desktop app or a fork of DSH.
- Never modify the DSH source tree or any `@deepseek-ai/*` package.
- Never disable, replace, or shadow the official plugin inventory.
- Never call Loader/Fiber mutation APIs. Use public Host services and bundle composition.
- Use the official DSH CLI for package changes. Pass fixed argument arrays; never build shell command strings.
- Keep tests in disposable homes/profiles. Never write tests against real `~/.dsh`.
- Do not expose credentials, full user files, injected system/plugin context, model reasoning, or private paths through logs or clients.
- Keep planning, code completion, package release, Profile installation, runtime acceptance, and external/device acceptance as separate states.
- Keep plugin readiness, catalog-candidate readiness, Registry PR/CI, merged catalog, public marketplace visibility, and Profile installation as separate states.
- Keep canonical Tool output, model-facing rendering, provider-neutral card intent, and optional custom Client rendering as separate contracts.

Read [boundaries.md](references/boundaries.md) before implementation or installation. Hard blockers in that file override every score.
Read [card-contract.md](references/card-contract.md) before implementing a model Tool, `presentCall`, `presentResult`, `presentationMeta`, or a custom Tool card.

## Explain every consequential decision

Do not emit a rule list without its decision logic. For each architecture, permission, mutation, release, or acceptance decision, record:

1. **Objective**: the failure or outcome the decision controls.
2. **Rationale**: why DSH mechanics or the current threat model require it.
3. **Benefits**: what becomes safer, simpler, more compatible, or easier to verify.
4. **Costs**: implementation burden, UX friction, performance cost, capability loss, or operational delay.
5. **Applicability**: the conditions under which the decision is appropriate.
6. **Alternatives**: viable options, why they were rejected, and when to reconsider them.
7. **Procedure**: concrete steps, owner, inputs, outputs, and rollback behavior.
8. **Evidence gate**: the observable proof required to advance and the condition that stops work.

Read [decision-guide.md](references/decision-guide.md) when planning, reviewing, or explaining a plugin. Use its decision cards rather than copying a preferred pattern without analysis.

## Run the workflow

Follow [workflow.md](references/workflow.md) for the complete stage-gated process and required artifacts. Do not skip a stage merely because a similar plugin previously passed it; DSH versions, Profile composition, dependencies, and external services can drift.

### 1. Prove host fit

Identify the target host, extension seam, requested user outcome, state mutations, external dependencies, and acceptance surface.

Stop and report a host mismatch when the project targets Obsidian, VS Code, a browser extension, MCP only, or another runtime without a proven DSH bundle contract. Offer the compatible host or a deliberately scoped adapter. Do not divert into an adjacent project.

Produce a host-contract record and an architecture comparison. Gate: `compatible`, `adapter-required`, or `incompatible`; never leave this as implicit prose.

### 2. Classify risk

Assign one class from [scorecard.md](references/scorecard.md):

- `R0`: read-only metadata/UI.
- `R1`: Host tools/services or user-owned plugin state, no Profile lifecycle writes.
- `R2`: external process, network, credentials, or device bridge.
- `R3`: Profile lifecycle, restart, remote control, or broad management.

Use the higher class when uncertain. Record non-goals and prohibited surfaces before coding.

Produce a risk register that names assets, actors, trust boundaries, write surfaces, failure impact, minimum evidence level, and the reason for choosing the class.

### 3. Select the standard pattern

- **Host-only bundle**: expose a public Cordis service/tool and contribute one or more unique patch rows.
- **Host + Client**: keep Browser code separate; register with `window.__ModuleLoader__.load()` and slots. Browser code must not import Host/Node modules.
- **Optional Web route**: delay registration with `ctx.inject(['webServer'], ...)`; headless/no-Web profiles must still boot.
- **Skill adapter**: mount isolated Skill files; do not silently install the external runtime, extension, or credentials.
- **ApiProxy bridge**: adapt the narrow public remote surface with an allowlist, redaction, authentication, bounded parsing, and fail-closed transport security.
- **Lifecycle manager**: treat every Profile change as an `R3` transaction and use the mutation protocol below.
- **Tool card contract**: prefer provider-neutral `presentCall`/`presentResult` render intents; use a custom Client Slot card only for a plugin-owned Tool when the inspected built-in vocabulary cannot express the outcome.

Create a bundle manifest with `dsh.bundle.patch`, a package-resolvable `cordis.patch.yml`, unique entry IDs, explicit files, version, license, and build contract. Remember that later patch layers replace a row's complete `config`; they do not deep-merge it.

Compare at least two plausible patterns when the choice affects permissions, process boundaries, install behavior, or user experience. Record benefits and costs; do not select an architecture only because an earlier project used it.

### 4. Implement least privilege

Use public services already provided by the inspected DSH version. If the required seam is absent, stop and propose an adapter or upstream change instead of patching core.

Prefer read-only discovery and dry-run/preview APIs. Make write features separately enabled. Validate schemas and size limits before business logic. Reject malformed profiles, ambiguous paths, unknown official components, stale state, replay, concurrent changes, and missing evidence.

For every model Tool, record the canonical output, model-facing renderer, pending card, completed card, durable presentation metadata, bounds/redaction, generic fallback, and live/replay evidence. Presenters must be deterministic and perform no I/O, clock/random access, session reads, or extra permission-bearing work. Never put credentials, full private files, model reasoning, or unbounded arguments into a card.

For recurring failure patterns, read [problem-playbook.md](references/problem-playbook.md).

Produce a permission matrix with each data source/action, owning side, allowed caller, redaction, size/rate limit, failure mode, and test. Any permission without a user outcome and a test is removed.

### 5. Apply the mutation protocol

For Profile/package/restart mutations, create a fresh typed plan for exactly one operation containing:

1. operation and target Profile;
2. immutable package/source identity;
3. exact file scope and expected precondition hashes;
4. command argv and working directory;
5. backup location and rollback procedure;
6. postcondition and health checks;
7. one exact confirmation phrase;
8. expiration and single-use identity.

Show the plan and wait for exact per-operation confirmation. Invalidate it on mismatch, expiry, concurrent change, or previous use. Back up before writing, commit atomically, run configuration and runtime health checks, and roll back on failure. A repository release never authorizes a local Profile update.

Treat the confirmation friction and transaction machinery as explicit costs. Accept those costs for `R3` because the alternative is silent, difficult-to-recover corruption of user state. Do not impose the mutation protocol on pure `R0` reads.

### 6. Climb the evidence ladder

Advance only with current evidence:

- `E0`: idea or plan.
- `E1`: static structure/source review.
- `E2`: automated unit/contract/fault tests.
- `E3`: disposable Profile install, `--dump-config`, startup, and API smoke.
- `E4`: separately confirmed real Profile version, process/port, official inventory/API, and visible UI readback.
- `E5`: external/public/device acceptance plus failure recovery or rollback evidence.

Never infer a higher level from a lower one. UI screenshots do not prove rollback; HTTP 200 does not prove visible UI; install success does not prove restart health; simulator output does not prove a real device.

For Tool cards, E2 includes deterministic presenter, malformed replay, redaction, bound, truncation, and generic-fallback tests. E3 includes live plus persisted replay parity in an isolated DSH runtime. Visible card behavior in the user's Profile remains E4.

Produce an evidence matrix per capability. Include negative and recovery evidence, not only the happy path. A score ranks readiness; it never grants authority or replaces a hard gate.

### 7. Release and install separately

Before repository release, synchronize package version, README, catalog entry, immutable install anchor, tests, and fixed source metadata. For Git sources, either ship built artifacts or declare a self-contained `prepare` script and disclose pnpm `allowBuilds`; pin a full commit SHA.

Run repository checks, source verification, and pack dry-run. Verify the remote commit and public assets after merge. Then stop. Update a real Profile only under a new confirmed mutation plan, restart it through the approved mechanism, and read back the resolved version and runtime state.

Produce two separate reports: repository release evidence and Profile/runtime acceptance evidence. When the second report is absent, state `Profile unchanged` or `Profile unverified`.

### 8. Make reusable plugins DSH STORE-ready

Read [marketplace.md](references/marketplace.md) whenever building a reusable third-party DSH plugin, assessing an existing repository for DSH STORE, or preparing a catalog entry.

Do not wait until submission to discover listing incompatibility. From the first scaffold, reserve unique package/catalog/entry IDs; declare repository, version, license, safe `dsh.bundle.patch`, package-relative Patch, runtime/build files, lifecycle scripts, permissions, dependencies, and compatibility evidence. At the start of every STORE assessment, run `node scripts/official-dsh-releases.mjs` and use its official latest-three window; do not reuse a remembered window. The resolver follows the highest active npm `latest`/`alpha`/`beta`/`rc` channel, excludes `next`-only and deprecated versions, and fails closed on invalid authority. The observed 2026-09-03 window is `0.1.2-alpha.3`, `0.1.2-alpha.4`, and `0.1.2-alpha.5`, but it is evidence rather than a permanent constant. Keep exact `compatibility.dshReleases` and matching `compatibility.dshOperations` records for install, start, uninstall, and rollback on every release in the resolved window. Historical keys may remain, but unknown metadata stays unknown instead of being guessed.

Keep STORE discovery and trusted installation physically and logically separate. A record in `registry/candidates.json` is discovery-only, carries no package/install/permission contract, and must normalize to `installable: false` with no allowed actions. It can move to `registry/catalog.json` only after a separate fixed-source, Bundle, license, permission, compatibility, and evidence review. Promotion, recommendation, sponsorship, Stars, or screenshots never upgrade verification.

Track four independent assurance records for trusted entries: discovery evidence, installability evidence, runtime evidence, and security-review evidence. Never infer one from another. A verified record requires a method, time, and HTTPS evidence URL; missing proof remains `unknown`.

Route each third-party repository to exactly one result:

- `direct`: standard DSH package at repository root;
- `monorepo`: standard package at explicit `manifestPath` + `installPath`;
- `adapter-required`: upstream is another host/runtime but exposes a narrow supported seam;
- `blocked`: source/authorization is unverifiable or the plugin violates a hard DSH boundary.

Derive source-update policy separately from listing eligibility:

- `source-verified`: only for an approved plugin with no file, network, command, credential, or install-lifecycle capability. A newer version may produce a normal fixed-SHA local plan after contract verification.
- `user-reviewed`: for a legitimate approved plugin with any elevated capability or change signal. The local marketplace shows the concrete changes and requires a distinct confirmation for every update; high risk alone does not require a catalog version bump or centralized Registry review.
- `external-only`: for projects that modify DSH native code or `@deepseek-ai/*`, claim a protected namespace, or disable/replace/shadow protected components. Expose only an explicitly unprotected GitHub route.

An unverifiable candidate version, source lineage, manifest, Patch, entry identity, or install contract is `update-blocked`, not user-reviewed. Catalog governs identity and policy; canonical GitHub governs newer versions, which the user's local marketplace resolves to a full Commit. Never install floating `main` or design a server-wide repository crawler.

Run both audits before a catalog candidate:

```bash
node scripts/official-dsh-releases.mjs
node scripts/audit-plugin.mjs /absolute/path/to/plugin --json
node scripts/audit-marketplace-entry.mjs /absolute/path/to/plugin \
  --entry /absolute/path/to/catalog-entry.json \
  --registry /absolute/path/to/current/catalog.json \
  --json
```

For large ecosystem discovery, create only discovery records first and run the candidate audit before touching the trusted catalog:

```bash
node scripts/audit-candidate-entry.mjs \
  --entry /absolute/path/to/candidate.json \
  --candidates /absolute/path/to/current/candidates.json \
  --catalog /absolute/path/to/current/catalog.json \
  --json
```

Use [candidate-entry.template.json](assets/candidate-entry.template.json). Candidate output never contains `packageName`, install paths, entry IDs, compatibility, permissions, risk, update policy, `installable`, or allowed actions.

Use [catalog-entry.template.json](assets/catalog-entry.template.json), but derive its values from the pinned repository, the live official latest-three DSH window, and the current Registry contract. Include fixed-source freshness, four assurance levels, and per-release operation evidence for every resolved release. An approved proposal needs at least one exact `compatible` result in that window; ranges and unknown values are not installable compatibility evidence. A local trusted candidate can be `READY_FOR_PINNED_SOURCE_VERIFICATION`; only current STORE validation plus fixed-Commit source verification can make it PR-ready. Only a merged remote catalog and public page readback prove actual listing.

Never silently edit or deploy DSH STORE while building the plugin. Prepare the candidate and evidence in the plugin work; make any STORE contribution a separate repository scope/branch with its own checks and authorization. Marketplace listing never authorizes real Profile installation.

### 9. Distribute public artifacts under a fixed contract

Read [distribution.md](references/distribution.md) before creating a GitHub Release, direct-download page, public artifact, or marketplace/build-site distribution.

Do not retain a blanket “website distribution is forbidden” rule after the owner explicitly authorizes publication and the license permits it. For public downloads, bind the ZIP, SHA-256 sidecar, release manifest, license, source link, README, and INSTALL to one immutable tag. Make the release manifest the machine-readable authority; website code must resolve the latest stable Release, read the manifest from that exact tag, compare asset names and URLs, and fail closed before enabling download.

For MIT distribution, show the license label, include `LICENSE` inside an independently downloadable archive, keep the source repository visible, and preserve the copyright and permission notice. Display version, file count, byte size, and SHA-256 dynamically from the validated manifest; never scrape README or copy those facts into a second runtime data source.

Keep artifact identity distinct from host identity. An Agent Skill download is not a DSH Bundle and must not be presented as a Profile install. A DSH Bundle download still does not authorize official-CLI installation, Profile mutation, or restart.

Before claiming public distribution complete, verify the tagged manifest and unauthenticated release assets, recompute the downloaded ZIP hash, read back the license/source links, and separately verify the visible public page when one exists. Website source/tests alone remain E1/E2; public page and asset readback are E5 only for the distribution surface.

## Quantify readiness

Run the deterministic read-only audit:

```bash
node scripts/audit-plugin.mjs /absolute/path/to/plugin
node scripts/audit-plugin.mjs /absolute/path/to/plugin --json
node scripts/audit-plugin.mjs /absolute/path/to/plugin --evidence /path/to/evidence.json
```

The audit scores static readiness out of 80 and traceable runtime evidence out of 20. It never proves runtime by itself. Use [scorecard.md](references/scorecard.md) for thresholds and the evidence JSON schema.

For a marketplace target, also run `audit-marketplace-entry.mjs`. Its result is a route and next gate, not a security certification or publication claim.

## Produce the required handoff

Use [templates.md](references/templates.md). Always report:

- host-fit conclusion and risk class;
- hard blockers and prohibited surfaces;
- readiness score plus evidence level;
- exact changed files and source identity;
- release tag, manifest authority, public artifact hash, and license when distributed;
- DSH STORE route, catalog candidate identity, pinned source, Registry check state, merged-listing state, and public marketplace readback when requested;
- Tool card decision, durable metadata, generic fallback, and live/replay evidence for every registered model Tool;
- tests and disposable/runtime evidence;
- real Profile/public/device state as a separate line;
- rollback/recovery state;
- the next unmet gate.

Also include a concise decision table with `decision`, `objective`, `benefit`, `cost`, `evidence`, and `reconsider when` columns. This makes future plugins reuse the reasoning rather than only the final choice.

Do not use “done” when only planning, source review, tests, packaging, or a static preview has completed.
