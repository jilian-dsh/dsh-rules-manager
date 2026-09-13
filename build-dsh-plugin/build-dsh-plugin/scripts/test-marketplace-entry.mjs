#!/usr/bin/env node

import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const auditor = join(scriptDir, 'audit-marketplace-entry.mjs')
let dshMetadataPath = null

function run(root, entry = null, registry = null) {
  const args = [auditor, root, '--json']
  if (entry) args.push('--entry', entry)
  if (registry) args.push('--registry', registry)
  if (dshMetadataPath) args.push('--dsh-metadata', dshMetadataPath)
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', env: { PATH: process.env.PATH } })
  assert.equal(result.stderr, '')
  return { code: result.status, body: JSON.parse(result.stdout) }
}

function manifest(overrides = {}) {
  return {
    name: 'dsh-example-plugin',
    version: '1.2.3',
    license: 'MIT',
    repository: 'https://github.com/example/dsh-example-plugin',
    type: 'module',
    main: './index.mjs',
    files: ['index.mjs', 'cordis.patch.yml', 'LICENSE'],
    dsh: { bundle: { patch: './cordis.patch.yml' } },
    scripts: {},
    ...overrides,
  }
}

function entry(overrides = {}) {
  const unknownEvidence = { status: 'unknown', method: null, checkedAt: null, evidenceUrl: null, dshRelease: null, systems: [], profiles: [], summary: null }
  const unknownOperations = { install: 'unknown', start: 'unknown', uninstall: 'unknown', rollback: 'unknown' }
  return {
    id: 'dsh-example-plugin',
    name: 'DSH Example Plugin',
    packageName: 'dsh-example-plugin',
    description: 'A disposable marketplace audit fixture.',
    repositoryUrl: 'https://github.com/example/dsh-example-plugin',
    defaultBranch: 'main',
    manifestPath: 'package.json',
    updatePolicy: 'source-verified',
    commit: 'a'.repeat(40),
    version: '1.2.3',
    categories: ['tools'],
    featured: false,
    source: { updatedAt: '2026-08-20T00:00:00Z', observedAt: '2026-08-20T01:00:00Z', provenance: 'github-commit' },
    assurance: {
      discovery: { ...unknownEvidence }, installability: { ...unknownEvidence }, runtime: { ...unknownEvidence }, securityReview: { ...unknownEvidence },
    },
    entryIds: ['dsh-example-plugin'],
    status: 'approved',
    compatibility: {
      dsh: '>=0.1.0-rc.7',
      dshReleases: { '0.1.2-alpha.3': 'compatible', '0.1.2-alpha.4': 'compatible', '0.1.2-alpha.5': 'compatible' },
      dshOperations: {
        '0.1.2-alpha.3': { ...unknownOperations }, '0.1.2-alpha.4': { ...unknownOperations }, '0.1.2-alpha.5': { ...unknownOperations },
      },
      node: '>=22', systems: ['macOS'], profiles: ['web'],
    },
    details: {
      pluginType: 'feature', installSource: 'github', license: 'MIT',
      permissions: { level: 'low', files: 'none', network: 'none', commands: 'none', credentials: ['none'] },
      externalDependencies: [], reviewStatus: 'automated-scan',
    },
    risk: { installScripts: [], review: 'curated-not-security-audited' },
    ...overrides,
  }
}

async function writePlugin(root, packagePath = 'package.json', packageJson = manifest(), patch = '- insert:\n    - id: dsh-example-plugin\n      name: dsh-example-plugin\n') {
  const packageFile = join(root, packagePath)
  await mkdir(dirname(packageFile), { recursive: true })
  await writeFile(packageFile, `${JSON.stringify(packageJson, null, 2)}\n`)
  await writeFile(join(dirname(packageFile), 'cordis.patch.yml'), patch)
  await writeFile(join(dirname(packageFile), 'index.mjs'), 'export default function apply() {}\n')
  await writeFile(join(dirname(packageFile), 'LICENSE'), 'MIT License\n')
}

const fixture = await mkdtemp(join(tmpdir(), 'dsh-marketplace-audit-'))
try {
  dshMetadataPath = join(fixture, 'dsh-metadata.json')
  await writeFile(dshMetadataPath, `${JSON.stringify({
    name: '@deepseek-ai/dsh',
    'dist-tags': { latest: '0.1.1-rc.2', next: '0.1.3-next.1', alpha: '0.1.2-alpha.5' },
    versions: {
      '0.1.0-rc.8': {}, '0.1.1-rc.1': {}, '0.1.1-rc.2': {},
      '0.1.2-alpha.2': {}, '0.1.2-alpha.3': {}, '0.1.2-alpha.4': {}, '0.1.2-alpha.5': {}, '0.1.3-next.1': {},
    },
  }, null, 2)}\n`)
  const registryPath = join(fixture, 'catalog.json')
  await writeFile(registryPath, `${JSON.stringify({
    schemaVersion: 1,
    registry: {
      categories: { tools: 'Tools' },
      trustPolicy: { candidateInstallDisabled: true, unknownIsNotVerified: true, promotionIndependentOfVerification: true },
    },
    entries: [],
  }, null, 2)}\n`)

  const directRoot = join(fixture, 'direct')
  await mkdir(directRoot)
  await writePlugin(directRoot)
  const directEntry = join(directRoot, 'entry.json')
  await writeFile(directEntry, `${JSON.stringify(entry(), null, 2)}\n`)
  const direct = run(directRoot, directEntry, registryPath)
  assert.equal(direct.code, 0)
  assert.equal(direct.body.status, 'READY_FOR_PINNED_SOURCE_VERIFICATION')
  assert.equal(direct.body.route, 'direct')
  assert.deepEqual(direct.body.entryIds, ['dsh-example-plugin'])
  assert.deepEqual(direct.body.dshReleaseWindow.releases, ['0.1.2-alpha.3', '0.1.2-alpha.4', '0.1.2-alpha.5'])

  const monorepoRoot = join(fixture, 'monorepo')
  await mkdir(monorepoRoot)
  await writePlugin(monorepoRoot, 'plugins/example/package.json')
  const monorepoEntry = join(monorepoRoot, 'entry.json')
  await writeFile(monorepoEntry, `${JSON.stringify(entry({ manifestPath: 'plugins/example/package.json', installPath: 'plugins/example' }), null, 2)}\n`)
  const monorepo = run(monorepoRoot, monorepoEntry, registryPath)
  assert.equal(monorepo.code, 0)
  assert.equal(monorepo.body.status, 'READY_FOR_PINNED_SOURCE_VERIFICATION')
  assert.equal(monorepo.body.route, 'monorepo')

  const externalRoot = join(fixture, 'external')
  await mkdir(externalRoot)
  await writeFile(join(externalRoot, 'package.json'), `${JSON.stringify({ name: 'obsidian-only', version: '1.0.0' })}\n`)
  const external = run(externalRoot)
  assert.equal(external.code, 1)
  assert.equal(external.body.status, 'NEEDS_STANDARDIZATION')
  assert.equal(external.body.route, 'adapter-required')
  assert.ok(external.body.errors.some(item => item.code === 'MKT002'))

  const dangerousRoot = join(fixture, 'dangerous')
  await mkdir(dangerousRoot)
  await writePlugin(dangerousRoot, 'package.json', manifest(), '- insert:\n    - id: dsh-example-plugin\n      name: dsh-example-plugin\n    - id: official-shadow\n      name: "@deepseek-ai/dsh-web-app"\n      disabled: true\n')
  const dangerousEntry = join(dangerousRoot, 'entry.json')
  await writeFile(dangerousEntry, `${JSON.stringify(entry({ entryIds: ['dsh-example-plugin', 'official-shadow'] }), null, 2)}\n`)
  const dangerous = run(dangerousRoot, dangerousEntry, registryPath)
  assert.equal(dangerous.code, 2)
  assert.equal(dangerous.body.status, 'BLOCKED')
  assert.equal(dangerous.body.route, 'blocked')
  assert.ok(dangerous.body.blockers.some(item => item.code === 'MKT007'))

  const mismatchRoot = join(fixture, 'mismatch')
  await mkdir(mismatchRoot)
  await writePlugin(mismatchRoot, 'package.json', manifest({ scripts: { prepare: 'node build.mjs' } }))
  const mismatchEntry = join(mismatchRoot, 'entry.json')
  await writeFile(mismatchEntry, `${JSON.stringify(entry({
    version: '9.9.9',
    entryIds: ['wrong'],
    details: {
      ...entry().details,
      permissions: { level: 'low', files: 'none', network: 'any', commands: 'none', credentials: ['none'] },
    },
    risk: { installScripts: [], review: 'curated-not-security-audited' },
  }), null, 2)}\n`)
  const mismatch = run(mismatchRoot, mismatchEntry, registryPath)
  assert.equal(mismatch.code, 1)
  assert.equal(mismatch.body.status, 'NEEDS_STANDARDIZATION')
  for (const code of ['MKT004', 'MKT005', 'MKT006', 'MKT008']) assert.ok(mismatch.body.errors.some(item => item.code === code), code)

  const evidenceRoot = join(fixture, 'evidence')
  await mkdir(evidenceRoot)
  await writePlugin(evidenceRoot)
  const evidenceEntry = join(evidenceRoot, 'entry.json')
  await writeFile(evidenceEntry, `${JSON.stringify(entry({
    featured: true,
    assurance: { ...entry().assurance, runtime: { ...entry().assurance.runtime, status: 'verified' } },
    compatibility: { ...entry().compatibility, dshOperations: { ...entry().compatibility.dshOperations, '0.1.2-alpha.3': { install: 'passed' } } },
  }), null, 2)}\n`)
  const evidence = run(evidenceRoot, evidenceEntry, registryPath)
  assert.equal(evidence.code, 1)
  assert.ok(evidence.body.errors.some(item => item.code === 'MKT014'))
  assert.ok(evidence.body.errors.some(item => item.code === 'MKT015'))
  assert.ok(evidence.body.warnings.some(item => item.code === 'MKT014'))
} finally {
  await rm(fixture, { recursive: true, force: true })
}

process.stdout.write('MARKETPLACE_TEST_OK\n')
