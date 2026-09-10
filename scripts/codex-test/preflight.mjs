#!/usr/bin/env node
import { apiBaseUrl, apiOrigin, envSummary, fetchJson, writeJson, writeText } from './config.mjs'

const checks = []

async function check(name, url, required = true) {
  const result = await fetchJson(url)
  checks.push({
    name,
    url,
    required,
    ok: result.ok,
    status: result.status,
    durationMs: result.durationMs,
    detail: result.ok ? 'ok' : result.text.slice(0, 300),
  })
  return result
}

const readiness = await check('backend readiness', `${apiOrigin}/actuator/health/readiness`)
await check('backend health', `${apiOrigin}/actuator/health`, false)
const openapi = await check('openapi document', `${apiOrigin}/v3/api-docs`)
const anonymousMe = await check('anonymous auth/me rejects', `${apiBaseUrl}/auth/me`, false)

const summary = {
  env: envSummary(),
  checks,
  observations: {
    readinessStatus: readiness.status,
    openapiPathCount: openapi.json?.paths ? Object.keys(openapi.json.paths).length : 0,
    authMeStatus: anonymousMe.status,
  },
}

writeJson('preflight.json', summary)
writeText(
  'preflight.md',
  [
    '# Codex Test Preflight',
    '',
    `- API origin: ${apiOrigin}`,
    `- API base: ${apiBaseUrl}`,
    `- Readiness: HTTP ${readiness.status}`,
    `- OpenAPI paths: ${summary.observations.openapiPathCount}`,
    `- Anonymous /auth/me: HTTP ${anonymousMe.status}`,
    '',
  ].join('\n'),
)

const failedRequired = checks.filter((item) => item.required && !item.ok)
if (failedRequired.length > 0) {
  console.error(`Preflight failed: ${failedRequired.map((item) => item.name).join(', ')}`)
  process.exitCode = 1
} else {
  console.log(`Preflight ok. Report: ${summary.env.artifactRoot}`)
}
