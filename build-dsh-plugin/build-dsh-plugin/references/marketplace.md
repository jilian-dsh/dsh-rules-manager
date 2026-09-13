# DSH STORE listing contract

## Contents

1. Scope and authority
2. Listing outcomes
3. Minimum user input
4. Eligibility routing
5. Direct-listing contract
6. Monorepo and adapter routes
7. Metadata and uncertainty
8. Preflight workflow
9. Failure taxonomy
10. Submission and evidence gates
11. Benefits, costs, and alternatives

## 1. Scope and authority

Use this reference whenever a plugin is intended for DSH STORE, an existing third-party repository is being assessed for listing, or a catalog entry is being prepared.

Do not modify the STORE implementation while building a plugin. Read its current public contract first because the schema, categories, protected IDs, and review policy can change. Treat these upstream files as authoritative for the current listing attempt:

- `registry/README.md` for human policy;
- `registry/candidates.schema.json` and `src/candidates.mjs` for the non-installable discovery contract;
- `registry/candidates.json` for the candidate discovery layer, which is not an install authority;
- `registry/catalog.schema.json` and `src/catalog.mjs` for the enforced data/source contract;
- `registry/catalog.json` for current categories, duplicates, and runtime metadata;
- `.github/ISSUE_TEMPLATE/plugin-submission.yml` for submission inputs;
- the Registry validation workflow for required checks.

The current runtime authority is the GitHub-hosted `registry/catalog.json`. A bundled copy may be an explicitly labeled read-only fallback, but it is not a second authority. Never infer acceptance from an old local catalog or from the public page alone.

Candidate discovery is a physically separate registry. Candidate records never contain trusted install fields, never produce DSH operation plans, and normalize to `installable: false` plus an empty allowed-action list. Moving a repository from discovery to trusted catalog is a separate promotion transaction, not a field flip.

## 2. Listing outcomes

Keep four outcomes distinct:

| Outcome | Meaning | Allowed next action |
| --- | --- | --- |
| `direct` | Repository already contains a standard DSH Bundle contract | Prepare a pinned catalog candidate and run source verification |
| `monorepo` | Standard DSH package lives in a repository subdirectory | Set both `manifestPath` and `installPath`, then verify the same pinned Commit |
| `adapter-required` | Upstream is not a DSH Bundle but exposes a usable public seam | Build a separately owned standard DSH adapter; do not mislabel upstream as directly installable |
| `blocked` | Core modification, official shadowing, unverifiable ownership/source, or another hard boundary exists | Stop approved listing; report the smallest safe remediation |

Before those engineering outcomes, a repository may exist only as `candidate-discovery`. This means the repository was found and bounded discovery metadata was recorded; it does not mean installable, runtime verified, security reviewed, compatible, or approved.

Catalog state is separate from engineering route:

- `approved`: visible and eligible for guarded marketplace operations after source verification;
- `blocked`: may remain visible with an explicit reason and manual GitHub route, but must not be presented as protected installable;
- `unlisted`: hidden from the public catalog while installed users may still manage their local copy.

Source-update policy is separate from listing status:

- `source-verified` permits a normal local fixed-SHA update plan only when both the plugin and candidate are low risk and the source/install contract verifies.
- `user-reviewed` keeps legitimate higher-risk plugins in the marketplace. The local marketplace shows permission, script, dependency, Bundle, and code changes; the user decides each update with a separate confirmation.
- `external-only` denies guarded marketplace install/update for DSH-native mutation, protected namespace/component interference, or another hard boundary, while allowing an explicitly unprotected GitHub link.
- `update-blocked` is a candidate result, not a catalog policy: use it when lineage, version, manifest, Patch, entry IDs, or installation contract cannot be verified.

The GitHub catalog governs identity and update policy. The canonical plugin repository governs newer versions. The user's local marketplace resolves the upstream branch to a full Commit and performs the bounded check; it never installs floating `main`. Do not require a central crawler or a catalog edit for every legitimate high-risk release.

`blocked` is not a way to bypass a dangerous contract. It is a truthful discovery/status option for incomplete or unverified third-party work.

## 3. Minimum user input

For an existing third-party plugin, the user normally supplies only:

1. the public GitHub repository URL;
2. the desired outcome: approved listing, blocked discovery entry, or compatibility assessment;
3. the target DSH version/Profile/system when compatibility matters;
4. whether the user owns the repository or is authorized to propose changes;
5. acceptance: Registry CI plus public catalog/page readback, or a smaller planning result.

The agent derives the package path, manifest, Bundle Patch, entry IDs, lifecycle scripts, permission signals, compatibility evidence, risk, catalog fields, fixed Commit, tests, and remediation route. Ask for a monorepo subdirectory only when several plausible packages remain after inspection. Never ask the user to manually transcribe fields the repository can prove.

## 4. Eligibility routing

Run host-fit and license/source checks before generating a catalog entry:

1. **Direct route**: public GitHub repository, standard package manifest, safe `dsh.bundle.patch`, resolvable patch, and supported DSH seam.
2. **Monorepo route**: same contract in one unambiguous subdirectory; pin the repository Commit and declare package-relative paths.
3. **Adapter route**: no direct Bundle contract, but a documented external API/CLI/Skill seam can be wrapped without modifying DSH or upstream private state.
4. **Upstream-change route**: repository is close to compatible; propose manifest/Patch/build/license changes to the owner, then assess the resulting immutable Commit.
5. **Blocked route**: requires DSH core or official-package changes, disables/shadows official inventory, has no authorized public source, exposes secrets, or cannot be made reproducible.

Do not fork or redistribute an unlicensed repository merely to make it listable. A compatible adapter may depend on the user installing an external runtime separately, but it must disclose that boundary and cannot silently install credentials or the upstream product.

## 5. Direct-listing contract

Before an `approved` catalog candidate, require all of the following:

### Repository and immutable identity

- public canonical `https://github.com/<owner>/<repo>` repository;
- one full lowercase 40-character Git Commit, not a branch, floating tag, npm-only package, arbitrary archive URL, or local path;
- package path stays inside that repository; no traversal or backslashes;
- package name is unique in the current catalog and the catalog ID is unique.

### Manifest and Bundle Patch

- `manifestPath` resolves to valid JSON at the pinned Commit;
- manifest `name`, semantic `version`, and declared license agree with the catalog;
- manifest declares a safe relative `dsh.bundle.patch`;
- the Patch exists at the same Commit and inserts globally unique DSH entry IDs;
- catalog `entryIds` exactly describe the package's inserted rows;
- the Patch does not disable, replace, or shadow protected/official components;
- runtime/build files required by the manifest are present in Git installs.
- model Tools use only card discriminants exported by the declared DSH compatibility range; provider-neutral presenter/replay/fallback tests ship with the source, and no Client contribution replaces an official Tool card key.

### Lifecycle and build

- list exactly which of `preinstall`, `install`, `postinstall`, and `prepare` exist;
- catalog `risk.installScripts` matches the pinned manifest exactly;
- TypeScript or generated-runtime packages either commit executable output or provide a self-contained disclosed `prepare` path;
- disclose pnpm build approval such as `allowBuilds` when it is genuinely required; never hide install-time execution.

### Catalog metadata

- required identity, status, compatibility, details, permissions, dependencies, review, and risk fields are structurally valid;
- categories exist in the current Registry category map;
- `approved` entries declare at least one entry ID;
- `blocked`/`unlisted` entries include a concrete `statusReason`;
- metadata comes from the pinned repository and current acceptance evidence, not local guesses.
- resolve the official latest-three window immediately before review with `node scripts/official-dsh-releases.mjs`; its npm authority follows active `latest`/`alpha`/`beta`/`rc` channels, excludes `next`-only and deprecated versions, and must fail closed when unavailable;
- `compatibility.dshReleases` explicitly marks every full version in that live window as `compatible`, `incompatible`, or `unknown`; an approved proposal needs at least one exact `compatible` result. The 2026-09-03 window is `0.1.2-alpha.3`, `0.1.2-alpha.4`, and `0.1.2-alpha.5`, but must be refreshed rather than copied forward;
- `compatibility.dshOperations` records `install`, `start`, `uninstall`, and `rollback` as `passed`, `failed`, or `unknown` for every release in the live window. Historical keys may remain; version-range compatibility does not substitute for exact compatibility or operation evidence.
- `source.updatedAt`, `source.observedAt`, and `source.provenance` bind freshness sorting to pinned source evidence; a recommendation flag never substitutes for freshness.
- `assurance.discovery`, `assurance.installability`, `assurance.runtime`, and `assurance.securityReview` remain independent. Verified evidence requires a method, check time, and HTTPS evidence URL; missing proof stays `unknown`.
- when the current schema supports `updatePolicy`, derive `source-verified`, `user-reviewed`, or `external-only` from the rules above; never label a permission-bearing plugin `source-verified`.
- Registry trust policy must keep candidate installs disabled, unknown facts unverified, and promotion/sponsorship independent of verification state.

Use [catalog-entry.template.json](../assets/catalog-entry.template.json) as a starting shape, then replace every placeholder from inspected evidence.

## 6. Monorepo and adapter routes

### Monorepo

- set `manifestPath` to the package manifest, for example `plugins/foo/package.json`;
- set `installPath` to the package directory, for example `plugins/foo`;
- keep both paths relative, normalized, and inside the same repository;
- resolve the Bundle Patch relative to `manifestPath`;
- pin the repository Commit, not a separate moving package reference;
- verify a fresh install of the subdirectory source in a disposable Profile.

This route preserves upstream layout and avoids unnecessary repository forks. Its cost is more path/build complexity and a higher chance that root-only scripts or workspace dependencies make Git installation non-self-contained.

### Adapter

Create a new standard DSH package only when the upstream host is different but a supported public seam exists. Record:

- upstream host/runtime and separately installed prerequisites;
- adapter-owned package, manifest, Patch, entry IDs, permissions, and tests;
- exact API/CLI/protocol allowlist and failure behavior;
- license authority for any copied or redistributed code;
- separate evidence for adapter load, external runtime health, account/channel operation, and DSH Profile install.

The adapter route increases maintenance and creates two compatibility surfaces. Prefer an upstream-native DSH Bundle when the owner can supply one.

## 7. Metadata and uncertainty

Conservative values improve trust without needlessly excluding third-party plugins:

- use `unknown`, `unreviewed`, `null`, or an empty compatibility list where the current schema permits them and proof is absent;
- never convert “search did not find access” into permission `none`;
- calculate permission level from the highest credible file/network/command/credential capability;
- record external runtimes, services, accounts, and system packages explicitly;
- treat `automated-scan` and `author-verified` as evidence provenance, not security certification;
- do not claim DSH/system/Profile compatibility until the relevant disposable or real acceptance exists.

For an approved install path, unknown critical compatibility or permission behavior may justify `blocked` until verified. The remedy is evidence, not invented metadata.

## 8. Preflight workflow

Run this flow from the beginning of plugin development, not only before submission:

1. inspect the current candidate and trusted Registry contracts plus categories;
2. for ecosystem-scale discovery, create only a record from [candidate-entry.template.json](../assets/candidate-entry.template.json) and run `audit-candidate-entry.mjs`; do not add install metadata or touch the trusted catalog;
3. for a separately selected promotion candidate, run host-fit and choose direct, monorepo, adapter, upstream-change, or blocked route;
4. generate the standard manifest/Patch and reserve globally unique package/catalog/entry IDs;
5. make license, repository, permissions, dependencies, compatibility, lifecycle scripts, fixed-source freshness, and four assurance levels explicit;
6. run the general plugin audit;
7. generate a proposed trusted catalog entry and run the marketplace audit:

```bash
node scripts/audit-candidate-entry.mjs \
  --entry /absolute/path/to/candidate.json \
  --candidates /absolute/path/to/current/candidates.json \
  --catalog /absolute/path/to/current/catalog.json

node scripts/audit-marketplace-entry.mjs /absolute/path/to/plugin \
  --entry /absolute/path/to/catalog-entry.json \
  --registry /absolute/path/to/current/catalog.json
```

8. run package tests, pack/extraction checks, and a disposable official-CLI install/start/uninstall/rollback matrix for every claimed release;
9. for model Tools, compare live and persisted replay cards, generic fallback, metadata bounds/redaction, and the oldest supported DSH card union;
10. release or identify one immutable Commit, then reread manifest/Patch from that exact Commit;
11. in a separate STORE contribution worktree, promote the reviewed candidate by changing only the trusted catalog entry and required submission artifacts;
12. run the STORE's current `validate:registry` and `verify:registry-sources` checks;
13. submit a PR and wait for Registry CI/review;
14. after merge, read the GitHub catalog and public marketplace page independently.

For an already-listed plugin update, the normal path ends before a Registry contribution when the local marketplace can verify a newer immutable candidate under its declared policy. A Registry change remains necessary for identity, policy, metadata, status, repository, or compatibility changes—not merely because a high-risk plugin released a newer version.

The Skill may generate the candidate entry and contribution instructions. It must not silently modify or deploy DSH STORE; that repository is a separate target and authority.

## 9. Failure taxonomy

| Code | Symptom | Root cause | Route/remediation |
| --- | --- | --- | --- |
| `MKT001` | npm/local/branch URL supplied | Source is not a pinned public GitHub repository | Obtain authorized GitHub source and pin a full Commit |
| `MKT002` | Manifest has no `dsh.bundle.patch` | Project is not directly installable as a DSH Bundle | Add upstream Bundle contract or build an adapter |
| `MKT003` | Patch missing/unsafe | Package cannot reproducibly compose | Fix package-relative Patch and reject traversal |
| `MKT004` | Package/version/license mismatch | Catalog and pinned source describe different artifacts | Synchronize one release identity; do not edit only the catalog |
| `MKT005` | Entry IDs mismatch/duplicate | Catalog cannot prove composed rows or cold start may collide | Reserve unique IDs and make Patch/catalog exact |
| `MKT006` | Lifecycle scripts mismatch | Hidden or stale install-time behavior | Declare exact scripts; commit runtime output or disclose prepare |
| `MKT007` | Official component disabled/shadowed | Plugin violates DSH ownership boundary | Redesign as additive rows; block until removed |
| `MKT008` | Permission/compatibility evidence absent | Metadata was guessed or omitted | Preserve unknown; use blocked status until critical evidence exists |
| `MKT009` | Monorepo root fails install | Package depends on root-only workspace/build state | Fix self-contained subpackage or publish an adapter/release artifact |
| `MKT010` | Catalog ID/package/category conflict | Candidate was created without current Registry readback | Rebase on current catalog and choose a valid unique identity |
| `MKT011` | No redistribution/modification authority | Repository license or ownership is insufficient | Ask owner to license/change upstream; do not fork-copy silently |
| `MKT012` | Local checks pass but listing is absent | PR, remote catalog, or public page was not verified | Keep status partial; complete Registry CI, merge, and public readback |
| `MKT013` | Source/trust policy is absent or weak | Freshness, candidate isolation, or promotion boundary cannot be proved | Refresh from current STORE and fail closed before promotion |
| `MKT014` | Assurance levels are missing or conflated | Discovery, installability, runtime, and security review were treated as one claim | Record four independent evidence states; promotion does not upgrade them |
| `MKT015` | Historical or current release operation evidence is incomplete | A version-range claim was mistaken for install/start/uninstall/rollback proof | Keep each operation unknown until independently tested |
| `CANDIDATE_TRUST_BOUNDARY` | Candidate contains install fields or weak registry policy | Discovery data could leak into guarded operations | Remove trusted fields and keep the candidate in the separate registry |
| `CANDIDATE_DUPLICATE_TRUSTED` | Candidate repository already exists in trusted catalog | One repository is represented in both layers | Update/review the trusted record instead of duplicating discovery |

## 10. Submission and evidence gates

Track these separately:

| Gate | Required proof |
| --- | --- |
| Candidate discovery | Candidate audit, fail-closed boundary, no install fields/actions, no trusted duplicate |
| Plugin structure | General audit plus marketplace audit, no hard blocker |
| Package | tests, pack/extraction, runtime files, license, lifecycle disclosure |
| DSH compatibility | per-release install/start/uninstall/rollback evidence; disposable official-CLI dump-config, cold start, relevant API/UI smoke |
| Tool card compatibility | supported discriminants, presenter purity, bounded durable metadata, generic fallback, and live/replay parity for each Tool |
| Pinned source | unauthenticated fixed-Commit manifest/Patch readback and exact metadata match |
| Catalog candidate | current schema/categories/duplicates, fixed-source freshness, four assurance levels, and promotion boundary pass locally |
| Registry contribution | STORE `validate:registry` and `verify:registry-sources` pass in the contribution branch |
| Merged listing | merged GitHub `catalog.json` contains the exact Commit and status |
| Public marketplace | plugin is visible/hidden/blocked exactly as intended and links resolve |

Only the last two gates prove actual listing. Plugin tests and a candidate JSON are preparation evidence, not marketplace publication.

## 11. Benefits, costs, and alternatives

### Marketplace-ready by default

- **Objective**: prevent late structural rewrites and rejection.
- **Why**: package identity, Patch paths, entry IDs, lifecycle, license, and permissions are cheapest to fix before public dependencies and users exist.
- **Benefits**: faster review, reproducible installs, consistent metadata, and easier rollback.
- **Costs**: more fields/tests during initial development and ongoing Registry-schema refresh work.
- **Use when**: any reusable third-party DSH plugin, even if publication is deferred.
- **Alternative**: local-only plugin; keep publication `none` and mark marketplace evidence unverified.

### Blocked discovery entry

- **Objective**: make an interesting third-party project discoverable without implying guarded installation.
- **Benefits**: preserves visibility and a truthful risk reason.
- **Costs**: users may still choose unprotected manual installation; messaging must be explicit.
- **Use when**: source exists but critical compatibility/security evidence is incomplete and current STORE policy accepts the entry.
- **Avoid when**: the source is malicious, unauthorized, private, or violates hard DSH boundaries; omit/unlist it instead.

### Upstream change versus adapter

- **Upstream change advantage**: one package and lifecycle; least long-term duplication.
- **Upstream change disadvantage**: depends on maintainer acceptance and release timing.
- **Adapter advantage**: controlled DSH contract can ship independently.
- **Adapter disadvantage**: two runtimes, two licenses, more drift and support burden.
- **Decision**: prefer upstream-native support when feasible; use an adapter only with a narrow stable seam and clear ownership.
