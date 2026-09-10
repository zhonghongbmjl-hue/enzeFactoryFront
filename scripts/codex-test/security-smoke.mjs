#!/usr/bin/env node
import { apiBaseUrl, envSummary, fetchText, writeJson, writeText } from './config.mjs'

const endpoints = [
  '/auth/me',
  '/sales-orders',
  '/inventory/availability',
  '/work-orders',
  '/shipments',
]

const results = []
for (const path of endpoints) {
  const result = await fetchText(`${apiBaseUrl}${path}`)
  const protectedStatus = [401, 403, 404, 405].includes(result.status)
  results.push({
    path,
    status: result.status,
    ok: protectedStatus,
    durationMs: result.durationMs,
    headers: {
      'cache-control': result.headers['cache-control'],
      'x-content-type-options': result.headers['x-content-type-options'],
      'x-frame-options': result.headers['x-frame-options'],
    },
    bodySample: result.text.slice(0, 200),
  })
}

const report = { env: envSummary(), results }
writeJson('security-smoke.json', report)
writeText(
  'security-smoke.md',
  [
    '# Codex Security Smoke',
    '',
    ...results.map(
      (item) =>
        `- ${item.ok ? 'PASS' : 'FAIL'} ${item.path}: HTTP ${item.status}, cache=${item.headers['cache-control'] ?? 'n/a'}, frame=${item.headers['x-frame-options'] ?? 'n/a'}`,
    ),
    '',
  ].join('\n'),
)

const failures = results.filter((item) => !item.ok)
if (failures.length > 0) {
  console.error(`Security smoke failed: ${failures.map((item) => item.path).join(', ')}`)
  process.exitCode = 1
} else {
  console.log(`Security smoke checked ${results.length} anonymous endpoints.`)
}
