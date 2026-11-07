#!/usr/bin/env node

import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const auditor = join(scriptDir, 'audit-candidate-entry.mjs')

function candidate(overrides = {}) {
  return {
    id: 'dsh-example-candidate', name: 'DSH Example Candidate', description: 'Discovery-only fixture candidate.',
    repositoryUrl: 'https://github.com/example/dsh-example-candidate', defaultBranch: 'main', latestCommit: null,
    sourceUpdatedAt: null, discoveredAt: '2026-08-20T00:00:00Z', discoverySources: ['github-topic'],
    topics: ['dsh-plugin'], status: 'discovered', route: 'direct-review', statusReason: null,
    ...overrides,
  }
}

function run(entry, candidates, catalog) {
  const result = spawnSync(process.execPath, [auditor, '--entry', entry, '--candidates', candidates, '--catalog', catalog, '--json'], {
    encoding: 'utf8', env: { PATH: process.env.PATH },
  })
  assert.equal(result.stderr, '')
  return { code: result.status, body: JSON.parse(result.stdout) }
}

const root = await mkdtemp(join(tmpdir(), 'dsh-candidate-audit-'))
try {
  const candidatesPath = join(root, 'candidates.json')
  const catalogPath = join(root, 'catalog.json')
  const entryPath = join(root, 'entry.json')
  await writeFile(candidatesPath, `${JSON.stringify({
    schemaVersion: 1,
    registry: { trustBoundary: { installActionsDisabled: true, catalogPromotionRequired: true, unknownIsNotVerified: true } },
    entries: [],
  }, null, 2)}\n`)
  await writeFile(catalogPath, `${JSON.stringify({
    schemaVersion: 1,
    registry: { trustPolicy: { candidateInstallDisabled: true, unknownIsNotVerified: true, promotionIndependentOfVerification: true } },
    entries: [],
  }, null, 2)}\n`)
  await writeFile(entryPath, `${JSON.stringify(candidate(), null, 2)}\n`)
  const valid = run(entryPath, candidatesPath, catalogPath)
  assert.equal(valid.code, 0)
  assert.equal(valid.body.status, 'READY_FOR_DISCOVERY_REGISTRY')
  assert.equal(valid.body.candidate.installable, false)
  assert.deepEqual(valid.body.candidate.allowedActions, [])

  await writeFile(entryPath, `${JSON.stringify(candidate({ packageName: 'dsh-example-candidate', entryIds: ['demo'] }), null, 2)}\n`)
  const trustedFields = run(entryPath, candidatesPath, catalogPath)
  assert.equal(trustedFields.code, 1)
  assert.ok(trustedFields.body.errors.some(item => item.code === 'CANDIDATE_TRUST_BOUNDARY'))

  await writeFile(entryPath, `${JSON.stringify(candidate(), null, 2)}\n`)
  await writeFile(catalogPath, `${JSON.stringify({
    schemaVersion: 1,
    registry: { trustPolicy: { candidateInstallDisabled: true, unknownIsNotVerified: true, promotionIndependentOfVerification: true } },
    entries: [{ id: 'trusted', repositoryUrl: 'https://github.com/example/dsh-example-candidate' }],
  }, null, 2)}\n`)
  const duplicate = run(entryPath, candidatesPath, catalogPath)
  assert.equal(duplicate.code, 1)
  assert.ok(duplicate.body.errors.some(item => item.code === 'CANDIDATE_DUPLICATE_TRUSTED'))

  await writeFile(catalogPath, `${JSON.stringify({ schemaVersion: 1, registry: { trustPolicy: {} }, entries: [] }, null, 2)}\n`)
  const weakened = run(entryPath, candidatesPath, catalogPath)
  assert.equal(weakened.code, 1)
  assert.ok(weakened.body.errors.some(item => item.code === 'CANDIDATE_TRUST_BOUNDARY'))
} finally {
  await rm(root, { recursive: true, force: true })
}

process.stdout.write('CANDIDATE_TEST_OK\n')
