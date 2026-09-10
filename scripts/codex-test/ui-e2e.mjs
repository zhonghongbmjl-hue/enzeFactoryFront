#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { apiBaseUrl, fetchText, uiBaseUrl } from './config.mjs'

const skipUi = process.env.GARMENT_CODEX_SKIP_UI === '1'
if (skipUi) {
  console.log('UI E2E skipped because GARMENT_CODEX_SKIP_UI=1.')
  process.exit(0)
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: { ...process.env, ...options.env },
      stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    })
    let stdout = ''
    let stderr = ''
    if (options.capture) {
      child.stdout.on('data', (chunk) => {
        stdout += chunk
      })
      child.stderr.on('data', (chunk) => {
        stderr += chunk
      })
    }
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}

async function waitFor(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const result = await fetchText(url)
    if (result.ok) return
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(`Timed out waiting for ${url}`)
}

console.log('[codex-test] building UI for e2e mode')
const build = await run('corepack', ['pnpm', 'exec', 'vite', 'build', '--mode', 'e2e'])
if (build.code !== 0) process.exit(build.code ?? 1)

console.log(`[codex-test] starting preview at ${uiBaseUrl}`)
const uiUrl = new URL(uiBaseUrl)
const preview = spawn(
  'corepack',
  [
    'pnpm',
    'exec',
    'vite',
    'preview',
    '--mode',
    'e2e',
    '--host',
    uiUrl.hostname,
    '--port',
    uiUrl.port || '5173',
  ],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      VITE_DEV_API_TARGET: apiBaseUrl.replace(/\/api\/v1\/?$/, ''),
    },
    stdio: 'inherit',
  },
)

let exitCode = 1
try {
  await waitFor(uiBaseUrl, 60_000)
  console.log(`[codex-test] running Playwright against UI=${uiBaseUrl} API=${apiBaseUrl}`)
  const e2e = await run('corepack', ['pnpm', 'test:e2e'], {
    env: {
      GARMENT_E2E_EXTERNAL_BASE_URL: uiBaseUrl,
      GARMENT_E2E_EXTERNAL_BACKEND_URL: apiBaseUrl,
    },
  })
  exitCode = e2e.code ?? 1
} catch (error) {
  console.error(error?.message ?? error)
} finally {
  preview.kill('SIGTERM')
}

process.exit(exitCode)
