#!/usr/bin/env node

import { readFile, readdir, stat } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import process from 'node:process'

const EXCLUDED_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.next', '.turbo', '.pnpm-store'])
const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.json', '.yml', '.yaml', '.md', '.sh', '.txt'])
const MAX_FILE_BYTES = 1024 * 1024

function parseArgs(argv) {
  const out = { root: '.', json: false, evidence: null }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--json') out.json = true
    else if (arg === '--evidence') out.evidence = argv[++i]
    else if (arg.startsWith('--')) throw new Error(`unknown argument: ${arg}`)
    else out.root = arg
  }
  if (out.evidence === undefined) throw new Error('--evidence requires a path')
  return out
}

async function pathExists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function collectFiles(root) {
  const files = []
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) continue
      const absolute = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(absolute)
        continue
      }
      if (!entry.isFile()) continue
      const rel = relative(root, absolute)
      const extension = extname(entry.name).toLowerCase()
      if (!TEXT_EXTENSIONS.has(extension) && entry.name !== 'package.json') continue
      const info = await stat(absolute)
      if (info.size > MAX_FILE_BYTES) continue
      files.push({ absolute, rel, extension })
    }
  }
  await walk(root)
  return files
}

async function loadRecords(files) {
  return Promise.all(files.map(async file => ({ ...file, text: await readFile(file.absolute, 'utf8') })))
}

function stringsFromEntry(value) {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(stringsFromEntry)
  if (value && typeof value === 'object') return Object.values(value).flatMap(stringsFromEntry)
  return []
}

function linesMatching(records, pattern, { codeOnly = false } = {}) {
  const matches = []
  for (const record of records) {
    const isTest = /(^|\/)(test|tests|__tests__)(\/|$)/.test(record.rel)
    if (codeOnly && (record.extension === '.md' || record.extension === '.txt' || isTest)) continue
    record.text.split(/\r?\n/).forEach((line, index) => {
      pattern.lastIndex = 0
      if (pattern.test(line)) matches.push(`${record.rel}:${index + 1}`)
    })
  }
  return matches
}

function makeCategory(name, max) {
  return { name, max, score: 0, checks: [] }
}

function addCheck(category, label, pass, points, detail) {
  category.checks.push({ label, pass, points: pass ? points : 0, max: points, detail })
  if (pass) category.score += points
}

function evidencePoints(evidence) {
  const weights = { dumpConfig: 4, isolatedRuntime: 6, realProfile: 6, externalReadback: 4 }
  const checks = []
  let score = 0
  for (const [key, max] of Object.entries(weights)) {
    const item = evidence?.[key]
    const pass = item?.verified === true && typeof item?.evidence === 'string' && item.evidence.trim().length >= 8
    checks.push({ label: key, pass, points: pass ? max : 0, max, detail: pass ? item.evidence.trim() : 'current traceable evidence not supplied' })
    if (pass) score += max
  }
  return { name: 'Runtime evidence', score, max: 20, checks }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const root = resolve(args.root)
  if (!(await pathExists(root))) throw new Error(`repository does not exist: ${root}`)

  let pkg = null
  let packageError = null
  let packagePath = join(root, 'package.json')
  for (const candidate of [join(root, 'package.json'), join(root, 'plugin', 'package.json')]) {
    try {
      const value = JSON.parse(await readFile(candidate, 'utf8'))
      if (value?.dsh?.bundle?.patch || pkg === null) {
        pkg = value
        packagePath = candidate
        packageError = null
      }
      if (value?.dsh?.bundle?.patch) break
    } catch (error) {
      if (pkg === null) packageError = error instanceof Error ? error.message : String(error)
    }
  }
  const packageRoot = dirname(packagePath)

  const records = await loadRecords(await collectFiles(root))
  const allText = records.map(record => record.text).join('\n')
  const codeRecords = records.filter(record => !['.md', '.txt'].includes(record.extension) && !/(^|\/)(test|tests|__tests__)(\/|$)/.test(record.rel))
  const codeText = codeRecords.map(record => record.text).join('\n')
  const testText = records.filter(record => /(^|\/)(test|tests|__tests__)(\/|$)/.test(record.rel)).map(record => record.text).join('\n')
  const readme = records.find(record => /^readme(?:\.[^.]+)?\.md$/i.test(basename(record.rel)))?.text ?? ''

  const patchRelRaw = pkg?.dsh?.bundle?.patch
  const patchRel = typeof patchRelRaw === 'string' ? patchRelRaw.replace(/^\.\//, '') : null
  const patchPath = patchRel ? join(packageRoot, patchRel) : null
  const patchExists = patchPath ? await pathExists(patchPath) : false
  const patchText = patchExists ? await readFile(patchPath, 'utf8') : ''
  const entryIds = [...patchText.matchAll(/^\s*-\s*id:\s*['"]?([^'"\s#]+)['"]?/gm)].map(match => match[1])
  const uniqueEntryIds = new Set(entryIds)

  const entries = [...new Set([
    ...stringsFromEntry(pkg?.main),
    ...stringsFromEntry(pkg?.exports),
    ...stringsFromEntry(pkg?.browser),
  ].filter(value => typeof value === 'string' && !value.startsWith('node:') && !value.startsWith('#')).map(value => value.replace(/^\.\//, '')))]
  const entryExistence = await Promise.all(entries.map(async entry => ({ entry, exists: await pathExists(join(packageRoot, entry)) })))
  const allEntriesExist = entries.length > 0 && entryExistence.every(item => item.exists)
  const patchOnlyAdapter = entries.length === 0 && entryIds.length > 0 && /^\s*name:\s*['"]?[@a-z0-9_-]/im.test(patchText)
  const runtimeEntryContract = allEntriesExist || patchOnlyAdapter

  const hasWebRegistration = /webServer\.(?:register|route)|ctx\.webServer/.test(codeText)
  const hasOptionalWebInjection = /ctx\.inject\s*\(\s*\[\s*['"]webServer['"]\s*\]/.test(codeText) || /inject\s*=\s*\[[^\]]*['"]webServer['"]/.test(codeText)
  const hasClient = /window\.__ModuleLoader__\.load|ctx\.slots\.(?:register|inject)/.test(allText)
  const clientRecords = records.filter(record => /(^|\/)(client|browser)(\.|\/)/i.test(record.rel) || /lib\/client\.[cm]?[jt]s$/.test(record.rel))
  const clientHostImports = clientRecords.flatMap(record => {
    const bad = /(?:from\s+['"](?:node:|@deepseek-ai\/dsh-host)|require\(['"](?:node:|@deepseek-ai\/dsh-host)|child_process|node:fs)/
    return record.text.split(/\r?\n/).flatMap((line, index) => bad.test(line) ? [`${record.rel}:${index + 1}`] : [])
  })

  const allowedCardDiscriminants = new Set(['generic', 'terminal', 'diff', 'search', 'read', 'web'])
  const cardDiscriminants = codeRecords.flatMap(record => [...record.text.matchAll(/\bcard\s*:\s*['"]([^'"]+)['"]/g)]
    .map(match => ({ value: match[1], file: record.rel })))
  const unsupportedCardDiscriminants = cardDiscriminants.filter(item => !allowedCardDiscriminants.has(item.value))
  const presenterRecords = codeRecords.filter(record => /\bpresent(?:Call|Result)\s*(?::|\()/.test(record.text))
  const presenterUiImports = presenterRecords.flatMap(record => {
    const bad = /from\s+['"](?:react|@deepseek-ai\/dsh-client|[^'"]*\/client(?:\/|['"]))/
    return record.text.split(/\r?\n/).flatMap((line, index) => bad.test(line) ? [`${record.rel}:${index + 1}`] : [])
  })
  const presenterSideEffects = linesMatching(presenterRecords, /\bpresent(?:Call|Result)\b[^\n]*(?:Date\.now|new\s+Date|Math\.random|readFile|writeFile|fetch\s*\(|process\.env|ctx\.(?:session|agent|fs|webServer))/, { codeOnly: true })
  const officialToolCardReplacement = linesMatching(records, /name\s*:\s*['"]tool\.call\.toolview['"][^\n]{0,240}key\s*:\s*['"](?:bash|read|write|edit|grep|glob|web_search|web_fetch|skill|run_code)['"]/, { codeOnly: true })
  const fullArgsRawInput = linesMatching(presenterRecords, /rawInput\s*:\s*args\b/, { codeOnly: true })
  const hasToolPresenters = presenterRecords.length > 0
  const usesPresentationMeta = /\bpresentationMeta\b/.test(codeText)
  const cardTestCoverage = !hasToolPresenters || [
    /presentCall/i,
    /presentResult/i,
    /replay/i,
    /fallback|undefined|malformed/i,
    /serializ|JSON|bound|limit|truncat/i,
  ].every(pattern => pattern.test(testText))

  const loaderFiberMutations = linesMatching(records, /(?:ctx\.(?:loader|fiber)|\b(?:Loader|Fiber))\.(?:insert|remove|patch|enable|disable|write|mutate)\s*\(/, { codeOnly: true })
  const coreWriteTargets = linesMatching(records, /(?:writeFile|appendFile|rename|unlink|rm|copyFile)\s*\([^\n]*?(?:deepseek-harness|@deepseek-ai|profiles\/node_modules)/i, { codeOnly: true })
  const officialShadow = /(?:remove|disable|patch):[\s\S]{0,240}(?:@deepseek-ai\/|dsh-base|dsh-web-app|dsh-headless)/i.test(patchText)
  const shellStrings = linesMatching(records, /(?:\bexecSync?\s*\(|shell\s*:\s*true|['"](?:bash|sh)['"]\s*,\s*['"]-c['"])/, { codeOnly: true })
  const secretLogs = linesMatching(records, /(?:console|logger)\.(?:log|info|warn|error|debug)\s*\([^\n]*(?:token|secret|apiKey|cookie|authorization)/i, { codeOnly: true })

  const profileMutation = codeRecords.some(record =>
    /(?:profiles?[\\/]|profileDir|profilePath|dsh\.profile\.bundles)/i.test(record.text)
    && /(?:writeFile|appendFile|rename|unlink|rm|copyFile)\s*\(|plugin[^\n]*(?:add|remove|update)/i.test(record.text))
  const marker = pattern => pattern.test(allText)
  const mutationMarkers = {
    plan: marker(/single[- ]use|singleUse|一次性|createPlan|planId/i),
    confirmation: marker(/confirmation|confirmPhrase|确认语|精确确认/i),
    precondition: marker(/sha-?256|precondition|前置哈希|concurrent|并发/i),
    backup: marker(/backup|备份/i),
    atomic: marker(/atomic|原子|lockFile|file lock|文件锁/i),
    health: marker(/health check|healthCheck|健康检查|dump-config/i),
    rollback: marker(/rollback|回滚|restore exact|精确恢复/i),
  }

  const realHomeTestWrites = records.flatMap(record => {
    if (!/(^|\/)(test|tests|__tests__)(\/|$)/.test(record.rel)) return []
    if (!/(?:writeFile|appendFile|rename|unlink|rm|mkdir|copyFile)\s*\(/.test(record.text)) return []
    return record.text.split(/\r?\n/).flatMap((line, index) => /(?:~\/\.dsh|\/Users\/[^/]+\/\.dsh|process\.env\.HOME.*\.dsh|homedir\(\).*\.dsh)/.test(line) ? [`${record.rel}:${index + 1}`] : [])
  })

  const lifecycleScripts = Object.keys(pkg?.scripts ?? {}).filter(name => ['preinstall', 'install', 'postinstall', 'prepare'].includes(name))
  const hasTypeScriptRuntime = entries.some(entry => entry.endsWith('.ts')) || records.some(record => /(^|\/)src\/.*\.ts$/.test(record.rel))
  const buildContract = allEntriesExist || !hasTypeScriptRuntime || lifecycleScripts.includes('prepare')
  const hasImmutableSha = /\b[0-9a-f]{40}\b/i.test(readme) || /\b[0-9a-f]{40}\b/i.test(allText)
  const hasRepo = typeof pkg?.repository === 'string' || (pkg?.repository && typeof pkg.repository.url === 'string')
  const hasLicense = typeof pkg?.license === 'string' || await pathExists(join(packageRoot, 'LICENSE')) || await pathExists(join(root, 'LICENSE'))
  const testFiles = records.filter(record => /(^|\/)(test|tests|__tests__)(\/|$)/.test(record.rel))
  const hasTestScript = typeof pkg?.scripts?.test === 'string' || typeof pkg?.scripts?.check === 'string'
  const safetyTestMarkers = /fail closed|rollback|回滚|concurrent|并发|traversal|shell|official|malformed|篡改|replay|cross-origin/i.test(testText)
  const hasBoundaryDocs = /边界|boundary|non-goal|不修改|read-only|只读|security|permission/i.test(readme + '\n' + allText)
  const hasStatusDistinctions = /verified|unverified|partial|blocked|已验证|未验证|部分|受阻/i.test(readme + '\n' + allText)
  const hasNextGate = /next gate|下一.*门|尚未|not verified|验收|verification/i.test(readme + '\n' + allText)
  const hasSecurityDoc = records.some(record => /(^|\/)SECURITY\.md$/i.test(record.rel))

  const categories = []
  const host = makeCategory('Host contract', 16)
  addCheck(host, 'package.json parses', pkg !== null, 3, packageError ?? `valid package manifest at ${relative(root, packagePath) || 'package.json'}`)
  addCheck(host, 'standard dsh.bundle patch exists', Boolean(patchRel && patchExists), 5, patchRel ?? 'dsh.bundle.patch missing')
  addCheck(host, 'runtime entry points exist', runtimeEntryContract, 3, entryExistence.length ? entryExistence : patchOnlyAdapter ? 'patch-only provider adapter' : 'no main/exports/browser entry')
  addCheck(host, 'optional webServer is delayed', !hasWebRegistration || hasOptionalWebInjection, 2, hasWebRegistration ? 'web route detected' : 'no web route')
  addCheck(host, 'client/card presentation is separated and registered', (!hasClient || clientHostImports.length === 0) && presenterUiImports.length === 0 && officialToolCardReplacement.length === 0, 3, { hasClient, clientHostImports, presenterUiImports, officialToolCardReplacement })
  categories.push(host)

  const safety = makeCategory('Non-destructive safety', 16)
  addCheck(safety, 'no Loader/Fiber mutation calls', loaderFiberMutations.length === 0, 4, loaderFiberMutations)
  addCheck(safety, 'no DSH core/official write targets', coreWriteTargets.length === 0, 4, coreWriteTargets)
  addCheck(safety, 'no official inventory shadow', !officialShadow, 3, officialShadow ? 'official remove/disable/patch pattern in bundle patch' : 'none')
  addCheck(safety, 'no shell-string execution', shellStrings.length === 0, 2, shellStrings)
  addCheck(safety, 'no secret logging, Client Host imports, or invalid card effects', secretLogs.length === 0 && clientHostImports.length === 0 && presenterSideEffects.length === 0 && unsupportedCardDiscriminants.length === 0, 3, { secretLogs, clientHostImports, presenterSideEffects, unsupportedCardDiscriminants, fullArgsRawInput })
  categories.push(safety)

  const mutation = makeCategory('Mutation discipline', 16)
  if (!profileMutation) {
    addCheck(mutation, 'no Profile lifecycle mutation detected', true, 16, 'read-only or plugin-owned state only')
  } else {
    addCheck(mutation, 'typed single-use plan', mutationMarkers.plan, 3, 'R3 Profile mutation detected')
    addCheck(mutation, 'exact confirmation', mutationMarkers.confirmation, 3, '')
    addCheck(mutation, 'precondition hashes/concurrency', mutationMarkers.precondition, 2, '')
    addCheck(mutation, 'backup', mutationMarkers.backup, 2, '')
    addCheck(mutation, 'atomic commit/lock', mutationMarkers.atomic, 2, '')
    addCheck(mutation, 'health check', mutationMarkers.health, 2, '')
    addCheck(mutation, 'rollback', mutationMarkers.rollback, 2, '')
  }
  categories.push(mutation)

  const packaging = makeCategory('Packaging and source', 12)
  addCheck(packaging, 'name and version declared', typeof pkg?.name === 'string' && typeof pkg?.version === 'string', 3, pkg ? `${pkg.name ?? '?'}@${pkg.version ?? '?'}` : 'missing')
  addCheck(packaging, 'files and entry contract declared', Array.isArray(pkg?.files) && runtimeEntryContract, 2, { files: pkg?.files, entries, patchOnlyAdapter })
  addCheck(packaging, 'build/install contract is satisfiable', buildContract || patchOnlyAdapter, 2, { hasTypeScriptRuntime, lifecycleScripts, allEntriesExist, patchOnlyAdapter })
  addCheck(packaging, 'repository and license declared', hasRepo && hasLicense, 2, { hasRepo, hasLicense })
  addCheck(packaging, 'immutable 40-character source present', hasImmutableSha, 3, hasImmutableSha ? 'pinned source found' : 'release/install anchor not found')
  categories.push(packaging)

  const tests = makeCategory('Tests', 12)
  addCheck(tests, 'test/check script declared', hasTestScript, 3, pkg?.scripts ?? {})
  addCheck(tests, 'test files exist', testFiles.length > 0, 3, `${testFiles.length} text test files`)
  addCheck(tests, 'tests avoid real ~/.dsh writes', realHomeTestWrites.length === 0, 3, realHomeTestWrites)
  addCheck(tests, 'safety/fault/card replay boundary tests present', safetyTestMarkers && cardTestCoverage, 3, { safetyTestMarkers, hasToolPresenters, usesPresentationMeta, cardTestCoverage })
  categories.push(tests)

  const docs = makeCategory('Documentation and status', 8)
  addCheck(docs, 'README exists', readme.length > 0, 2, readme.length > 0 ? 'README found' : 'missing')
  addCheck(docs, 'permissions/non-goals/boundaries documented', hasBoundaryDocs || hasSecurityDoc, 2, { hasBoundaryDocs, hasSecurityDoc })
  addCheck(docs, 'verified/partial/blocked/unverified are distinct', hasStatusDistinctions, 2, '')
  addCheck(docs, 'verification and next gate documented', hasNextGate, 2, '')
  categories.push(docs)

  let evidence = null
  if (args.evidence) {
    const evidencePath = isAbsolute(args.evidence) ? args.evidence : resolve(process.cwd(), args.evidence)
    evidence = JSON.parse(await readFile(evidencePath, 'utf8'))
  }
  const runtime = evidencePoints(evidence)

  const blockers = []
  if (pkg === null || !patchRel || !patchExists) blockers.push('standard DSH bundle contract is missing or invalid')
  if (entryIds.length === 0 || entryIds.length !== uniqueEntryIds.size) blockers.push('bundle entry IDs are missing or duplicated')
  if (loaderFiberMutations.length) blockers.push('Loader/Fiber mutation API call detected')
  if (coreWriteTargets.length) blockers.push('possible DSH core or official package write target detected')
  if (officialShadow) blockers.push('official inventory remove/disable/patch pattern detected')
  if (shellStrings.length) blockers.push('shell-string execution detected')
  if (secretLogs.length || clientHostImports.length) blockers.push('secret logging or Browser Client Host import detected')
  if (presenterUiImports.length) blockers.push('Tool presenter imports Client/UI code instead of using provider-neutral card intents')
  if (presenterSideEffects.length) blockers.push('Tool presenter may depend on I/O, current state, time, randomness, or environment')
  if (unsupportedCardDiscriminants.length) blockers.push('unsupported DSH Tool card discriminant detected')
  if (officialToolCardReplacement.length) blockers.push('Client may replace an official DSH Tool card key')
  if (!cardTestCoverage) blockers.push('Tool card presenters lack deterministic replay/fallback/bounds contract tests')
  if (realHomeTestWrites.length) blockers.push('test may write to real ~/.dsh')
  if (profileMutation && Object.values(mutationMarkers).some(value => !value)) blockers.push('Profile mutation lacks one or more required transaction markers')

  const staticScore = categories.reduce((sum, category) => sum + category.score, 0)
  const total = staticScore + runtime.score
  let status = 're-scope'
  if (blockers.length) status = 'BLOCKED'
  else if (total >= 90) status = 'controlled-real-profile-acceptance-ready'
  else if (total >= 75) status = 'isolated-acceptance-ready'
  else if (total >= 60) status = 'implementation-incomplete'

  const report = {
    schemaVersion: 1,
    root,
    package: pkg ? { name: pkg.name ?? null, version: pkg.version ?? null } : null,
    riskSignals: { profileMutation, hasWebRegistration, hasClient, lifecycleScripts },
    entryIds,
    staticScore,
    staticMax: 80,
    runtimeScore: runtime.score,
    runtimeMax: 20,
    total,
    status,
    blockers,
    categories,
    cardContract: {
      detected: hasToolPresenters,
      discriminants: [...new Set(cardDiscriminants.map(item => item.value))],
      usesPresentationMeta,
      testCoverage: cardTestCoverage,
      findings: {
        unsupportedCardDiscriminants,
        presenterUiImports,
        presenterSideEffects,
        officialToolCardReplacement,
        fullArgsRawInput,
      },
    },
    runtimeEvidence: runtime,
    note: 'This is a read-only static/evidence audit. It does not prove DSH runtime, UI, device, public deployment, or rollback behavior.',
  }

  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    return
  }

  console.log(`${report.package?.name ?? basename(root)} ${report.package?.version ?? ''}`.trim())
  console.log(`status=${status} static=${staticScore}/80 runtime=${runtime.score}/20 total=${total}/100`)
  for (const category of categories) console.log(`${category.name}: ${category.score}/${category.max}`)
  console.log(`Runtime evidence: ${runtime.score}/20`)
  if (blockers.length) {
    console.log('Hard blockers:')
    blockers.forEach(item => console.log(`- ${item}`))
  }
  const failed = categories.flatMap(category => category.checks.filter(check => !check.pass).map(check => `${category.name}: ${check.label}`))
  if (failed.length) {
    console.log('Unmet checks:')
    failed.forEach(item => console.log(`- ${item}`))
  }
  console.log(report.note)
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
