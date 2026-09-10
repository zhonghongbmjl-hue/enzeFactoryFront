export const moduleRules = [
  ['auth', /\/auth\b|^auth$/i],
  ['dashboard-control-tower', /dashboard|control-tower/i],
  ['master-data', /master|customer|supplier|warehouse|factory|workshop|line/i],
  ['products-bom', /product|sku|bom|material/i],
  ['sales-orders', /sales-order|sales.?orders|orders/i],
  ['procurement', /procurement|purchase-plan|purchase-order|receipt|incoming-inspection|put-away/i],
  ['inventory', /inventory|stock|warehouse|material-issue|material-return/i],
  ['cutting-kitting', /cutting|kitting/i],
  ['planning', /planning|schedule/i],
  ['work-orders-production', /work-order|production|process-inspection|evidence/i],
  ['quality', /quality|inspection|defect|rework/i],
  ['shipments-after-sales', /shipment|after-sales|delivery/i],
  ['test-support', /test-support/i],
]

export function classifyOperation(path, operation) {
  const haystack = [
    path,
    operation.operationId,
    ...(operation.tags ?? []),
    operation.summary,
    operation.description,
  ]
    .filter(Boolean)
    .join(' ')
  const match = moduleRules.find(([, pattern]) => pattern.test(haystack))
  return match?.[0] ?? 'unclassified'
}

export function flattenOpenApi(openapi) {
  const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head'])
  return Object.entries(openapi.paths ?? {}).flatMap(([path, pathItem]) =>
    Object.entries(pathItem ?? {})
      .filter(([method]) => methods.has(method))
      .map(([method, operation]) => ({
        method: method.toUpperCase(),
        path,
        operationId: operation.operationId ?? '',
        tags: operation.tags ?? [],
        summary: operation.summary ?? '',
        module: classifyOperation(path, operation),
      })),
  )
}

export function summarizeOperations(operations) {
  const modules = {}
  const methods = {}
  for (const operation of operations) {
    modules[operation.module] = (modules[operation.module] ?? 0) + 1
    methods[operation.method] = (methods[operation.method] ?? 0) + 1
  }
  return {
    total: operations.length,
    methods,
    modules,
    unclassified: operations.filter((operation) => operation.module === 'unclassified'),
  }
}
