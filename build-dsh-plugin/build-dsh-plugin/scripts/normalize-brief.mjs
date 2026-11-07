#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

function parseArgs(argv) {
  const args = { path: null, json: false }
  for (const arg of argv) {
    if (arg === '--json') args.json = true
    else if (arg.startsWith('--')) throw new Error(`unknown argument: ${arg}`)
    else if (args.path === null) args.path = arg
    else throw new Error(`unexpected argument: ${arg}`)
  }
  if (!args.path) throw new Error('usage: normalize-brief.mjs <brief.json> [--json]')
  return args
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function string(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function array(value) {
  return Array.isArray(value) ? value : []
}

function stringArray(value) {
  return array(value).filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean)
}

function hasOwn(object, key) {
  return isObject(object) && Object.prototype.hasOwnProperty.call(object, key)
}

function isCanonicalGithubRepository(value) {
  return /^https:\/\/github\.com\/[^/]+\/[^/]+\/?$/.test(string(value))
}

function isSafeRepositoryPath(value, { allowEmpty = false } = {}) {
  const candidate = string(value)
  if (!candidate) return allowEmpty
  return !candidate.startsWith('/') && !candidate.includes('..') && !candidate.includes('\\')
}

function secretLikePaths(value, path = []) {
  if (Array.isArray(value)) return value.flatMap((item, index) => secretLikePaths(item, [...path, String(index)]))
  if (!isObject(value)) return []
  const findings = []
  for (const [key, child] of Object.entries(value)) {
    const childPath = [...path, key]
    if (/^(?:token|password|secret|cookie|authorization|apiKey|accessKey|privateKey)$/i.test(key)) {
      const populated = typeof child === 'string' ? child.trim().length > 0 : child !== null && child !== undefined
      if (populated) findings.push(childPath.join('.'))
      continue
    }
    findings.push(...secretLikePaths(child, childPath))
  }
  return findings
}

function safeEnum(value, allowed, fallback, errors, path) {
  const candidate = string(value) || fallback
  if (allowed.includes(candidate)) return candidate
  errors.push(`${path} must be one of: ${allowed.join(', ')}`)
  return 'invalid'
}

function slugify(value) {
  const slug = string(value)
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 45)
  if (!slug) return 'dsh-plugin-draft'
  if (slug.startsWith('dsh-') && slug.endsWith('-plugin')) return slug
  if (slug.startsWith('dsh-')) return `${slug}-plugin`
  if (slug.endsWith('-plugin')) return `dsh-${slug}`
  return `dsh-${slug}-plugin`
}

function hasCapabilityMode(capabilities, expected) {
  return capabilities.some(item => isObject(item) && string(item.mode) === expected)
}

function capabilityText(capabilities) {
  return capabilities.map(item => {
    if (typeof item === 'string') return item
    if (isObject(item)) return [item.name, item.kind, item.userValue].map(string).join(' ')
    return ''
  }).join(' ').toLowerCase()
}

function calculateCompleteness(raw, normalized) {
  const checks = [
    [Boolean(normalized.problem), 15, 'problem'],
    [Boolean(normalized.outcome.expectedResult), 15, 'outcome'],
    [normalized.outcome.acceptanceCriteria.length > 0, 15, 'acceptance'],
    [normalized.targetUsers.length > 0 && hasOwn(raw, 'targetUsers'), 5, 'targetUsers'],
    [Boolean(normalized.trigger) && hasOwn(raw, 'trigger'), 5, 'trigger'],
    [normalized.capabilities.length > 0, 10, 'capabilities'],
    [hasOwn(raw, 'data'), 10, 'dataBoundary'],
    [hasOwn(raw, 'ui'), 5, 'uiDecision'],
    [hasOwn(raw, 'external'), 5, 'externalBoundary'],
    [hasOwn(raw, 'profile'), 10, 'profileBoundary'],
    [hasOwn(raw, 'constraints'), 5, 'constraints'],
  ]
  return {
    score: checks.reduce((sum, [pass, points]) => sum + (pass ? points : 0), 0),
    checks: checks.map(([pass, points, label]) => ({ label, pass, points: pass ? points : 0, max: points })),
  }
}

function normalize(raw) {
  if (!isObject(raw)) throw new Error('brief root must be a JSON object')

  const errors = []
  const assumptions = []
  const secretPaths = secretLikePaths(raw)
  if (secretPaths.length > 0) errors.push(`brief contains secret-like fields; remove values from: ${secretPaths.join(', ')}`)
  const plugin = isObject(raw.plugin) ? raw.plugin : {}
  const outcome = isObject(raw.outcome) ? raw.outcome : {}
  const data = isObject(raw.data) ? raw.data : {}
  const ui = isObject(raw.ui) ? raw.ui : {}
  const external = isObject(raw.external) ? raw.external : {}
  const profile = isObject(raw.profile) ? raw.profile : {}
  const security = isObject(raw.security) ? raw.security : {}
  const constraints = isObject(raw.constraints) ? raw.constraints : {}
  const presentation = isObject(raw.presentation) ? raw.presentation : {}
  const delivery = isObject(raw.delivery) ? raw.delivery : {}
  const marketplace = isObject(delivery.marketplace) ? delivery.marketplace : {}
  const acceptance = isObject(raw.acceptance) ? raw.acceptance : {}

  const mode = safeEnum(raw.mode, ['plan', 'build-source', 'audit', 'release-plan', 'acceptance-plan'], 'build-source', errors, 'mode')
  const targetUsers = stringArray(raw.targetUsers)
  if (targetUsers.length === 0) assumptions.push('targetUsers defaults to DSH user')
  const trigger = string(raw.trigger)
  if (!trigger) assumptions.push('trigger defaults to explicit manual user action')
  const capabilities = array(raw.capabilities).filter(item => typeof item === 'string' || isObject(item))
  if (capabilities.length === 0) assumptions.push('capabilities will be derived from the problem, outcome, and acceptance criteria')
  const releaseTarget = safeEnum(delivery.releaseTarget, ['none', 'local', 'github', 'marketplace', 'website'], 'none', errors, 'delivery.releaseTarget')
  const marketplaceTarget = safeEnum(
    marketplace.target,
    ['none', 'dsh-store'],
    releaseTarget === 'marketplace' ? 'dsh-store' : 'none',
    errors,
    'delivery.marketplace.target',
  )
  const marketplaceListingIntent = safeEnum(
    marketplace.listingIntent,
    ['none', 'assess', 'approved', 'blocked', 'unlisted'],
    marketplaceTarget === 'dsh-store' ? 'assess' : 'none',
    errors,
    'delivery.marketplace.listingIntent',
  )

  const normalized = {
    schemaVersion: 1,
    mode,
    plugin: {
      name: string(plugin.name),
      summary: string(plugin.summary),
    },
    targetUsers: targetUsers.length > 0 ? targetUsers : ['DSH user'],
    problem: string(raw.problem),
    whyNow: string(raw.whyNow),
    trigger: trigger || 'explicit manual user action',
    outcome: {
      expectedResult: string(outcome.expectedResult),
      acceptanceCriteria: stringArray(outcome.acceptanceCriteria),
      nonGoals: stringArray(outcome.nonGoals),
    },
    capabilities,
    presentation: {
      tools: array(presentation.tools).filter(item => typeof item === 'string' || isObject(item)),
      defaultCard: safeEnum(presentation.defaultCard, ['derive', 'none', 'generic', 'terminal', 'diff', 'search', 'read', 'web'], 'derive', errors, 'presentation.defaultCard'),
      customClientCards: presentation.customClientCards === true,
      replayRequired: presentation.replayRequired !== false,
    },
    data: {
      read: stringArray(data.read),
      write: stringArray(data.write),
    },
    ui: {
      needed: ui.needed === true,
      surface: safeEnum(ui.surface, ['none', 'settings', 'dashboard', 'custom'], 'none', errors, 'ui.surface'),
      notes: string(ui.notes),
    },
    external: {
      network: safeEnum(external.network, ['none', 'loopback', 'lan', 'internet'], 'none', errors, 'external.network'),
      services: stringArray(external.services),
      processes: stringArray(external.processes),
      accounts: stringArray(external.accounts),
      credentials: safeEnum(external.credentials, ['none', 'user-provided', 'host-managed'], 'none', errors, 'external.credentials'),
      credentialHandling: string(external.credentialHandling) || 'none',
      devices: stringArray(external.devices),
    },
    profile: {
      target: string(profile.target),
      mutations: stringArray(profile.mutations),
      restart: profile.restart === true,
      restartOwner: string(profile.restartOwner) || 'none',
    },
    security: {
      sensitiveData: stringArray(security.sensitiveData),
      exposure: safeEnum(security.exposure, ['local', 'loopback', 'lan', 'internet'], 'local', errors, 'security.exposure'),
      authentication: safeEnum(security.authentication, ['none', 'token', 'pairing', 'oauth', 'mutual-tls', 'other'], 'none', errors, 'security.authentication'),
      encryption: safeEnum(security.encryption, ['none', 'local-only', 'tls', 'aead', 'tls+aead'], 'local-only', errors, 'security.encryption'),
      forbiddenActions: stringArray(security.forbiddenActions),
    },
    constraints: {
      mustUse: stringArray(constraints.mustUse),
      mustNot: stringArray(constraints.mustNot),
      privacy: stringArray(constraints.privacy),
      compatibility: stringArray(constraints.compatibility),
    },
    delivery: {
      workspace: string(delivery.workspace),
      repository: string(delivery.repository),
      license: string(delivery.license),
      releaseTarget,
      artifactType: safeEnum(delivery.artifactType, ['source', 'dsh-bundle', 'agent-skill', 'adapter'], 'dsh-bundle', errors, 'delivery.artifactType'),
      publicDownload: delivery.publicDownload === true,
      metadataAuthority: safeEnum(delivery.metadataAuthority, ['manifest', 'catalog', 'release-manifest'], 'release-manifest', errors, 'delivery.metadataAuthority'),
      sourceLinkRequired: delivery.sourceLinkRequired !== false,
      licenseNoticeRequired: delivery.licenseNoticeRequired !== false,
      marketplace: {
        target: marketplaceTarget,
        listingIntent: marketplaceListingIntent,
        repositoryUrl: string(marketplace.repositoryUrl) || string(delivery.repository),
        manifestPath: string(marketplace.manifestPath) || 'package.json',
        installPath: string(marketplace.installPath),
        immutableCommit: string(marketplace.immutableCommit),
        categories: stringArray(marketplace.categories),
      },
    },
    acceptance: {
      targetEvidence: safeEnum(acceptance.targetEvidence, ['E3', 'E4', 'E5'], 'E3', errors, 'acceptance.targetEvidence'),
      realProfileAllowed: acceptance.realProfileAllowed === true,
      externalAcceptanceAllowed: acceptance.externalAcceptanceAllowed === true,
    },
  }

  if (!hasOwn(raw, 'data')) assumptions.push('data boundary defaults to no reads and no writes')
  if (!hasOwn(raw, 'presentation')) assumptions.push('Tool cards default to semantic derivation, generic fallback, replay-safe presenters, and no custom Client card')
  if (!hasOwn(raw, 'ui')) assumptions.push('UI defaults to Host-only with no Browser Client')
  if (!hasOwn(raw, 'external')) assumptions.push('external dependencies default to none')
  if (!hasOwn(raw, 'profile')) assumptions.push('Profile mutation and restart default to none')
  if (!hasOwn(raw, 'security')) assumptions.push('security defaults to local-only, no credentials, and no real-state mutation')
  if (!hasOwn(raw, 'delivery')) assumptions.push('delivery defaults to source only with no publication')
  if (!hasOwn(delivery, 'marketplace')) assumptions.push('marketplace-ready package structure is generated for reusable DSH bundles, but no DSH STORE submission is authorized')
  if (!hasOwn(raw, 'acceptance')) assumptions.push('acceptance defaults to disposable E3 and no real Profile/device/public action')

  const generationBlockers = []
  if (!normalized.problem) generationBlockers.push('current user problem is missing')
  if (!normalized.outcome.expectedResult) generationBlockers.push('expected user outcome is missing')
  if (normalized.outcome.acceptanceCriteria.length === 0) generationBlockers.push('at least one observable acceptance criterion is required')
  if (errors.length > 0) generationBlockers.push('brief contains invalid enum or schema values')

  const profileMutation = normalized.profile.mutations.length > 0
  const restart = normalized.profile.restart
  const capabilityControl = hasCapabilityMode(capabilities, 'control')
  const capabilityWrite = hasCapabilityMode(capabilities, 'write')
  const externalSignals = normalized.external.network !== 'none'
    || normalized.external.services.length > 0
    || normalized.external.processes.length > 0
    || normalized.external.accounts.length > 0
    || normalized.external.credentials !== 'none'
    || normalized.external.devices.length > 0

  let riskClass = 'R0'
  if (profileMutation || restart || capabilityControl) riskClass = 'R3'
  else if (externalSignals) riskClass = 'R2'
  else if (normalized.data.write.length > 0 || capabilityWrite) riskClass = 'R1'

  const architectures = []
  const architectureReasons = []
  architectures.push('host-only')
  architectureReasons.push('Host-only is the minimum standard Bundle baseline')
  if (normalized.ui.needed || normalized.ui.surface !== 'none') {
    architectures.push('host-client')
    architectureReasons.push('Browser UI was requested')
  }
  if (normalized.ui.surface === 'custom') {
    architectures.push('optional-web')
    architectureReasons.push('Custom UI may require an optional Web route; verify the inspected DSH seam')
  }
  const searchableCapabilities = capabilityText(capabilities)
  const toolCardContractRequired = normalized.presentation.tools.length > 0
    || normalized.presentation.defaultCard !== 'derive'
    || normalized.presentation.customClientCards
    || /\btool\b|工具/.test(searchableCapabilities)
  if (toolCardContractRequired) {
    architectures.push('tool-card')
    architectureReasons.push('A model Tool or explicit presentation request requires the DSH Tool card contract')
  }
  if (/skill|adapter|适配|技能/.test(searchableCapabilities)) {
    architectures.push('skill-adapter')
    architectureReasons.push('Capability text indicates a Skill or external adapter')
  }
  if (/apiproxy|remote|mobile|远程|移动/.test(searchableCapabilities) || normalized.external.devices.length > 0) {
    architectures.push('api-proxy')
    architectureReasons.push('Capability/device text indicates a bounded remote bridge')
  }
  if (profileMutation || restart) {
    architectures.push('lifecycle-manager')
    architectureReasons.push('Profile mutation or restart requires an R3 lifecycle transaction')
  }

  const realOperationBlockers = []
  if (profileMutation && !normalized.profile.target) realOperationBlockers.push('exact target Profile is required before mutation')
  if ((profileMutation || restart) && normalized.acceptance.realProfileAllowed !== true) realOperationBlockers.push('real Profile operation is not authorized')
  if (restart && normalized.profile.restartOwner === 'none') realOperationBlockers.push('restart owner/supervisor or manual mechanism is unspecified')
  if (normalized.external.credentials !== 'none' && normalized.external.credentialHandling === 'none') realOperationBlockers.push('credential ownership/injection/redaction mechanism is unspecified')
  if (['lan', 'internet'].includes(normalized.security.exposure)) {
    if (normalized.security.authentication === 'none') realOperationBlockers.push('LAN/Internet authentication is unspecified')
    if (['none', 'local-only'].includes(normalized.security.encryption)) realOperationBlockers.push('LAN/Internet transport/application encryption is unspecified')
  }
  if (normalized.external.devices.length > 0 && normalized.acceptance.externalAcceptanceAllowed !== true) realOperationBlockers.push('real device acceptance is not authorized')
  if (['E4', 'E5'].includes(normalized.acceptance.targetEvidence) && normalized.acceptance.realProfileAllowed !== true) realOperationBlockers.push('real target/Profile acceptance is not authorized')
  if (normalized.acceptance.targetEvidence === 'E5' && normalized.acceptance.externalAcceptanceAllowed !== true) realOperationBlockers.push('external/device/account/public acceptance is not authorized')
  if (['github', 'marketplace', 'website'].includes(normalized.delivery.releaseTarget)) {
    if (!normalized.delivery.repository) realOperationBlockers.push('release repository is unspecified')
    if (!normalized.delivery.license) realOperationBlockers.push('release license is unspecified')
  }
  if (normalized.delivery.publicDownload) {
    if (!['github', 'marketplace', 'website'].includes(normalized.delivery.releaseTarget)) {
      realOperationBlockers.push('public download requires an authorized GitHub, marketplace, or website release target')
    }
    if (normalized.delivery.metadataAuthority !== 'release-manifest') {
      realOperationBlockers.push('public download requires a fixed release manifest as metadata authority')
    }
    if (!normalized.delivery.sourceLinkRequired) realOperationBlockers.push('public download must retain a source repository link')
    if (!normalized.delivery.licenseNoticeRequired) realOperationBlockers.push('public redistribution must preserve the license notice')
    if (!normalized.delivery.license || normalized.delivery.license.toUpperCase() === 'UNLICENSED') {
      realOperationBlockers.push('public redistribution license is missing or does not grant redistribution rights')
    }
  }
  const marketplaceRequested = normalized.delivery.marketplace.target === 'dsh-store'
    || normalized.delivery.marketplace.listingIntent !== 'none'
    || normalized.delivery.releaseTarget === 'marketplace'
  if (marketplaceRequested) {
    const listing = normalized.delivery.marketplace
    if (!['dsh-bundle', 'adapter'].includes(normalized.delivery.artifactType)) {
      realOperationBlockers.push('DSH STORE listing requires a standard DSH Bundle or a separately packaged DSH adapter')
    }
    if (!isCanonicalGithubRepository(listing.repositoryUrl)) {
      realOperationBlockers.push('DSH STORE listing requires a public canonical GitHub repository URL')
    }
    if (!isSafeRepositoryPath(listing.manifestPath)) {
      realOperationBlockers.push('DSH STORE manifestPath must stay inside the repository')
    }
    if (!isSafeRepositoryPath(listing.installPath, { allowEmpty: true })) {
      realOperationBlockers.push('DSH STORE installPath must stay inside the repository')
    }
    if (['approved', 'blocked', 'unlisted'].includes(listing.listingIntent) && !/^[0-9a-f]{40}$/.test(listing.immutableCommit)) {
      realOperationBlockers.push('DSH STORE catalog submission requires one immutable 40-character Git Commit')
    }
    if (['approved', 'blocked', 'unlisted'].includes(listing.listingIntent) && listing.categories.length === 0) {
      realOperationBlockers.push('DSH STORE catalog submission requires at least one current Registry category')
    }
    if (listing.listingIntent === 'approved' && (!normalized.delivery.license || ['UNLICENSED', 'UNKNOWN'].includes(normalized.delivery.license.toUpperCase()))) {
      realOperationBlockers.push('approved DSH STORE listing requires explicit usable license authority; keep it blocked while unresolved')
    }
  }

  const completeness = calculateCompleteness(raw, normalized)
  const generationReady = generationBlockers.length === 0
  let status = 'NEEDS_INPUT'
  if (generationReady && completeness.score >= 85) status = 'READY'
  else if (generationReady) status = 'READY_WITH_ASSUMPTIONS'

  const suggestedPackageName = slugify(normalized.plugin.name || normalized.plugin.summary || normalized.outcome.expectedResult)
  const suggestedEntryId = suggestedPackageName

  return {
    normalized,
    analysis: {
      source: '',
      completeness,
      status,
      generationReady,
      generationBlockers,
      schemaErrors: errors,
      assumptions,
      riskClass,
      architectureCandidates: [...new Set(architectures)],
      architectureReasons,
      toolCardContractRequired,
      suggestedPackageName,
      suggestedEntryId,
      marketplaceRequested,
      marketplacePreflightRequired: marketplaceRequested,
      realOperationBlocked: realOperationBlockers.length > 0,
      realOperationBlockers,
      nextAction: generationReady
        ? `Proceed through Phases 0-6 in ${normalized.mode} mode; keep real operations behind their separate blockers`
        : 'Ask only for the missing problem, outcome, acceptance, or invalid schema values',
    },
  }
}

function printHuman(result, sourcePath) {
  const { normalized, analysis } = result
  process.stdout.write(`DSH BRIEF ${sourcePath}\n`)
  process.stdout.write(`status: ${analysis.status}\n`)
  process.stdout.write(`completeness: ${analysis.completeness.score}/100\n`)
  process.stdout.write(`generation-ready: ${analysis.generationReady}\n`)
  process.stdout.write(`risk: ${analysis.riskClass}\n`)
  process.stdout.write(`architecture-candidates: ${analysis.architectureCandidates.join(', ')}\n`)
  process.stdout.write(`suggested-package: ${analysis.suggestedPackageName}\n`)
  process.stdout.write(`mode: ${normalized.mode}\n`)
  if (analysis.assumptions.length > 0) process.stdout.write(`assumptions:\n- ${analysis.assumptions.join('\n- ')}\n`)
  if (analysis.generationBlockers.length > 0) process.stdout.write(`generation-blockers:\n- ${analysis.generationBlockers.join('\n- ')}\n`)
  if (analysis.realOperationBlockers.length > 0) process.stdout.write(`real-operation-blockers:\n- ${analysis.realOperationBlockers.join('\n- ')}\n`)
  process.stdout.write(`next: ${analysis.nextAction}\n`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const sourcePath = resolve(args.path)
  const raw = JSON.parse(await readFile(sourcePath, 'utf8'))
  const result = normalize(raw)
  result.analysis.source = sourcePath
  if (args.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  else printHuman(result, sourcePath)
  if (!result.analysis.generationReady) process.exitCode = 1
}

main().catch(error => {
  process.stderr.write(`BRIEF_ERROR ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 2
})
