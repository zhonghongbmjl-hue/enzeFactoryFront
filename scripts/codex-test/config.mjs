import fs from 'node:fs'
import path from 'node:path'

export const projectRoot = process.cwd()

export const apiOrigin = stripTrailingSlash(
  process.env.GARMENT_E2E_BACKEND_ORIGIN ||
    process.env.GARMENT_E2E_EXTERNAL_BACKEND_ORIGIN ||
    process.env.GARMENT_E2E_EXTERNAL_BACKEND_URL?.replace(/\/api\/v1\/?$/, '') ||
    process.env.VITE_DEV_API_TARGET ||
    'http://127.0.0.1:18080',
)

export const apiBaseUrl = stripTrailingSlash(
  process.env.GARMENT_E2E_API_BASE_URL ||
    process.env.GARMENT_E2E_EXTERNAL_BACKEND_URL ||
    `${apiOrigin}/api/v1`,
)

export const uiBaseUrl = stripTrailingSlash(
  process.env.GARMENT_E2E_UI_BASE_URL ||
    process.env.GARMENT_E2E_EXTERNAL_BASE_URL ||
    'http://localhost:5173',
)

export const runId =
  process.env.GARMENT_CODEX_TEST_RUN_ID ||
  new Date()
    .toISOString()
    .replaceAll(/[-:.TZ]/g, '')
    .slice(0, 14)

export const artifactRoot = path.resolve(
  projectRoot,
  process.env.GARMENT_CODEX_ARTIFACT_DIR || 'artifacts/codex-test',
  runId,
)

export function ensureArtifactRoot() {
  fs.mkdirSync(artifactRoot, { recursive: true })
}

export function artifactPath(...segments) {
  return path.join(artifactRoot, ...segments)
}

export function stripTrailingSlash(value) {
  return value.replace(/\/+$/, '')
}

export async function fetchText(url, options = {}) {
  const started = performance.now()
  let response
  try {
    response = await fetch(url, options)
  } catch (error) {
    return {
      ok: false,
      url,
      status: 0,
      durationMs: Math.round(performance.now() - started),
      text: String(error?.message ?? error),
      headers: {},
    }
  }
  const text = await response.text()
  return {
    ok: response.ok,
    url,
    status: response.status,
    durationMs: Math.round(performance.now() - started),
    text,
    headers: Object.fromEntries(response.headers.entries()),
  }
}

export async function fetchJson(url, options = {}) {
  const result = await fetchText(url, options)
  if (!result.ok) return { ...result, json: null }
  try {
    return { ...result, json: JSON.parse(result.text) }
  } catch (error) {
    return { ...result, ok: false, json: null, parseError: String(error?.message ?? error) }
  }
}

export function writeJson(name, value) {
  ensureArtifactRoot()
  fs.writeFileSync(artifactPath(name), `${JSON.stringify(value, null, 2)}\n`)
}

export function writeText(name, value) {
  ensureArtifactRoot()
  fs.writeFileSync(artifactPath(name), value)
}

export function envSummary() {
  return {
    apiOrigin,
    apiBaseUrl,
    uiBaseUrl,
    runId,
    artifactRoot,
    node: process.version,
  }
}
