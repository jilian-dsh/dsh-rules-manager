# DSH plugin scorecard

## Contents

1. Risk classes
2. Hard-gate rule
3. Readiness score
4. Evidence levels
5. Evidence JSON
6. Decision thresholds
7. Score interpretation and limitations

## 1. Risk classes

| Class | Typical plugin | Minimum acceptance |
| --- | --- | --- |
| `R0` | Read-only inventory, metadata, UI projection | E3; E4 before claiming real UI |
| `R1` | Host tool/service, import/export, plugin-owned state | E3 plus negative state tests |
| `R2` | External process, network, OAuth/credentials, device transport | E3 plus redaction, failure, and real integration tests |
| `R3` | Profile lifecycle, restart, remote control, broad management | Full transaction/fault matrix; explicit E4; E5 for production/device claims |

Choose the highest applicable class.

## 2. Hard-gate rule

Run the blockers in [boundaries.md](boundaries.md) first. Any blocker sets status to `BLOCKED` regardless of points. A high score is not permission to mutate a Profile.

- **Objective**: prevent additive scoring from compensating for a catastrophic boundary violation.
- **Why**: excellent documentation cannot make core modification, secret leakage, or an unrecoverable Profile write acceptable.
- **Benefit**: clear non-negotiable safety floor.
- **Cost**: one blocker can stop an otherwise mature release; false positives require manual review.
- **Evidence**: name the exact blocker, source location, impact, and smallest safe remediation. Never silently subtract points instead.

For a DSH STORE target, marketplace hard blockers include non-GitHub/floating source, missing standard Bundle/adapter contract, unsafe package paths, manifest/version/license/Patch/entry/lifecycle mismatch, official shadowing, duplicate catalog identity, invalid category, or unauthorized third-party copying. A local candidate never overrides these blockers.

For model Tools, card hard blockers include stateful or I/O presenters, unsupported discriminants, unbounded or secret-bearing `rawInput`/metadata, missing generic fallback, canonical/card success or truncation disagreement, and replacement of an official Tool card key.

## 3. Readiness score

The static audit covers 80 points; traceable runtime evidence covers 20.

| Category | Points | Objective and why | Benefit | Cost/limitation | Full-credit condition |
| --- | ---: | --- | --- | --- | --- |
| Host contract | 16 | Prove DSH can resolve the package through supported seams | Prevents wrong-host work and cold-start surprises | Rewards structure, not feature quality | Standard bundle/patch, resolvable entries, correct optional Web/Client boundaries, and provider-neutral Tool cards where applicable |
| Non-destructive safety | 16 | Preserve core, official inventory, secrets, and command integrity | Small blast radius and upgrade safety | Restricts shortcuts and broad integrations | No core/official/Loader mutation, shell string, secret projection, or Client Host imports |
| Mutation discipline | 16 | Make real-state writes intentional and recoverable | Concurrency safety and rollback | More code and confirmation friction | Read-only, or complete typed plan/confirmation/hash/backup/atomic/health/rollback protocol |
| Packaging/source | 12 | Make installed or downloaded code reproducible and complete | Reliable Git/marketplace install, public download, and rollback | Coordinated metadata/build work | Synchronized name/version/files/build/license/provenance, release manifest/checksum when distributed, immutable source, and matching catalog candidate when STORE-targeted |
| Tests | 12 | Prove logic and failures without real-state risk | Fast regressions and safe fault injection | Fixtures can drift from real Profiles | Test script, fixtures, disposable home, safety/fault contracts, plus card determinism/replay/fallback/bounds when applicable |
| Documentation/status | 8 | Preserve boundaries and prevent evidence overclaim | Better operations and future reuse | Documentation can become stale | Boundaries, permissions, evidence distinctions, and next gates are explicit |
| Runtime evidence | 20 | Reward current observation beyond source/tests | Detects integration and environment failures | Expensive and can expire quickly | Current command/readback evidence as listed below |

Static point breakdown used by `audit-plugin.mjs`:

| Category | Check | Points | Why it matters |
| --- | --- | ---: | --- |
| Host | Manifest parses | 3 | No other package claim is reliable if the manifest is invalid |
| Host | Standard Bundle patch | 5 | This is the primary DSH install/composition contract |
| Host | Runtime entries resolve | 3 | Prevents source-only or pack-excluded startup failures |
| Host | Optional Web injection | 2 | Preserves headless/no-Web startup |
| Host | Client separation/registration | 3 | Prevents browser privilege leakage and missing UI |
| Safety | No Loader/Fiber mutation | 4 | Protects internal lifecycle invariants |
| Safety | No core/official writes | 4 | Preserves official ownership and upgrades |
| Safety | No inventory shadow | 3 | Keeps official components visible and intact |
| Safety | No shell strings | 2 | Avoids expansion/injection and quoting ambiguity |
| Safety | No secret logs/Client Host imports | 3 | Prevents sensitive data and privilege projection |
| Mutation | Typed single-use plan | 3 | Binds one authorized operation |
| Mutation | Exact confirmation | 3 | Proves user intent for that operation |
| Mutation | Hash/concurrency guard | 2 | Rejects stale plans and lost updates |
| Mutation | Backup | 2 | Creates a recovery source |
| Mutation | Atomic commit/lock | 2 | Prevents partial state |
| Mutation | Health check | 2 | Detects semantic failure after a successful write |
| Mutation | Rollback | 2 | Restores prior state when health fails |
| Packaging | Name/version | 3 | Identifies the release |
| Packaging | Files/entries | 2 | Ensures runtime content ships |
| Packaging | Satisfiable build contract | 2 | Prevents missing Git build output |
| Packaging | Repository/license | 2 | Provides provenance and usage terms |
| Packaging | Immutable source | 3 | Makes install and rollback reproducible |
| Tests | Test/check script | 3 | Provides deterministic entry point |
| Tests | Test files | 3 | Ensures the declaration has executable coverage |
| Tests | No real-home writes | 3 | Protects active user state |
| Tests | Boundary/fault cases | 3 | Covers more than the happy path |
| Docs | README | 2 | Gives the operator a usable entry point |
| Docs | Boundaries/permissions | 2 | Makes non-goals and risk visible |
| Docs | Status distinctions | 2 | Prevents “verified” from hiding missing surfaces |
| Docs | Next gate | 2 | Turns partial state into an actionable plan |

Runtime evidence allocation:

| Evidence | Points |
| --- | ---: |
| `dumpConfig` | 4 |
| `isolatedRuntime` | 6 |
| `realProfile` | 6 |
| `externalReadback` | 4 |

Only award runtime points when the evidence was observed in the current task and recorded with a concrete command/readback, timestamp, or artifact.

## 4. Evidence levels

| Level | Meaning | Examples |
| --- | --- | --- |
| `E0` | Idea/plan | Requirements and architecture only |
| `E1` | Static | Source, manifest, patch, package review |
| `E2` | Automated | Unit, contract, fault-injection tests |
| `E3` | Disposable runtime | Official CLI install, dump-config, isolated startup/API smoke, and live/persisted replay card parity when a Tool presenter exists |
| `E4` | Real target | Exact Profile version, process/port, official inventory/API and visible UI |
| `E5` | External acceptance | Public readback, real device/account traffic, or proven rollback/recovery |

Record each claimed capability at its own level. Do not assign one project-wide level to untested surfaces.

## 5. Evidence JSON

Pass this optional file to `scripts/audit-plugin.mjs --evidence <file>`:

```json
{
  "dumpConfig": {
    "verified": true,
    "evidence": "2026-08-17: dsh --profile disposable --dump-config exited 0"
  },
  "isolatedRuntime": {
    "verified": true,
    "evidence": "2026-08-17: disposable DSH_HOME startup and API smoke passed"
  },
  "realProfile": {
    "verified": false,
    "evidence": "Not authorized"
  },
  "externalReadback": {
    "verified": false,
    "evidence": "No real device/public rollback test"
  }
}
```

The script validates only the presence of traceable evidence text; it does not independently prove the claim. The agent must verify the underlying artifact before setting `verified: true`.

## 6. Decision thresholds

| Score | Status | Allowed next step |
| ---: | --- | --- |
| 90–100 | Controlled real-profile acceptance ready | Present a fresh mutation/acceptance plan; still wait for exact confirmation |
| 75–89 | Isolated acceptance ready | Run disposable install/start/fault matrix; no production claim |
| 60–74 | Implementation incomplete | Close static/test/package gaps; no real Profile mutation |
| <60 | Re-scope | Revisit host contract and architecture |

For `R3`, require at least 90, no blockers, complete transaction fault tests, and explicit user confirmation before a real Profile operation. For public/device claims require the relevant E5 evidence even when the numeric score is high.

For DSH STORE, the `/100` plugin score is necessary engineering evidence but not listing approval. Also require marketplace audit with no blocker, pinned-source verification, current Registry CI, merged catalog readback, and public marketplace readback for the claimed state.

## 7. Score interpretation and limitations

- **Purpose of the score**: rank the next safe engineering step and make omissions visible.
- **Why use numbers**: a fixed allocation prevents attractive UI/features from hiding missing safety, packaging, or evidence work.
- **Advantages**: repeatable comparison, CI-friendly output, clear remediation priority, and trend tracking across releases.
- **Disadvantages**: static scanning can produce false positives/negatives; teams may optimize points instead of outcomes; evidence text can be fabricated if not independently checked.
- **Correct use**: combine score, hard blockers, risk class, per-capability evidence, and human review.
- **Incorrect use**: treating 90 as authorization, treating 100 as bug-free, or comparing unrelated plugin value by score.
- **Reconsideration trigger**: change weights only when repeated real incidents show the model underweights or overweights a risk; record the incident and migrate baselines.
