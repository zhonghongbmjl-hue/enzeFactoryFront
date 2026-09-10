#!/usr/bin/env node
import { apiOrigin, envSummary, fetchJson, writeJson, writeText } from './config.mjs'
import { flattenOpenApi, summarizeOperations } from './openapi-classifier.mjs'

const openapi = await fetchJson(`${apiOrigin}/v3/api-docs`)
if (!openapi.ok || !openapi.json) {
  console.error(`Cannot load OpenAPI: HTTP ${openapi.status} ${openapi.text.slice(0, 300)}`)
  process.exit(1)
}

const operations = flattenOpenApi(openapi.json)
const summary = summarizeOperations(operations)
const missingSecurity = operations.filter((operation) => {
  const method = operation.method.toLowerCase()
  const operationDoc = openapi.json.paths?.[operation.path]?.[method] ?? {}
  return !operation.path.includes('/auth/login') && !operationDoc.security && !openapi.json.security
})

const report = {
  env: envSummary(),
  openapi: {
    title: openapi.json.info?.title,
    version: openapi.json.info?.version,
    pathCount: Object.keys(openapi.json.paths ?? {}).length,
    schemaCount: Object.keys(openapi.json.components?.schemas ?? {}).length,
  },
  summary,
  missingSecurity,
  operations,
}

writeJson('api-contract.json', report)
writeText(
  'api-contract.md',
  [
    '# Codex API Contract Coverage',
    '',
    `- Operations: ${summary.total}`,
    `- Paths: ${report.openapi.pathCount}`,
    `- Schemas: ${report.openapi.schemaCount}`,
    `- Modules: ${Object.entries(summary.modules)
      .map(([name, count]) => `${name}=${count}`)
      .join(', ')}`,
    `- Unclassified operations: ${summary.unclassified.length}`,
    `- Operations without OpenAPI security declaration: ${missingSecurity.length}`,
    '',
    '## Unclassified',
    '',
    ...(summary.unclassified.length
      ? summary.unclassified.map((item) => `- ${item.method} ${item.path} ${item.operationId}`)
      : ['- None']),
    '',
  ].join('\n'),
)

if (summary.unclassified.length > 0) {
  console.error(`API contract has ${summary.unclassified.length} unclassified operations.`)
  process.exitCode = 1
} else {
  console.log(`API contract classified ${summary.total} operations.`)
}
