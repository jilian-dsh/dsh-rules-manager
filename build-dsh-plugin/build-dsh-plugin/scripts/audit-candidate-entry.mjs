#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const SIMPLE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/
const COMMIT = /^[0-9a-f]{40}$/
const FORBIDDEN_TRUSTED_FIELDS = [
  'packageName', 'manifestPath', 'installPath', 'entryIds', 'compatibility', 'details', 'risk', 'updatePolicy',
  'installable', 'allowedActions',
]

function parseArgs(argv) {
  const options = { entry: null, candidates: null, catalog: null, json: false }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--json') options.json = true
    else if (value === '--entry') options.entry = argv[++index]
    else if (value === '--candidates') options.candidates = argv[++index]
    else if (value === '--catalog') options.catalog = argv[++index]
    else throw new Error(`unknown argument: ${value}`)
  }
  if (!options.entry) throw new Error('usage: audit-candidate-entry.mjs --entry candidate.json [--candidates candidates.json] [--catalog catalog.json] [--json]')
  return options
}

async function loadJson(path, label) {
  try { return JSON.parse(await readFile(resolve(path), 'utf8')) }
  catch (error) { throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`) }
}

function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) }
function strings(value) { return Array.isArray(value) ? value.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean) : [] }
function canonicalGithub(value) {
  if (typeof value !== 'string') return null
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/#]+?)\/?$/.exec(value.trim().replace(/\.git$/i, ''))
  return match ? `https://github.com/${match[1]}/${match[2]}` : null
}
function iso(value, nullable = false) {
  if (nullable && (value === null || value === undefined)) return true
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value))
}
function add(report, code, message, detail = null) { report.errors.push({ code, message, detail }) }

function validateEntry(entry, report) {
  if (!isObject(entry)) {
    add(report, 'CANDIDATE_SCHEMA', 'candidate entry must be an object')
    return
  }
  for (const field of ['id', 'name', 'description', 'repositoryUrl', 'discoveredAt', 'discoverySources', 'status', 'route']) {
    if (!Object.hasOwn(entry, field)) add(report, 'CANDIDATE_SCHEMA', `candidate entry is missing ${field}`)
  }
  const forbidden = FORBIDDEN_TRUSTED_FIELDS.filter(field => Object.hasOwn(entry, field))
  if (forbidden.length > 0) add(report, 'CANDIDATE_TRUST_BOUNDARY', 'candidate entry contains trusted install fields', forbidden)
  if (!SIMPLE_ID.test(entry.id ?? '')) add(report, 'CANDIDATE_SCHEMA', 'candidate id is invalid', entry.id)
  if (typeof entry.name !== 'string' || entry.name.trim() === '') add(report, 'CANDIDATE_SCHEMA', 'candidate name is required')
  if (typeof entry.description !== 'string' || entry.description.trim().length < 2 || entry.description.length > 2_000) add(report, 'CANDIDATE_SCHEMA', 'candidate description must be bounded')
  const repositoryUrl = canonicalGithub(entry.repositoryUrl)
  if (!repositoryUrl) add(report, 'CANDIDATE_SOURCE', 'repositoryUrl must be a canonical public GitHub repository URL', entry.repositoryUrl)
  if (entry.defaultBranch !== undefined && (typeof entry.defaultBranch !== 'string' || entry.defaultBranch.trim() === '')) add(report, 'CANDIDATE_SCHEMA', 'defaultBranch must be non-empty')
  if (entry.latestCommit !== null && entry.latestCommit !== undefined && !COMMIT.test(entry.latestCommit)) add(report, 'CANDIDATE_SOURCE', 'latestCommit must be null or a full lowercase Commit SHA', entry.latestCommit)
  if (!iso(entry.sourceUpdatedAt, true)) add(report, 'CANDIDATE_SOURCE', 'sourceUpdatedAt must be null or an ISO date-time', entry.sourceUpdatedAt)
  if (!iso(entry.discoveredAt)) add(report, 'CANDIDATE_SOURCE', 'discoveredAt must be an ISO date-time', entry.discoveredAt)
  if (strings(entry.discoverySources).length === 0) add(report, 'CANDIDATE_SOURCE', 'discoverySources must contain at least one source')
  if (entry.topics !== undefined && !Array.isArray(entry.topics)) add(report, 'CANDIDATE_SCHEMA', 'topics must be an array')
  if (!['discovered', 'reviewing', 'rejected'].includes(entry.status)) add(report, 'CANDIDATE_SCHEMA', 'status must be discovered, reviewing, or rejected', entry.status)
  if (!['direct-review', 'monorepo-review', 'adapter-required', 'blocked'].includes(entry.route)) add(report, 'CANDIDATE_SCHEMA', 'route is invalid', entry.route)
  if ((entry.status === 'rejected' || entry.route === 'blocked') && (typeof entry.statusReason !== 'string' || entry.statusReason.trim() === '')) {
    add(report, 'CANDIDATE_SCHEMA', 'rejected or blocked candidates require statusReason')
  }
  report.candidate = repositoryUrl ? {
    id: entry.id, repositoryUrl, status: entry.status, route: entry.route,
    installable: false, allowedActions: [],
  } : null
}

const options = parseArgs(process.argv.slice(2))
const entry = await loadJson(options.entry, 'candidate entry')
const report = {
  schemaVersion: 1,
  status: 'NEEDS_REVIEW',
  route: 'candidate-discovery',
  entry: resolve(options.entry),
  errors: [], warnings: [], candidate: null,
  trustBoundary: { installable: false, allowedActions: [] },
  nextGate: '',
  note: 'Candidate discovery never proves installability, runtime compatibility, security review, catalog promotion, or public listing.',
}
validateEntry(entry, report)

if (options.candidates) {
  const registry = await loadJson(options.candidates, 'candidate registry')
  const boundary = registry?.registry?.trustBoundary
  if (boundary?.installActionsDisabled !== true || boundary?.catalogPromotionRequired !== true || boundary?.unknownIsNotVerified !== true) {
    add(report, 'CANDIDATE_TRUST_BOUNDARY', 'candidate registry trust boundary must fail closed')
  }
  for (const current of Array.isArray(registry?.entries) ? registry.entries : []) {
    if (current.id === entry.id) add(report, 'CANDIDATE_DUPLICATE', `candidate id already exists: ${entry.id}`)
    if (canonicalGithub(current.repositoryUrl)?.toLowerCase() === canonicalGithub(entry.repositoryUrl)?.toLowerCase()) {
      add(report, 'CANDIDATE_DUPLICATE', `candidate repository already exists: ${entry.repositoryUrl}`)
    }
  }
}

if (options.catalog) {
  const catalog = await loadJson(options.catalog, 'trusted catalog')
  const policy = catalog?.registry?.trustPolicy
  if (policy?.candidateInstallDisabled !== true || policy?.unknownIsNotVerified !== true || policy?.promotionIndependentOfVerification !== true) {
    add(report, 'CANDIDATE_TRUST_BOUNDARY', 'trusted catalog does not declare the current fail-closed trust policy')
  }
  for (const trusted of Array.isArray(catalog?.entries) ? catalog.entries : []) {
    if (canonicalGithub(trusted.repositoryUrl)?.toLowerCase() === canonicalGithub(entry.repositoryUrl)?.toLowerCase()) {
      add(report, 'CANDIDATE_DUPLICATE_TRUSTED', 'repository already exists in the trusted catalog', trusted.id)
    }
  }
}

if (report.errors.length === 0) {
  report.status = entry.status === 'rejected' ? 'REJECTED' : 'READY_FOR_DISCOVERY_REGISTRY'
  report.nextGate = entry.status === 'rejected'
    ? 'Keep the record out of the visible candidate registry or retain it only as an explicit rejection audit record.'
    : 'Add only to registry/candidates.json; run host, license, fixed-source, Bundle, permission, compatibility, and evidence review before trusted catalog promotion.'
} else {
  report.status = 'NEEDS_STANDARDIZATION'
  report.nextGate = 'Remove trusted install fields, fix candidate metadata and trust-boundary errors, then rerun the candidate audit.'
}

if (options.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
else {
  process.stdout.write(`DSH CANDIDATE PREFLIGHT ${report.entry}\nstatus: ${report.status}\nroute: ${report.route}\n`)
  for (const error of report.errors) process.stdout.write(`ERROR ${error.code}: ${error.message}\n`)
  process.stdout.write(`next: ${report.nextGate}\n`)
}
process.exitCode = report.errors.length > 0 ? 1 : 0
