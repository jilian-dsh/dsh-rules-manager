# DSH decision guide

## Contents

1. How to use a decision card
2. Host fit before implementation
3. Read-only first
4. Risk classification
5. Standard Bundle instead of core modification
6. Host and Client separation
7. Optional Web-service injection
8. Public seams and least privilege
9. Profile patch semantics
10. Official CLI with fixed argv
11. Single-use mutation transactions
12. External restart ownership
13. Disposable tests
14. Evidence ladder
15. Repository release and Profile acceptance separation
16. Immutable source and catalog authority
17. External runtime and ApiProxy bridges
18. Licensed public artifact distribution
19. Marketplace-ready package and listing route
20. Provider-neutral Tool card before custom Client UI

## 1. How to use a decision card

Use every applicable card before implementation. Adapt the conclusion to the inspected DSH version and project; never copy the conclusion without checking its conditions.

For each card, record:

- **Objective**: outcome or failure being controlled.
- **Why**: causal mechanism, not a slogan.
- **Benefits**: safety, compatibility, maintainability, UX, or evidence gains.
- **Costs**: engineering time, UX friction, runtime overhead, reduced capability, or delayed release.
- **Use when / avoid when**: applicability boundary.
- **Procedure**: repeatable actions and artifacts.
- **Evidence / stop**: proof required to advance and fail-closed condition.
- **Reconsider when**: concrete signal that warrants a different choice.

## 2. Host fit before implementation

- **Objective**: avoid installing or rebuilding software for the wrong host.
- **Why**: an Obsidian, VS Code, browser, desktop, or MCP extension can expose similar features while using a completely different lifecycle and API contract. Feature similarity is not binary compatibility.
- **Benefits**: prevents wasted implementation, unsafe install attempts, and scope drift; reveals whether a small adapter is sufficient.
- **Costs**: adds reconnaissance time and may end with an honest `incompatible` result instead of visible code.
- **Use when**: every new plugin, imported repository, or “install this in DSH” request.
- **Avoid when**: never skip entirely; shorten only when the exact package and inspected DSH contract are already current and traceable.
- **Procedure**: identify original host; inspect manifest, `dsh.bundle.patch`, patch file, entry points, public DSH seam, state mutations, dependencies, and acceptance surface; compare native install, adapter, and standard Bundle.
- **Evidence / stop**: produce `compatible`, `adapter-required`, or `incompatible` with file/API evidence. Stop installation on unknown or incompatible.
- **Reconsider when**: upstream adds an official DSH bundle or DSH exposes the missing public seam.

## 3. Read-only first

- **Objective**: learn the real Profile, dependency, catalog, and runtime state before changing it.
- **Why**: DSH effective state is composed from bundles and several patch layers; assumptions from source or a previous run can be stale.
- **Benefits**: low blast radius, better plans, accurate hashes, simpler rollback, and useful inventory even if mutation is denied.
- **Costs**: delays visible changes and may require an extra user confirmation round.
- **Use when**: discovery, compatibility checks, marketplace scans, version diagnosis, and every R3 preflight.
- **Avoid when**: pure disposable fixtures may be created immediately, but they must remain isolated from real state.
- **Procedure**: read instructions; identify DSH/Profile version; inspect package specs, bundle order, patches, effective config, processes, ports, and public APIs; redact secrets; produce a state snapshot.
- **Evidence / stop**: snapshot includes source identity, hashes, ambiguities, and last-observed time. Stop if target or ownership is ambiguous.
- **Reconsider when**: none; even emergency repair needs a bounded read-only identity check first.

## 4. Risk classification

- **Objective**: scale design, tests, confirmation, and evidence to potential harm.
- **Why**: a read-only UI and a remote Profile controller cannot share the same acceptance bar.
- **Benefits**: avoids both under-testing dangerous features and over-engineering harmless reads; clarifies minimum evidence early.
- **Costs**: classification requires judgment and choosing the higher class can increase work.
- **Use when**: after host fit and whenever scope or permissions expand.
- **Avoid when**: do not freeze the initial class; reclassify on new external, credential, restart, or write surfaces.
- **Procedure**: list assets, actors, trust boundaries, mutations, external systems, maximum impact, recoverability, and required evidence; assign highest applicable `R0–R3`.
- **Evidence / stop**: risk register and matching test matrix. Stop if requested acceptance is below the class minimum.
- **Reconsider when**: a new capability crosses a trust boundary or a previously writable feature becomes read-only.

## 5. Standard Bundle instead of core modification

- **Objective**: extend DSH while preserving official upgrade, ownership, and recovery boundaries.
- **Why**: core or `@deepseek-ai/*` edits entangle the plugin with internal implementation and may shadow official behavior.
- **Benefits**: independent versioning, uninstallability, clearer review, smaller upgrade surface, and marketplace compatibility.
- **Costs**: public extension seams may be narrower; some desired features must be reduced, adapted, or deferred.
- **Use when**: all normal DSH plugins.
- **Avoid when**: only upstream DSH development explicitly scoped as a core contribution, which is not a plugin task.
- **Procedure**: declare `dsh.bundle.patch`; create package-resolvable patch and unique rows; use public Host services; document missing seams and non-goals.
- **Evidence / stop**: clean scan for core/official writes and successful disposable Bundle composition. Stop if the feature requires hidden/internal mutation APIs.
- **Reconsider when**: DSH publishes a supported extension API or the user separately commissions an upstream contribution.

## 6. Host and Client separation

- **Objective**: keep privileged Node/Profile operations out of the browser trust boundary.
- **Why**: Browser code is more exposed and cannot safely own filesystem, subprocess, credentials, or full Profile data.
- **Benefits**: least privilege, smaller leakage surface, simpler Client code, and independent Host/API tests.
- **Costs**: requires an explicit API, schemas, redaction, loading/error states, and two-sided compatibility work.
- **Use when**: a DSH settings page, dashboard, slot, or browser interaction is needed.
- **Avoid when**: Host-only capability has no user-facing Browser surface.
- **Procedure**: keep Node imports in Host; expose narrow typed actions/data; validate and redact Host responses; register Client through current ModuleLoader/slot APIs; add contract tests.
- **Evidence / stop**: Client import scan, forbidden-field tests, API schema tests, and visible UI readback. Stop on secrets or Host modules in Client.
- **Reconsider when**: UI is no longer required or DSH replaces the Client contract.

## 7. Optional Web-service injection

- **Objective**: let the plugin boot in headless or no-Web Profiles.
- **Why**: `webServer` can be absent or mounted after the plugin; eager access creates order-dependent startup failures.
- **Benefits**: broader Profile compatibility, deterministic lifecycle, and clean disposal.
- **Costs**: route registration becomes asynchronous/lifecycle-aware and tests need both Web and no-Web fixtures.
- **Use when**: routes or Browser APIs depend on `webServer`.
- **Avoid when**: the plugin has no Web surface.
- **Procedure**: register inside `ctx.inject(['webServer'], ...)`; return a disposer; keep core Host service independent of route presence.
- **Evidence / stop**: Web fixture exposes routes and headless fixture boots without them. Stop release if absence of Web crashes Host startup.
- **Reconsider when**: inspected DSH contract makes Web a hard declared dependency and the product intentionally supports only that Profile type.

## 8. Public seams and least privilege

- **Objective**: implement only the permissions required by the user outcome.
- **Why**: internal APIs and broad proxies increase upgrade coupling and turn a narrow feature into a general control channel.
- **Benefits**: smaller attack surface, clearer UX, easier review, better forward compatibility, and stronger negative tests.
- **Costs**: some convenience features disappear; additional allowlists, schemas, and adapters are needed.
- **Use when**: every Host service, tool, route, ApiProxy remote, external process, and data projection.
- **Avoid when**: never replace least privilege with “trusted user”; local compromise and implementation mistakes still matter.
- **Procedure**: build a permission matrix; map each action to a user outcome; use inspected public seams; impose input/output limits; redact sensitive fields; reject unknowns.
- **Evidence / stop**: allowlist and forbidden-action tests. Stop if an action has no named outcome, owner, bound, or test.
- **Reconsider when**: validated user demand justifies a separately reviewed permission expansion.

## 9. Profile patch semantics

- **Objective**: avoid losing effective configuration or creating duplicate rows during composition.
- **Why**: later patch layers replace a row's complete `config`; they do not deep-merge individual keys. Bundle order and unique IDs affect cold start.
- **Benefits**: predictable config, fewer boot failures, and auditable overlays.
- **Costs**: overrides are verbose and require knowledge of all required keys/expressions.
- **Use when**: adding or overriding any Bundle/Profile/home/CLI patch row.
- **Avoid when**: do not override an official row when a unique additive row can satisfy the outcome.
- **Procedure**: inspect effective order; prefer a unique row; if overriding, restate every required key; scan all IDs; compare `--dump-config` before restart.
- **Evidence / stop**: config diff, unique-ID check, cold-start smoke. Stop on unknown official row semantics or duplicate IDs.
- **Reconsider when**: official patch semantics change to documented deep merge.

## 10. Official CLI with fixed argv

- **Objective**: keep package reconciliation inside the supported DSH lifecycle and remove shell injection/quoting ambiguity.
- **Why**: official CLI owns dependency changes and `dsh.profile.bundles`; shell strings add expansion, injection, and platform-specific behavior.
- **Benefits**: consistent state, safer arguments, precise logs, and easier fault testing.
- **Costs**: requires locating the executable and preserving a minimal PATH; direct file edits may appear simpler.
- **Use when**: package add/remove/update and other supported DSH lifecycle operations.
- **Avoid when**: do not call CLI for a read-only scan or use it to hide unsupported Profile edits.
- **Procedure**: resolve exact executable; build immutable argv array and cwd; set `shell=false`; capture bounded stdout/stderr; verify resulting bundles and config.
- **Evidence / stop**: command record without secrets, exact exit status, pre/post bundle list, and config check. Stop on ambiguous executable or shell fallback.
- **Reconsider when**: official DSH exposes a safer typed API with equivalent lifecycle guarantees.

## 11. Single-use mutation transactions

- **Objective**: make every Profile write bounded, intentional, concurrency-safe, and recoverable.
- **Why**: plans become stale; users or processes can edit the same files; multi-step installs can fail after partial state changes.
- **Benefits**: exact scope, clear authorization, deterministic rollback, and meaningful audit history.
- **Costs**: more code, storage, user friction, and slower repeated operations.
- **Use when**: install, update, enable, disable, remove, migrate, Profile patch, or restart (`R3`).
- **Avoid when**: pure reads and disposable fixtures do not require real-state confirmation.
- **Procedure**: create fresh typed plan; bind source and hashes; list fixed argv; set expiry and exact phrase; confirm once; lock and recheck; back up; commit atomically; run health checks; roll back on failure; mark used.
- **Evidence / stop**: transaction/fault tests plus plan/backup/health/rollback record. Stop on any mismatch, expiry, reuse, missing backup, or failed health check.
- **Reconsider when**: never remove atomicity or rollback; UX may batch multiple explicitly enumerated operations into one independently reviewable transaction only if failure remains all-or-nothing.

## 12. External restart ownership

- **Objective**: restart DSH without the controlling logic dying mid-operation.
- **Why**: code inside the Host loses execution when it terminates its own process; a briefly open port is not stable health.
- **Benefits**: observable restarts, bounded retries, circuit breaking, and reliable rollback.
- **Costs**: introduces a supervisor/Guardian, IPC/state, lifecycle packaging, and another component to secure.
- **Use when**: a plugin manages Host restart or recovery.
- **Avoid when**: manual restart is acceptable; prefer manual action over adding a supervisor solely for convenience.
- **Procedure**: obtain separate confirmation; hand a bounded plan to approved external supervisor; use fixed argv; track Boot ID, heartbeats, retries, last error, and circuit state.
- **Evidence / stop**: new stable Boot ID, sustained heartbeat, config/API/plugin checks, failure and rollback tests. Stop after retry budget or circuit open.
- **Reconsider when**: DSH provides a supported external lifecycle manager.

## 13. Disposable tests

- **Objective**: prove behavior without risking the user's active DSH state.
- **Why**: tests intentionally inject malformed config, command failure, crashes, and concurrent changes.
- **Benefits**: repeatability, safe fault injection, CI portability, and easier cleanup.
- **Costs**: fixtures can diverge from real Profiles; environment setup takes time and disk space.
- **Use when**: every automated test and isolated acceptance run.
- **Avoid when**: real Profile testing is a separate, confirmed E4 gate, never a substitute for disposable tests.
- **Procedure**: create temp `DSH_HOME`/Profile; copy minimal fixtures; block access to real home; run unit, contract, negative, transaction, CLI, startup, and UI/API smoke; remove fixture.
- **Evidence / stop**: fixture path, command results, no-real-home guard, and cleanup result. Stop if any test resolves to real `~/.dsh`.
- **Reconsider when**: fixture contract drifts; refresh it from redacted structure, not a full private Profile copy.

## 14. Evidence ladder

- **Objective**: make completion claims match what was directly observed.
- **Why**: source review, tests, install output, API, UI, device, public readback, and rollback prove different surfaces.
- **Benefits**: honest status, clear next gates, faster diagnosis, and fewer “works locally” misunderstandings.
- **Costs**: full E4/E5 evidence can be slow, require credentials/devices, or need explicit authorization.
- **Use when**: every capability and every handoff.
- **Avoid when**: never use one project-wide label to hide an untested surface.
- **Procedure**: list capabilities; assign each current `E0–E5`; attach commands, timestamps, artifacts, or readbacks; list negative/recovery evidence and next gate.
- **Evidence / stop**: no claim exceeds its strongest direct proof. Stop promotion when evidence is stale, indirect, or from another environment.
- **Reconsider when**: evidence expires after code, dependency, Profile, network, device, or release changes.

## 15. Repository release and Profile acceptance separation

- **Objective**: prevent publishing code from silently becoming authorization to mutate a local installation.
- **Why**: repository state and active Profile state have different owners, versions, processes, and failure modes.
- **Benefits**: safer releases, explicit user control, precise diagnosis of old UI/version, and independent rollback.
- **Costs**: requires two plans, two reports, and sometimes two confirmation cycles.
- **Use when**: every versioned release that may later be installed or upgraded.
- **Avoid when**: a disposable acceptance Profile may be installed as part of E3, but it still does not authorize the real Profile.
- **Procedure**: complete and verify repository release; stop; inspect real Profile; create a new mutation plan; confirm; update/restart; read back resolved version and UI/runtime.
- **Evidence / stop**: remote commit/assets/checks report plus separate Profile/runtime report. Stop if the source anchor or target Profile differs.
- **Reconsider when**: never collapse authority; automation may link the reports but must retain separate gates.

## 16. Immutable source and catalog authority

- **Objective**: make installed code and marketplace claims reproducible and verifiable.
- **Why**: branches/tags can move or metadata can drift; local bundled catalogs can become stale.
- **Benefits**: supply-chain traceability, consistent version display, safer updates, and repeatable rollback.
- **Costs**: every release must synchronize manifest, README, catalog, tests, and full commit anchor; offline data can be outdated.
- **Use when**: marketplace, Git installs, compatibility/security metadata, and release artifacts.
- **Avoid when**: development links can remain mutable only when labeled local/unpublished and excluded from marketplace claims.
- **Procedure**: make fixed remote catalog authoritative; pin full commit; validate manifest/version/patch/lifecycle/IDs; label bundled catalog offline fallback; keep unknown fields unknown.
- **Evidence / stop**: remote fixed-commit readback and cross-surface consistency tests. Stop on moving sources or guessed metadata.
- **Reconsider when**: an official signed registry provides stronger authority; migrate with an explicit provenance plan.

## 17. External runtime and ApiProxy bridges

- **Objective**: integrate external CLIs, networks, devices, or accounts without turning DSH into an unrestricted proxy.
- **Why**: the adapter, external runtime, credentials, transport, and remote device are separate trust and failure domains.
- **Benefits**: narrow blast radius, clearer prerequisites, channel-specific diagnosis, and staged product validation.
- **Costs**: more components and separate tests; allowlists limit generality; encryption and replay protection add complexity.
- **Use when**: Skill adapters, external process bridges, OAuth/account channels, mobile control, or remote relay.
- **Avoid when**: a pure Host integration can meet the outcome without external state.
- **Procedure**: separate adapter install from runtime setup; define allowlist and forbidden actions; redact projections; authenticate; add AEAD/replay protection when transport is untrusted; bound frames/retries; validate each channel independently.
- **Evidence / stop**: adapter E3, external doctor/real read, forbidden-action tests, transport tamper/replay tests, and device/public E5 where claimed. Stop if secrets or broad Host surfaces cross the bridge.
- **Reconsider when**: real usage data justifies a new separately reviewed action or cloud relay.

## 18. Licensed public artifact distribution

- **Objective**: allow direct website downloads without losing license, source, version, checksum, or artifact identity.
- **Why**: forbidding every website download blocks legitimate open-source distribution, while copying version/SHA facts into HTML or reading floating `main` creates drift and unreproducible downloads.
- **Benefits**: low-friction installation for Agent Skills and artifacts, visible MIT terms, reproducible release assets, dynamic metadata, and independent public verification.
- **Costs**: release coordination, CI checks, GitHub/API availability, cache diagnosis, and a separate public-page E5 gate.
- **Use when**: the owner authorizes public distribution and the selected license permits it.
- **Avoid when**: repository/license authority is unknown, the artifact contains private state, or a direct download would be mislabeled as a DSH Profile installation.
- **Procedure**: classify the artifact; choose license; create immutable Release; include ZIP, SHA sidecar, manifest, INSTALL, and embedded license; make manifest authoritative; have the page resolve latest Release then tagged manifest; compare release assets/URLs; show source and license; fail closed on mismatch; read back and hash the public ZIP.
- **Evidence / stop**: consistency verifier and CI pass, tag/Release/assets are public, downloaded hash matches, archive contains license, page displays matching dynamic facts and disables download on invalid data. Stop on `UNLICENSED`, moving sources, stale duplicated runtime metadata, or any mismatch.
- **Reconsider when**: scale, API limits, signatures, availability, or governance justify a first-party signed registry/artifact host.

## 19. Marketplace-ready package and listing route

- **Objective**: make third-party plugins listable without weakening DSH safety or discovering structural incompatibility only at submission time.
- **Why**: DSH STORE binds one public GitHub repository/Commit to a package manifest, Bundle Patch, entry IDs, lifecycle scripts, license, permissions, compatibility, and catalog identity. A plugin can work from a local checkout yet fail this reproducibility contract.
- **Benefits**: fewer rejected submissions, less late refactoring, self-contained Git installs, truthful risk metadata, repeatable review, and a clear adapter path for non-DSH projects.
- **Costs**: more package/release metadata, unique-ID coordination, conservative unknown states, disposable install work, and periodic refresh against the current Registry schema/categories.
- **Use when**: any reusable DSH Bundle, existing third-party listing assessment, monorepo package, catalog candidate, or DSH STORE submission.
- **Avoid when**: a private/local experiment may defer publication metadata, but it must remain labeled local/unpublished and cannot claim STORE readiness.
- **Procedure**: reread the current STORE policy/schema/validator/catalog; run host fit; choose `direct`, `monorepo`, `adapter-required`, or `blocked`; standardize manifest/Patch/build/license/lifecycle/IDs; generate conservative catalog metadata; run general and marketplace audits; complete disposable install; pin a full Commit; verify remote manifest/Patch; run Registry checks in a separate STORE contribution scope; verify merge and public page separately.
- **Evidence / stop**: local audit and catalog candidate, pinned-source readback, Registry CI, merged catalog, and public page are separate gates. Stop approved listing on floating/non-GitHub source, unsafe paths, mismatches, official shadowing, duplicate identity, invalid category, unlicensed copying, or guessed critical metadata.
- **Reconsider when**: STORE adopts a signed registry, package registry, new schema/status model, or official submission API; update the reference and deterministic audit before the next listing.

## 20. Provider-neutral Tool card before custom Client UI

- **Objective**: make a model Tool's pending, completed, failed, and replayed states understandable without binding its semantics to one DSH Client implementation.
- **Why**: DSH separates canonical Tool JSON, model-visible rendering, provider-neutral card intents, and Client components. Mixing them makes Code Mode parse display text, duplicates data in session logs, or forces a Tool to import UI types. A custom `tool.call.toolview` registration can also replace an existing product card when its key collides.
- **Benefits**: one Tool definition serves live streaming, replay, CLI/editor bridges, generic fallback, and future clients; card data stays bounded and the canonical API remains stable.
- **Costs**: built-in card discriminants are intentionally limited; presenters, `presentationMeta`, malformed replay, redaction, and caps require explicit design and tests. A generic fallback may be less visually rich.
- **Use when**: every model Tool. Choose `generic`, `terminal`, or `diff` for pending calls and the inspected completed-card union for results; explicitly record `none/generic fallback` when no custom projection is needed.
- **Avoid when**: do not use a terminal card for any Tool that happens to spawn a process, a diff card for non-file mutation, or a custom Client card merely for styling. Do not replace official Tool card keys.
- **Procedure**: inspect the target DSH exports; define canonical output and `output.render`; choose pending/completed card semantics; map fields to args or bounded JSON `presentationMeta`; specify redaction, truncation, generic fallback, failure, and replay; implement pure presenters; add a Client Slot only for a plugin-owned Tool whose outcome cannot fit the provider-neutral vocabulary.
- **Evidence / stop**: require deterministic E2 presenter/replay tests, malformed-record fallback, JSON/size bounds, secret/path redaction, truthful totals/status, and import scans; require isolated live/replay parity at E3. Stop on I/O/state/time/randomness in presenters, unsupported discriminants, unbounded persistence, model/card disagreement, or official card replacement.
- **Reconsider when**: the exported DSH card union or Client bridge changes, a new built-in card satisfies the outcome, or real user evidence justifies a separately reviewed plugin-owned custom card.
