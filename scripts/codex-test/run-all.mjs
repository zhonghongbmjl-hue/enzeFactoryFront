#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { artifactRoot, ensureArtifactRoot, envSummary, writeJson, writeText } from './config.mjs'

const steps = [
  ['preflight', 'corepack', ['pnpm', 'test:codex:preflight']],
  ['typecheck', 'corepack', ['pnpm', 'typecheck']],
  ['lint', 'corepack', ['pnpm', 'lint']],
  ['format-check', 'corepack', ['pnpm', 'format:check']],
  ['unit', 'corepack', ['pnpm', 'test:unit', '--run']],
  ['ui-e2e', 'corepack', ['pnpm', 'test:codex:ui']],
  ['api-contract', 'corepack', ['pnpm', 'test:codex:api']],
  ['security-smoke', 'corepack', ['pnpm', 'test:codex:security']],
  ['perf-smoke', 'corepack', ['pnpm', 'test:codex:perf']],
]

ensureArtifactRoot()
const results = []

function runStep([name, command, args]) {
  return new Promise((resolve) => {
    const started = Date.now()
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        GARMENT_CODEX_ARTIFACT_DIR:
          process.env.GARMENT_CODEX_ARTIFACT_DIR || 'artifacts/codex-test',
        GARMENT_CODEX_TEST_RUN_ID: envSummary().runId,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
      process.stdout.write(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
      process.stderr.write(chunk)
    })
    child.on('close', (code) => {
      resolve({
        name,
        code,
        ok: code === 0,
        durationMs: Date.now() - started,
        stdoutTail: stdout.slice(-4000),
        stderrTail: stderr.slice(-4000),
      })
    })
  })
}

for (const step of steps) {
  console.log(`\n[codex-test] ${step[0]} starting`)
  const result = await runStep(step)
  results.push(result)
  console.log(`[codex-test] ${step[0]} ${result.ok ? 'passed' : `failed (${result.code})`}`)
}

const failed = results.filter((result) => !result.ok)
const report = {
  env: envSummary(),
  status: failed.length === 0 ? 'passed' : 'failed',
  results,
}
writeJson('summary.json', report)
writeText(
  'summary.md',
  [
    '# Codex Automated Test Summary',
    '',
    `- Status: ${report.status}`,
    `- Artifact root: ${artifactRoot}`,
    '',
    '| Step | Result | Duration |',
    '| --- | --- | ---: |',
    ...results.map(
      (result) =>
        `| ${result.name} | ${result.ok ? 'PASS' : `FAIL (${result.code})`} | ${Math.round(
          result.durationMs / 1000,
        )}s |`,
    ),
    '',
    ...(failed.length
      ? ['## Failed Steps', '', ...failed.map((result) => `- ${result.name}`), '']
      : []),
  ].join('\n'),
)

if (failed.length > 0) {
  console.error(`Codex automated test suite failed. Report: ${artifactRoot}`)
  process.exitCode = 1
} else {
  console.log(`Codex automated test suite passed. Report: ${artifactRoot}`)
}
