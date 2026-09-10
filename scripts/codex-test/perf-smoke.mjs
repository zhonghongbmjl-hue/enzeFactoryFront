#!/usr/bin/env node
import { apiOrigin, envSummary, fetchText, writeJson, writeText } from './config.mjs'

const targetUrls = [`${apiOrigin}/actuator/health/readiness`, `${apiOrigin}/v3/api-docs`]
const samplesPerTarget = Number(process.env.GARMENT_CODEX_PERF_SAMPLES ?? '15')
const maxP95Ms = Number(process.env.GARMENT_CODEX_PERF_P95_MS ?? '1000')
const samples = []

for (const url of targetUrls) {
  for (let index = 0; index < samplesPerTarget; index += 1) {
    const result = await fetchText(url)
    samples.push({ url, ok: result.ok, status: result.status, durationMs: result.durationMs })
  }
}

const sorted = samples.map((sample) => sample.durationMs).sort((a, b) => a - b)
const p95 = sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0
const errorCount = samples.filter((sample) => !sample.ok).length
const report = {
  env: envSummary(),
  thresholds: { maxP95Ms },
  summary: {
    count: samples.length,
    errorCount,
    p95Ms: p95,
    maxMs: sorted.at(-1) ?? 0,
  },
  samples,
}

writeJson('perf-smoke.json', report)
writeText(
  'perf-smoke.md',
  [
    '# Codex Performance Smoke',
    '',
    `- Samples: ${report.summary.count}`,
    `- Error count: ${errorCount}`,
    `- P95: ${p95}ms`,
    `- Max: ${report.summary.maxMs}ms`,
    `- Threshold P95: ${maxP95Ms}ms`,
    '',
  ].join('\n'),
)

if (errorCount > 0 || p95 > maxP95Ms) {
  console.error(`Performance smoke failed: errors=${errorCount}, p95=${p95}ms`)
  process.exitCode = 1
} else {
  console.log(`Performance smoke ok: p95=${p95}ms`)
}
