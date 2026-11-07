# Public distribution contract

## Contents

1. Scope and default
2. Publication gate
3. Artifact and license contract
4. Single metadata authority
5. Website download flow
6. Cache and drift handling
7. Benefits, costs, and alternatives
8. Verification and evidence
9. User inputs

## 1. Scope and default

Public download is allowed; it is not forbidden merely because the artifact appears on a website. Keep publication disabled only when the user has not authorized it or when repository, source, license, artifact, or evidence is incomplete.

Distinguish these artifact types:

- `dsh-bundle`: installable through the official DSH CLI under the separate Profile mutation protocol;
- `agent-skill`: copied into an Agent Skills directory, never presented as a DSH Profile plugin;
- `adapter`: installs only the declared adapter and does not silently install its external runtime;
- `source`: source-only delivery with no packaged runtime claim.

A download never proves installation, activation, runtime health, or real Profile state.

## 2. Publication gate

Before public distribution, require all of the following:

1. explicit authorization to publish;
2. an owned or authorized repository and immutable release tag/commit;
3. a declared license that permits the intended distribution;
4. a deterministic artifact plus SHA-256 sidecar;
5. a machine-readable release manifest;
6. synchronized README, INSTALL, manifest, checksum, archive contents, and release assets;
7. a secret/private-path scan and disposable extraction test;
8. public readback from the exact release assets.

Stop publication on `UNLICENSED`, missing license authority, mutable download identity, inconsistent metadata, a missing license in a redistributable archive, or an artifact that contains private/user/runtime state.

## 3. Artifact and license contract

For MIT-licensed distribution:

- show an `MIT License` label near the download;
- keep a source-repository link visible;
- include `LICENSE` inside an independently downloadable ZIP;
- preserve the copyright and permission notice in copies or substantial portions;
- do not imply warranty, official DSH endorsement, or a completed security audit.

The MIT benefit is broad use, modification, and redistribution with low integration friction. Its cost is that downstream proprietary reuse is allowed and improvements need not be contributed back. Use copyleft or another license only when the owner explicitly chooses its obligations; never select a license silently during publication.

The archive must contain only the distributable product. Exclude Obsidian notes, real Profiles, DSH runtime/source trees, credentials, repositories/worktrees, caches, and user data.

## 4. Single metadata authority

Use a release manifest as the runtime authority for public download metadata. At minimum record:

```json
{
  "distributionVersion": "2026.08.18.2",
  "artifact": {
    "file": "artifact.zip",
    "bytes": 12345,
    "regularFileCount": 21,
    "sha256": "64-lowercase-hex",
    "sha256File": "artifact.sha256",
    "downloadUrl": "https://github.com/owner/repo/releases/download/tag/artifact.zip",
    "sha256Url": "https://github.com/owner/repo/releases/download/tag/artifact.sha256"
  },
  "release": {
    "tag": "immutable-tag",
    "pageUrl": "https://github.com/owner/repo/releases/tag/immutable-tag",
    "manifestUrl": "https://raw.githubusercontent.com/owner/repo/immutable-tag/dist/manifest.json"
  },
  "license": {
    "spdxId": "MIT",
    "file": "product/LICENSE",
    "url": "https://github.com/owner/repo/blob/immutable-tag/product/LICENSE"
  }
}
```

README and INSTALL explain the release but are not runtime metadata sources. A catalog may index the artifact, but it must point to the fixed release identity rather than duplicate facts that can drift.

## 5. Website download flow

Use this fail-closed flow for a Build/download page:

1. read the latest stable GitHub Release through the public API;
2. validate the returned tag against a narrow tag pattern;
3. read `manifest.json` from that exact tag, never from floating `main`;
4. require `manifest.release.tag` to equal the resolved release tag;
5. require the ZIP and SHA sidecar to exist in the release assets;
6. require asset names and `browser_download_url` values to equal the manifest URLs;
7. validate version, byte count, positive file count, 64-character SHA-256, license ID, and source/license URLs;
8. only then enable direct ZIP and SHA downloads;
9. keep the source link available when metadata loading fails, but disable the download action.

Display version and SHA-256 from the validated manifest dynamically. Do not scrape README, INSTALL, HTML, release prose, or filenames to derive them.

For an Agent Skill, state visibly that the artifact belongs in the Agent's Skills directory and does not install or mutate a DSH Profile. For a DSH Bundle, direct download may provide an artifact, but real installation remains an R3 official-CLI transaction with a fresh plan and confirmation.

## 6. Cache and drift handling

GitHub repository pages, raw content, CDN caches, release APIs, and release assets can refresh at different times. Treat a stale README as a presentation/cache problem, not as authority to replace a correct manifest.

Prevent drift with a deterministic verifier that checks:

- ZIP SHA-256 and byte size against the manifest;
- checksum sidecar against the ZIP name and hash;
- archive file count and embedded license;
- repository and archive license equality;
- README and INSTALL contain the current version, tag, checksum, and license;
- release URLs are bound to the declared immutable tag.

Run the verifier locally and in CI. After merge/release, download the public ZIP without authentication, recompute SHA-256, read the tagged manifest, and verify the public license/source links.

## 7. Benefits, costs, and alternatives

### Fixed GitHub Release + tagged manifest

- **Objective**: make public downloads reproducible while still showing the latest version automatically.
- **Why**: `main` moves and prose/CDN caches drift independently.
- **Benefits**: immutable identity, direct download, dynamic metadata, rollback, and public verification.
- **Costs**: each release must synchronize and upload several assets; the page depends on GitHub availability and unauthenticated API limits.
- **Use when**: distributing Skills, adapters, bundles, or standalone release artifacts from GitHub.
- **Alternative**: serve a first-party signed registry and artifact host when scale, availability, signatures, or policy require it.

### README as metadata source

- **Advantage**: simple to author and human-readable.
- **Disadvantage**: parsing is brittle and caches can show an older revision.
- **Decision**: use only for explanation, never as download authority.

### Floating raw `main` download

- **Advantage**: always points to recent repository state.
- **Disadvantage**: cannot reproduce or safely bind the shown SHA to the downloaded bytes.
- **Decision**: allow for development previews labeled mutable; reject for public release claims.

## 8. Verification and evidence

Track distribution surfaces separately:

| Surface | Minimum proof |
| --- | --- |
| Skill/package contents | structure validation, syntax/tests, clean secret/private-path scan |
| Archive | SHA-256, bytes, file count, embedded license, disposable extraction |
| Repository | merged immutable commit/tag and passing checks |
| Release | public API lists exact assets and tag |
| Website source | contract tests for fixed-tag manifest and fail-closed UI |
| Public website | visible MIT/source/version/SHA, working ZIP/SHA links, recomputed public hash |
| Profile/runtime | separate E4/E5 acceptance; never inferred from download |

Website source/tests are E1/E2. A deployed public page and unauthenticated asset readback are E5 for the public distribution surface only.

## 9. User inputs

Before public distribution, obtain or derive and show:

- artifact type: DSH Bundle, Agent Skill, adapter, or source;
- repository owner/name and publication authority;
- chosen license and copyright holder;
- release target and whether direct public download is wanted;
- required source link and license notice behavior;
- version/tag policy;
- acceptance signal: public page, download, SHA, license, and source readback.

If the user supplies only “publish this,” default to repository preparation and stop before making it public until repository/visibility/license authority is known. If the user explicitly authorizes a public repository and chooses MIT, proceed with the fixed-release contract without retaining a blanket “website distribution forbidden” rule.
