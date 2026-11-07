#!/usr/bin/env node

import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fetchOfficialDshReleaseWindow, officialDshReleaseWindow } from './official-dsh-releases.mjs'

const EXCLUDED = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.next', '.turbo'])
const SIMPLE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/
const PACKAGE_NAME = /^(?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+$/
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
const COMMIT = /^[0-9a-f]{40}$/
const DSH_LEGACY_RELEASES = { 'rc.7': '0.1.0-rc.7', 'rc.8': '0.1.0-rc.8' }
const DSH_OPERATIONS = ['install', 'start', 'uninstall', 'rollback']
const ASSURANCE_LEVELS = ['discovery', 'installability', 'runtime', 'securityReview']
const ENUMS = {
  status: ['approved', 'blocked', 'unlisted'],
  updatePolicy: ['source-verified', 'user-reviewed', 'external-only'],
  pluginType: ['feature', 'theme', 'suite', 'client', 'provider', 'unknown'],
  installSource: ['npm', 'github', 'local-bundle', 'unknown'],
  permissionLevel: ['low', 'medium', 'high', 'unknown'],
  files: ['none', 'read-only', 'write', 'unknown'],
  network: ['none', 'specified-services', 'any', 'unknown'],
  commands: ['none', 'restricted', 'shell', 'unknown'],
  credentials: ['none', 'api-key', 'oauth', 'keychain', 'unknown'],
  reviewStatus: ['unreviewed', 'automated-scan', 'manual-review', 'author-verified'],
  lifecycle: ['preinstall', 'install', 'postinstall', 'prepare'],
}

function parseArgs(argv) {
  const out = { root: null, entry: null, registry: null, dshMetadata: null, json: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--json') out.json = true
    else if (arg === '--entry') out.entry = argv[++index]
    else if (arg === '--registry') out.registry = argv[++index]
    else if (arg === '--dsh-metadata') out.dshMetadata = argv[++index]
    else if (arg.startsWith('--')) throw new Error(`unknown argument: ${arg}`)
    else if (out.root === null) out.root = arg
    else throw new Error(`unexpected argument: ${arg}`)
  }
  if (!out.root) throw new Error('usage: audit-marketplace-entry.mjs <plugin-root> [--entry entry.json] [--registry catalog.json] [--dsh-metadata npm-metadata.json] [--json]')
  if (out.entry === undefined) throw new Error('--entry requires a path')
  if (out.registry === undefined) throw new Error('--registry requires a path')
  return out
}

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function loadJson(path, label) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function strings(value) {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean) : []
}

function isoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value))
}

function httpsUrl(value) {
  try { return typeof value === 'string' && new URL(value).protocol === 'https:' }
  catch { return false }
}

function safeRelative(value) {
  return typeof value === 'string' && value.trim() !== '' && !value.startsWith('/') && !value.includes('..') && !value.includes('\\')
}

function dshReleaseVersion(value) {
  if (Object.hasOwn(DSH_LEGACY_RELEASES, value)) return DSH_LEGACY_RELEASES[value]
  return VERSION.test(value ?? '') ? value : null
}

function staysInside(base, target) {
  const path = relative(base, target)
  return path === '' || (!path.startsWith('..') && !isAbsolute(path))
}

function canonicalGithub(value) {
  if (isObject(value)) value = value.url
  if (typeof value !== 'string') return null
  const normalized = value.trim().replace(/^git\+/, '').replace(/\.git\/?$/i, '').replace(/\/$/, '')
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/#]+)$/i.exec(normalized)
  return match ? `https://github.com/${match[1]}/${match[2]}` : null
}

function sameSet(left, right) {
  const a = [...new Set(left)].sort()
  const b = [...new Set(right)].sort()
  return JSON.stringify(a) === JSON.stringify(b)
}

async function findManifestCandidates(root) {
  const candidates = []
  async function walk(directory, depth) {
    if (depth > 5 || candidates.length >= 100) return
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory() && EXCLUDED.has(entry.name)) continue
      const target = join(directory, entry.name)
      if (entry.isDirectory()) await walk(target, depth + 1)
      else if (entry.isFile() && entry.name === 'package.json') {
        try {
          const manifest = JSON.parse(await readFile(target, 'utf8'))
          candidates.push({ path: target, manifest })
        } catch {
          candidates.push({ path: target, manifest: null })
        }
      }
    }
  }
  await walk(root, 0)
  return candidates
}

function add(report, level, code, message, detail = null) {
  report[level].push({ code, message, detail })
}

function requireEnum(report, value, allowed, path) {
  if (!allowed.includes(value)) add(report, 'errors', 'MKT_SCHEMA', `${path} must be one of ${allowed.join(', ')}`, value)
}

function validateEntryShape(entry, report, releaseWindow) {
  if (!isObject(entry)) {
    add(report, 'errors', 'MKT_SCHEMA', 'catalog entry must be an object')
    return
  }
  for (const field of ['id', 'name', 'packageName', 'description', 'repositoryUrl', 'commit', 'version', 'source', 'assurance', 'entryIds', 'status', 'compatibility', 'details', 'risk']) {
    if (!Object.hasOwn(entry, field)) add(report, 'errors', 'MKT_SCHEMA', `catalog entry is missing ${field}`)
  }
  if (!SIMPLE_ID.test(entry.id ?? '')) add(report, 'errors', 'MKT_SCHEMA', 'catalog id is invalid', entry.id)
  if (!PACKAGE_NAME.test(entry.packageName ?? '') || String(entry.packageName ?? '').includes('..')) add(report, 'errors', 'MKT_SCHEMA', 'packageName is invalid', entry.packageName)
  if (!COMMIT.test(entry.commit ?? '')) add(report, 'errors', 'MKT001', 'catalog source must use a full lowercase 40-character Git Commit', entry.commit)
  if (!VERSION.test(entry.version ?? '')) add(report, 'errors', 'MKT_SCHEMA', 'catalog version must be semantic version text', entry.version)
  if (!canonicalGithub(entry.repositoryUrl)) add(report, 'errors', 'MKT001', 'repositoryUrl must be a public canonical GitHub repository URL', entry.repositoryUrl)
  requireEnum(report, entry.status, ENUMS.status, 'status')
  if (entry.updatePolicy !== undefined) requireEnum(report, entry.updatePolicy, ENUMS.updatePolicy, 'updatePolicy')
  if (!isObject(entry.source)) add(report, 'errors', 'MKT013', 'source metadata is required for the pinned Commit')
  else {
    if (!isoDate(entry.source.updatedAt)) add(report, 'errors', 'MKT013', 'source.updatedAt must be the pinned Commit ISO date-time', entry.source.updatedAt)
    if (!isoDate(entry.source.observedAt)) add(report, 'errors', 'MKT013', 'source.observedAt must be an ISO observation date-time', entry.source.observedAt)
    if (!['github-commit', 'github-repository', 'unknown'].includes(entry.source.provenance)) add(report, 'errors', 'MKT013', 'source.provenance is invalid', entry.source.provenance)
  }
  if (!isObject(entry.assurance)) add(report, 'errors', 'MKT014', 'assurance must explicitly separate discovery, installability, runtime, and security review')
  else for (const level of ASSURANCE_LEVELS) {
    const evidence = entry.assurance[level]
    if (!isObject(evidence)) {
      add(report, 'errors', 'MKT014', `assurance.${level} must be an evidence record`)
      continue
    }
    if (!['verified', 'failed', 'unknown', 'not-applicable'].includes(evidence.status)) add(report, 'errors', 'MKT014', `assurance.${level}.status is invalid`, evidence.status)
    if (evidence.status === 'verified' && (typeof evidence.method !== 'string' || evidence.method.trim() === '' || !isoDate(evidence.checkedAt) || !httpsUrl(evidence.evidenceUrl))) {
      add(report, 'errors', 'MKT014', `assurance.${level} verified evidence requires method, checkedAt, and HTTPS evidenceUrl`)
    }
    if (evidence.dshRelease !== null && evidence.dshRelease !== undefined && dshReleaseVersion(evidence.dshRelease) === null) add(report, 'errors', 'MKT014', `assurance.${level}.dshRelease is invalid`)
    if (!Array.isArray(evidence.systems) || !Array.isArray(evidence.profiles)) add(report, 'errors', 'MKT014', `assurance.${level} systems/profiles must be arrays`)
  }
  const declaredEntryIds = strings(entry.entryIds)
  if (!Array.isArray(entry.entryIds) || declaredEntryIds.some(value => !SIMPLE_ID.test(value))) add(report, 'errors', 'MKT005', 'entryIds must be an array of valid DSH identifiers')
  if (entry.status === 'approved' && declaredEntryIds.length === 0) add(report, 'errors', 'MKT005', 'approved entries must declare at least one DSH entry ID')
  if (!Array.isArray(entry.categories) || strings(entry.categories).length === 0) add(report, 'errors', 'MKT010', 'catalog entry must declare at least one current category')
  if (['blocked', 'unlisted'].includes(entry.status) && (typeof entry.statusReason !== 'string' || entry.statusReason.trim() === '')) {
    add(report, 'errors', 'MKT_SCHEMA', `${entry.status} entries require statusReason`)
  }
  if (!safeRelative(entry.manifestPath ?? 'package.json')) add(report, 'errors', 'MKT003', 'manifestPath must stay inside the repository', entry.manifestPath)
  if (entry.installPath !== undefined && entry.installPath !== null && !safeRelative(entry.installPath)) {
    add(report, 'errors', 'MKT009', 'installPath must stay inside the repository when supplied', entry.installPath)
  }
  const compatibility = entry.compatibility
  if (!isObject(compatibility)) add(report, 'errors', 'MKT_SCHEMA', 'compatibility must be an object')
  else {
    for (const field of ['dsh', 'node', 'systems', 'profiles']) if (!Object.hasOwn(compatibility, field)) add(report, 'errors', 'MKT_SCHEMA', `compatibility.${field} is required`)
    if (!Array.isArray(compatibility.systems) || !Array.isArray(compatibility.profiles)) add(report, 'errors', 'MKT_SCHEMA', 'compatibility systems/profiles must be arrays')
    const requiredReleases = releaseWindow.releases
    if (!isObject(compatibility.dshReleases)) add(report, 'errors', 'MKT_SCHEMA', `compatibility.dshReleases must declare the official latest releases: ${requiredReleases.join(', ')}`)
    else for (const release of requiredReleases) {
      if (!['compatible', 'incompatible', 'unknown'].includes(compatibility.dshReleases[release])) {
        add(report, 'errors', 'MKT_SCHEMA', `compatibility.dshReleases.${release} must be compatible, incompatible, or unknown`)
      }
    }
    if (entry.status === 'approved' && isObject(compatibility.dshReleases)
      && !requiredReleases.some(release => compatibility.dshReleases[release] === 'compatible')) {
      add(report, 'errors', 'MKT008', `approved entries require an exact compatible result in the official latest-three DSH window: ${requiredReleases.join(', ')}`)
    }
    if (!isObject(compatibility.dshOperations)) add(report, 'errors', 'MKT015', `compatibility.dshOperations must declare install/start/uninstall/rollback for ${requiredReleases.join(', ')}`)
    else for (const release of requiredReleases) {
      if (!isObject(compatibility.dshOperations[release])) add(report, 'errors', 'MKT015', `compatibility.dshOperations.${release} must be an object`)
      else for (const operation of DSH_OPERATIONS) {
        if (!['passed', 'failed', 'unknown'].includes(compatibility.dshOperations[release][operation])) {
          add(report, 'errors', 'MKT015', `compatibility.dshOperations.${release}.${operation} must be passed, failed, or unknown`)
        }
      }
    }
  }
  const details = entry.details
  if (!isObject(details)) add(report, 'errors', 'MKT_SCHEMA', 'details must be an object')
  else {
    for (const field of ['pluginType', 'installSource', 'license', 'permissions', 'externalDependencies', 'reviewStatus']) if (!Object.hasOwn(details, field)) add(report, 'errors', 'MKT_SCHEMA', `details.${field} is required`)
    requireEnum(report, details.pluginType, ENUMS.pluginType, 'details.pluginType')
    requireEnum(report, details.installSource, ENUMS.installSource, 'details.installSource')
    if (details.installSource !== 'github') add(report, 'errors', 'MKT001', 'DSH STORE direct listing source must be github', details.installSource)
    requireEnum(report, details.reviewStatus, ENUMS.reviewStatus, 'details.reviewStatus')
    if (typeof details.license !== 'string' || details.license.trim() === '') add(report, 'errors', 'MKT004', 'details.license must be explicit')
    if (!Array.isArray(details.externalDependencies)) add(report, 'errors', 'MKT_SCHEMA', 'details.externalDependencies must be an array')
    const permissions = details.permissions
    if (!isObject(permissions)) add(report, 'errors', 'MKT_SCHEMA', 'details.permissions must be an object')
    else {
      for (const field of ['level', 'files', 'network', 'commands', 'credentials']) if (!Object.hasOwn(permissions, field)) add(report, 'errors', 'MKT_SCHEMA', `details.permissions.${field} is required`)
      requireEnum(report, permissions.level, ENUMS.permissionLevel, 'details.permissions.level')
      requireEnum(report, permissions.files, ENUMS.files, 'details.permissions.files')
      requireEnum(report, permissions.network, ENUMS.network, 'details.permissions.network')
      requireEnum(report, permissions.commands, ENUMS.commands, 'details.permissions.commands')
      const credentialValues = strings(permissions.credentials)
      if (credentialValues.length === 0 || credentialValues.some(value => !ENUMS.credentials.includes(value))) add(report, 'errors', 'MKT_SCHEMA', 'details.permissions.credentials must contain supported values')
      const onlyNone = permissions.files === 'none' && permissions.network === 'none' && permissions.commands === 'none'
        && credentialValues.length === 1 && credentialValues[0] === 'none'
      if (permissions.level === 'low' && !onlyNone) add(report, 'errors', 'MKT008', 'low permission level is valid only when file, network, command, and credential access are all none')
      const highSignal = permissions.network === 'any' || permissions.commands === 'shell'
        || credentialValues.some(value => !['none', 'unknown'].includes(value))
      if (highSignal && !['high', 'unknown'].includes(permissions.level)) add(report, 'errors', 'MKT008', 'broad network/shell/credential access cannot be labeled below high')
    }
  }
  const installScripts = strings(entry.risk?.installScripts)
  if (!isObject(entry.risk) || !Array.isArray(entry.risk.installScripts) || typeof entry.risk.review !== 'string' || entry.risk.review.trim() === '') add(report, 'errors', 'MKT_SCHEMA', 'risk.installScripts and risk.review are required')
  if (installScripts.some(value => !ENUMS.lifecycle.includes(value))) add(report, 'errors', 'MKT006', 'risk.installScripts contains unsupported lifecycle names', installScripts)
  const permissions = entry.details?.permissions
  const sourceVerified = permissions?.files === 'none'
    && permissions?.network === 'none'
    && permissions?.commands === 'none'
    && sameSet(strings(permissions?.credentials), ['none'])
    && installScripts.length === 0
  if (entry.updatePolicy === 'source-verified' && !sourceVerified) add(report, 'errors', 'MKT_UPDATE_POLICY', 'source-verified requires no file, network, command, credential, or install-lifecycle capability')
  if (entry.updatePolicy === 'external-only' && entry.status === 'approved') add(report, 'errors', 'MKT_UPDATE_POLICY', 'external-only entries cannot be presented as approved guarded installs')
  if (entry.featured === true && ASSURANCE_LEVELS.some(level => entry.assurance?.[level]?.status !== 'verified')) {
    add(report, 'warnings', 'MKT014', 'featured exposure does not upgrade or replace any verification level')
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const root = resolve(args.root)
  if (!(await exists(root))) throw new Error(`plugin root does not exist: ${root}`)
  const entry = args.entry ? await loadJson(resolve(args.entry), 'catalog entry') : null
  const registry = args.registry ? await loadJson(resolve(args.registry), 'registry catalog') : null
  const releaseWindow = args.dshMetadata
    ? officialDshReleaseWindow(await loadJson(resolve(args.dshMetadata), 'official DSH package metadata'))
    : await fetchOfficialDshReleaseWindow()
  const report = {
    schemaVersion: 1,
    root,
    status: 'PARTIAL',
    route: 'adapter-required',
    manifestPath: null,
    package: null,
    entryIds: [],
    lifecycleScripts: [],
    dshReleaseWindow: releaseWindow,
    blockers: [],
    errors: [],
    warnings: [],
    candidate: null,
    nextGate: '',
    note: 'This read-only preflight does not prove the pinned GitHub source, Registry CI, merged catalog, public marketplace, or DSH runtime.',
  }

  const candidates = await findManifestCandidates(root)
  let manifestRecord = null
  if (entry) {
    validateEntryShape(entry, report, releaseWindow)
    const manifestPath = safeRelative(entry.manifestPath ?? 'package.json') ? entry.manifestPath ?? 'package.json' : 'package.json'
    const target = resolve(root, manifestPath)
    if (!staysInside(root, target)) add(report, 'errors', 'MKT003', 'manifestPath escapes the plugin root')
    manifestRecord = candidates.find(candidate => candidate.path === target) ?? null
    if (!manifestRecord) add(report, 'errors', 'MKT002', `manifestPath does not exist: ${manifestPath}`)
    else if (!manifestRecord.manifest) add(report, 'errors', 'MKT002', `manifestPath is not valid JSON: ${manifestPath}`)
  } else {
    const compatible = candidates.filter(candidate => candidate.manifest?.dsh?.bundle?.patch)
    if (compatible.length === 1) manifestRecord = compatible[0]
    else if (compatible.length > 1) add(report, 'errors', 'MKT009', 'multiple DSH package manifests found; choose an unambiguous manifestPath', compatible.map(item => relative(root, item.path)))
    else {
      manifestRecord = candidates.length === 1 ? candidates[0] : null
      add(report, 'errors', 'MKT002', 'no standard package manifest with dsh.bundle.patch was found')
    }
  }

  if (manifestRecord?.manifest) {
    const manifest = manifestRecord.manifest
    const manifestPath = relative(root, manifestRecord.path)
    const packageRoot = dirname(manifestRecord.path)
    report.manifestPath = manifestPath
    report.route = manifestPath === 'package.json' ? 'direct' : 'monorepo'
    report.package = { name: manifest.name ?? null, version: manifest.version ?? null, license: manifest.license ?? null }
    if (!PACKAGE_NAME.test(manifest.name ?? '') || String(manifest.name ?? '').includes('..')) add(report, 'errors', 'MKT004', 'manifest package name is missing or invalid', manifest.name)
    if (!VERSION.test(manifest.version ?? '')) add(report, 'errors', 'MKT004', 'manifest version is missing or invalid', manifest.version)
    const patchRelative = manifest?.dsh?.bundle?.patch
    if (!safeRelative(patchRelative)) add(report, 'errors', 'MKT002', 'manifest does not declare a safe relative dsh.bundle.patch', patchRelative)
    else {
      const patchPath = resolve(packageRoot, patchRelative)
      if (!staysInside(packageRoot, patchPath)) add(report, 'blockers', 'MKT003', 'Bundle Patch escapes the package root', patchRelative)
      else if (!(await exists(patchPath))) add(report, 'errors', 'MKT003', 'declared Bundle Patch does not exist', relative(root, patchPath))
      else {
        const patch = await readFile(patchPath, 'utf8')
        report.entryIds = [...patch.matchAll(/^\s*-\s*id:\s*['"]?([^'"\s#]+)['"]?/gm)].map(match => match[1])
        if (report.entryIds.length === 0) add(report, 'errors', 'MKT005', 'Bundle Patch does not insert a DSH entry ID')
        if (new Set(report.entryIds).size !== report.entryIds.length) add(report, 'errors', 'MKT005', 'Bundle Patch contains duplicate entry IDs', report.entryIds)
        for (const protectedId of ['ui-settings-plugin-inventory', 'dsh-safe-plugin-manager']) {
          const pattern = new RegExp(`(?:^|\\n)\\s*-\\s*id:\\s*['"]?${protectedId}['"]?[\\s\\S]{0,160}?disabled:\\s*true`, 'i')
          if (pattern.test(patch)) add(report, 'blockers', 'MKT007', `Bundle Patch disables protected entry ${protectedId}`)
          if (report.entryIds.includes(protectedId) && manifest.name !== protectedId) add(report, 'blockers', 'MKT007', `Bundle Patch shadows protected entry ${protectedId}`)
        }
        if (/@deepseek-ai\//.test(patch) && /disabled:\s*true/.test(patch)) add(report, 'blockers', 'MKT007', 'Bundle Patch appears to disable an official @deepseek-ai package')
      }
    }
    report.lifecycleScripts = ENUMS.lifecycle.filter(name => typeof manifest.scripts?.[name] === 'string')
    const manifestRepository = canonicalGithub(manifest.repository)
    if (entry) {
      if (manifest.name !== entry.packageName) add(report, 'errors', 'MKT004', 'manifest name does not match catalog packageName', { manifest: manifest.name, catalog: entry.packageName })
      if (manifest.version !== entry.version) add(report, 'errors', 'MKT004', 'manifest version does not match catalog version', { manifest: manifest.version, catalog: entry.version })
      if (typeof manifest.license === 'string' && manifest.license.trim() !== entry.details?.license) add(report, 'errors', 'MKT004', 'manifest license does not match catalog license', { manifest: manifest.license, catalog: entry.details?.license })
      if (!sameSet(report.entryIds, strings(entry.entryIds))) add(report, 'errors', 'MKT005', 'catalog entryIds must exactly match Bundle Patch IDs', { patch: report.entryIds, catalog: entry.entryIds })
      if (!sameSet(report.lifecycleScripts, strings(entry.risk?.installScripts))) add(report, 'errors', 'MKT006', 'catalog lifecycle scripts must exactly match the manifest', { manifest: report.lifecycleScripts, catalog: entry.risk?.installScripts })
      if (manifestRepository && manifestRepository !== canonicalGithub(entry.repositoryUrl)) add(report, 'errors', 'MKT004', 'manifest repository does not match catalog repositoryUrl', { manifest: manifestRepository, catalog: entry.repositoryUrl })
      if (entry.status === 'approved' && (!manifest.license || ['UNLICENSED', 'UNKNOWN'].includes(String(manifest.license).toUpperCase()))) {
        add(report, 'errors', 'MKT011', 'approved listing requires explicit usable license authority; use blocked status while unresolved', manifest.license ?? null)
      }
    }
    report.candidate = {
      packageName: manifest.name ?? null,
      version: manifest.version ?? null,
      license: manifest.license ?? 'UNKNOWN',
      repositoryUrl: manifestRepository,
      manifestPath,
      installPath: manifestPath === 'package.json' ? null : relative(root, packageRoot),
      entryIds: report.entryIds,
      installScripts: report.lifecycleScripts,
    }
  }

  if (registry) {
    if (!isObject(registry) || !Array.isArray(registry.entries) || !isObject(registry.registry)) add(report, 'errors', 'MKT_SCHEMA', 'registry catalog shape is invalid')
    else if (entry) {
      const policy = registry.registry.trustPolicy
      if (policy?.candidateInstallDisabled !== true || policy?.unknownIsNotVerified !== true || policy?.promotionIndependentOfVerification !== true) {
        add(report, 'errors', 'MKT013', 'current Registry trustPolicy must keep candidates non-installable, unknown unverified, and promotion independent of verification')
      }
      const categories = isObject(registry.registry.categories) ? registry.registry.categories : {}
      for (const category of strings(entry.categories)) if (!Object.hasOwn(categories, category)) add(report, 'errors', 'MKT010', `catalog category is unknown: ${category}`)
      if (strings(entry.categories).length === 0) add(report, 'errors', 'MKT010', 'catalog entry must declare at least one current category')
      for (const current of registry.entries) {
        if (current.id === entry.id && current.packageName !== entry.packageName) add(report, 'errors', 'MKT010', `catalog id already belongs to another package: ${entry.id}`)
        if (current.packageName === entry.packageName && current.id !== entry.id) add(report, 'errors', 'MKT010', `packageName already belongs to another catalog id: ${entry.packageName}`)
      }
    }
  } else if (entry) {
    add(report, 'warnings', 'MKT010', 'current Registry catalog was not supplied; categories and duplicates remain unverified')
  }

  if (entry && ['unknown', 'unreviewed'].some(value => JSON.stringify(entry).includes(`"${value}"`))) {
    add(report, 'warnings', 'MKT008', 'catalog preserves unknown or unreviewed metadata; do not upgrade it without evidence')
  }
  if (entry) add(report, 'warnings', 'MKT012', 'fixed-Commit GitHub manifest/Patch, Registry CI, merge, and public marketplace still require separate verification')

  if (report.blockers.length > 0) {
    report.status = 'BLOCKED'
    report.route = 'blocked'
    report.nextGate = 'Remove the hard DSH/source/authorization blocker before preparing an approved listing.'
  } else if (report.errors.length > 0) {
    report.status = 'NEEDS_STANDARDIZATION'
    if (!manifestRecord?.manifest?.dsh?.bundle?.patch) report.route = 'adapter-required'
    report.nextGate = report.route === 'adapter-required'
      ? 'Add an upstream standard DSH Bundle contract or build a separately owned adapter, then rerun both audits.'
      : 'Fix the listed manifest, Patch, catalog, lifecycle, license, or metadata mismatches and rerun the audit.'
  } else if (!entry) {
    report.status = 'READY_FOR_CATALOG_ENTRY'
    report.nextGate = 'Create a catalog entry from the candidate, add a full immutable Commit and current Registry categories, then rerun with --entry and --registry.'
  } else {
    report.status = 'READY_FOR_PINNED_SOURCE_VERIFICATION'
    report.nextGate = 'Read back manifest and Patch from the exact Commit, then run current DSH STORE validate:registry and verify:registry-sources checks in a separate contribution worktree.'
  }

  if (args.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  else {
    process.stdout.write(`DSH MARKETPLACE PREFLIGHT ${root}\n`)
    process.stdout.write(`status: ${report.status}\nroute: ${report.route}\n`)
    if (report.package) process.stdout.write(`package: ${report.package.name ?? '?'}@${report.package.version ?? '?'}\n`)
    process.stdout.write(`manifest: ${report.manifestPath ?? 'unresolved'}\nentry-ids: ${report.entryIds.join(', ') || 'none'}\n`)
    for (const level of ['blockers', 'errors', 'warnings']) if (report[level].length) process.stdout.write(`${level}:\n- ${report[level].map(item => `${item.code} ${item.message}`).join('\n- ')}\n`)
    process.stdout.write(`next: ${report.nextGate}\n${report.note}\n`)
  }
  if (report.status === 'BLOCKED') process.exitCode = 2
  else if (report.status === 'NEEDS_STANDARDIZATION') process.exitCode = 1
}

main().catch(error => {
  process.stderr.write(`MARKETPLACE_AUDIT_ERROR ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 3
})
