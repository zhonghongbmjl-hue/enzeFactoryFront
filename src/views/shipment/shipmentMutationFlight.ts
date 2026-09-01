import { readonly, shallowRef, type DeepReadonly, type Ref } from 'vue'
import type { IdempotencyAttempt } from '@/api/http'
import { registerTenantCache } from '@/stores/tenantCache'
import type {
  AfterSalesAction,
  AfterSalesTransitionInput,
  DecimalString,
  OpenExceptionCaseInput,
  ResolveExceptionCaseInput,
} from '@/types/shipment'

export type ShipmentMutationStatus = 'IN_FLIGHT' | 'OUTCOME_UNKNOWN' | 'CONFIRMED_PENDING_REFRESH'
export interface ShipmentMutationScope {
  tenantId: string
  userId: string
  authGeneration: number
}
export type ShipmentMutationRequest =
  | {
      name: 'pack'
      payload: {
        salesOrderId: string
        boxNo: string
        lines: ReadonlyArray<{ qualityInspectionId: string; quantity: DecimalString }>
      }
    }
  | {
      name: 'createShipment'
      payload: {
        salesOrderId: string
        lines: ReadonlyArray<{
          packingOrderId: string
          packingItemId: string
          quantity: DecimalString
        }>
      }
    }
  | {
      name: 'createAfterSales'
      payload: {
        originalShipmentId: string
        originalPackingOrderId: string
        originalPackingItemId: string
        quantity: DecimalString
        reasonCode: string
        customerFeedback: string
      }
    }
  | { name: 'approve'; shipmentId: string; expectedVersion: number }
  | { name: 'requestApproval'; shipmentId: string; expectedVersion: number }
  | {
      name: 'dispatch' | 'sign'
      shipmentId: string
      payload: {
        expectedVersion: number
        lines: ReadonlyArray<{ shipmentLineId: string; quantity: DecimalString }>
      }
    }
  | {
      name: 'afterSales'
      caseId: string
      action: AfterSalesAction
      payload: AfterSalesTransitionInput
    }
  | { name: 'openExceptionCase'; payload: OpenExceptionCaseInput }
  | {
      name: 'resolveExceptionCase'
      caseId: string
      payload: ResolveExceptionCaseInput
    }
  | {
      name: 'confirmManualDelivery'
      orderId: string
      payload: {
        expectedVersion: number
        reason: string
        evidenceManifestId: string
        confirmedDeliveredAt: string
      }
    }

export interface ShipmentMutationFlight {
  readonly scope: ShipmentMutationScope
  readonly sourceId: string
  readonly request: ShipmentMutationRequest
  readonly key: string
  readonly status: ShipmentMutationStatus
  readonly startedAt: string
  readonly attempt: IdempotencyAttempt
}

export const shipmentMutationStorageKey = 'garment.tenant.shipment-mutation-flight'
const SAFE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const KEY = /^[A-Za-z0-9-]{16,128}$/
const current = shallowRef<ShipmentMutationFlight | null>(null)
const owners: symbol[] = []
let scope: ShipmentMutationScope | null = null
let refreshOwner: symbol | null = null

function exact(value: Record<string, unknown>, required: string[]): boolean {
  const keys = Object.keys(value)
  return keys.length === required.length && required.every((key) => keys.includes(key))
}
function validScope(value: unknown): value is ShipmentMutationScope {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return (
    exact(item, ['tenantId', 'userId', 'authGeneration']) &&
    SAFE_ID.test(String(item.tenantId)) &&
    SAFE_ID.test(String(item.userId)) &&
    Number.isSafeInteger(item.authGeneration) &&
    Number(item.authGeneration) >= 1
  )
}
function sameScope(a: ShipmentMutationScope | null, b: ShipmentMutationScope | null): boolean {
  return Boolean(
    a &&
    b &&
    a.tenantId === b.tenantId &&
    a.userId === b.userId &&
    a.authGeneration === b.authGeneration,
  )
}
function validVersion(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0
}
function freezeRequest(request: ShipmentMutationRequest): ShipmentMutationRequest {
  if (request.name === 'pack') {
    const lines = Object.freeze(request.payload.lines.map((line) => Object.freeze({ ...line })))
    return Object.freeze({ ...request, payload: Object.freeze({ ...request.payload, lines }) })
  }
  if (request.name === 'createShipment') {
    const lines = Object.freeze(request.payload.lines.map((line) => Object.freeze({ ...line })))
    return Object.freeze({ ...request, payload: Object.freeze({ ...request.payload, lines }) })
  }
  if (request.name === 'dispatch' || request.name === 'sign') {
    const lines = Object.freeze(request.payload.lines.map((line) => Object.freeze({ ...line })))
    return Object.freeze({ ...request, payload: Object.freeze({ ...request.payload, lines }) })
  }
  if (request.name === 'afterSales') {
    return Object.freeze({ ...request, payload: Object.freeze({ ...request.payload }) })
  }
  if (request.name === 'createAfterSales') {
    return Object.freeze({ ...request, payload: Object.freeze({ ...request.payload }) })
  }
  if (request.name === 'openExceptionCase') {
    return Object.freeze({ ...request, payload: Object.freeze({ ...request.payload }) })
  }
  if (request.name === 'resolveExceptionCase') {
    return Object.freeze({ ...request, payload: Object.freeze({ ...request.payload }) })
  }
  if (request.name === 'confirmManualDelivery') {
    return Object.freeze({ ...request, payload: Object.freeze({ ...request.payload }) })
  }
  return Object.freeze({ ...request })
}
function validInstant(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))
    return false
  const epoch = Date.parse(value)
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === value
}
function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.codePointAt(0)
    return code !== undefined && (code <= 31 || code === 127)
  })
}
function validRequest(value: unknown): value is ShipmentMutationRequest {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  if (item.name === 'approve' || item.name === 'requestApproval') {
    return (
      exact(item, ['name', 'shipmentId', 'expectedVersion']) &&
      SAFE_ID.test(String(item.shipmentId)) &&
      validVersion(item.expectedVersion)
    )
  }
  if (item.name === 'pack' || item.name === 'createShipment') {
    if (!exact(item, ['name', 'payload']) || !item.payload || typeof item.payload !== 'object')
      return false
    const payload = item.payload as Record<string, unknown>
    if (
      !SAFE_ID.test(String(payload.salesOrderId)) ||
      !Array.isArray(payload.lines) ||
      payload.lines.length < 1 ||
      payload.lines.length > 100
    )
      return false
    if (
      item.name === 'pack' &&
      (!exact(payload, ['salesOrderId', 'boxNo', 'lines']) ||
        typeof payload.boxNo !== 'string' ||
        payload.boxNo.length < 1 ||
        payload.boxNo.length > 80 ||
        containsControlCharacter(payload.boxNo))
    )
      return false
    if (item.name === 'createShipment' && !exact(payload, ['salesOrderId', 'lines'])) return false
    return payload.lines.every((line) => {
      if (!line || typeof line !== 'object') return false
      const value = line as Record<string, unknown>
      if (item.name === 'pack')
        return (
          exact(value, ['qualityInspectionId', 'quantity']) &&
          SAFE_ID.test(String(value.qualityInspectionId)) &&
          /^(?:0|[1-9]\d{0,11})\.\d{6}$/.test(String(value.quantity)) &&
          value.quantity !== '0.000000'
        )
      return (
        exact(value, ['packingOrderId', 'packingItemId', 'quantity']) &&
        SAFE_ID.test(String(value.packingOrderId)) &&
        SAFE_ID.test(String(value.packingItemId)) &&
        /^(?:0|[1-9]\d{0,11})\.\d{6}$/.test(String(value.quantity)) &&
        value.quantity !== '0.000000'
      )
    })
  }
  if (item.name === 'createAfterSales') {
    if (!exact(item, ['name', 'payload']) || !item.payload || typeof item.payload !== 'object')
      return false
    const payload = item.payload as Record<string, unknown>
    return (
      exact(payload, [
        'originalShipmentId',
        'originalPackingOrderId',
        'originalPackingItemId',
        'quantity',
        'reasonCode',
        'customerFeedback',
      ]) &&
      SAFE_ID.test(String(payload.originalShipmentId)) &&
      SAFE_ID.test(String(payload.originalPackingOrderId)) &&
      SAFE_ID.test(String(payload.originalPackingItemId)) &&
      /^(?:0|[1-9]\d{0,11})\.\d{6}$/.test(String(payload.quantity)) &&
      payload.quantity !== '0.000000' &&
      typeof payload.reasonCode === 'string' &&
      /^[A-Z0-9][A-Z0-9._:-]{0,119}$/.test(payload.reasonCode) &&
      typeof payload.customerFeedback === 'string' &&
      payload.customerFeedback.trim().length > 0 &&
      payload.customerFeedback.length <= 500 &&
      !containsControlCharacter(payload.customerFeedback)
    )
  }
  if (item.name === 'dispatch' || item.name === 'sign') {
    if (
      !exact(item, ['name', 'shipmentId', 'payload']) ||
      !SAFE_ID.test(String(item.shipmentId)) ||
      !item.payload ||
      typeof item.payload !== 'object'
    )
      return false
    const payload = item.payload as Record<string, unknown>
    return (
      exact(payload, ['expectedVersion', 'lines']) &&
      validVersion(payload.expectedVersion) &&
      Array.isArray(payload.lines) &&
      payload.lines.length > 0 &&
      payload.lines.length <= 100 &&
      payload.lines.every((line) => {
        if (!line || typeof line !== 'object') return false
        const value = line as Record<string, unknown>
        return (
          exact(value, ['shipmentLineId', 'quantity']) &&
          SAFE_ID.test(String(value.shipmentLineId)) &&
          /^(?:0|[1-9]\d{0,11})\.\d{6}$/.test(String(value.quantity))
        )
      })
    )
  }
  if (item.name === 'openExceptionCase') {
    if (!exact(item, ['name', 'payload']) || !item.payload || typeof item.payload !== 'object')
      return false
    const payload = item.payload as Record<string, unknown>
    return (
      exact(payload, [
        'salesOrderId',
        'category',
        'referenceNo',
        'description',
        'affectedQuantity',
      ]) &&
      SAFE_ID.test(String(payload.salesOrderId)) &&
      [
        'ORDER_CHANGE',
        'REPLENISHMENT',
        'CUSTOMER_EXCHANGE',
        'CUSTOMER_CLAIM',
        'INVENTORY_ANOMALY',
      ].includes(String(payload.category)) &&
      typeof payload.referenceNo === 'string' &&
      payload.referenceNo.trim().length > 0 &&
      payload.referenceNo.length <= 80 &&
      !containsControlCharacter(payload.referenceNo) &&
      typeof payload.description === 'string' &&
      payload.description.trim().length > 0 &&
      payload.description.length <= 500 &&
      !containsControlCharacter(payload.description) &&
      /^(?:0|[1-9]\d{0,11})\.\d{6}$/.test(String(payload.affectedQuantity)) &&
      payload.affectedQuantity !== '0.000000'
    )
  }
  if (item.name === 'resolveExceptionCase') {
    if (
      !exact(item, ['name', 'caseId', 'payload']) ||
      !SAFE_ID.test(String(item.caseId)) ||
      !item.payload ||
      typeof item.payload !== 'object'
    )
      return false
    const payload = item.payload as Record<string, unknown>
    return (
      exact(payload, ['expectedVersion', 'resolutionCode', 'evidenceType', 'evidenceRef']) &&
      validVersion(payload.expectedVersion) &&
      typeof payload.resolutionCode === 'string' &&
      /^[A-Z][A-Z0-9_]{0,39}$/.test(payload.resolutionCode) &&
      [
        'ORDER_HISTORY',
        'SHIPMENT',
        'AFTER_SALES',
        'SETTLEMENT_REFERENCE',
        'INVENTORY_LEDGER',
      ].includes(String(payload.evidenceType)) &&
      typeof payload.evidenceRef === 'string' &&
      payload.evidenceRef.trim().length > 0 &&
      payload.evidenceRef.length <= 120 &&
      !containsControlCharacter(payload.evidenceRef)
    )
  }
  if (item.name === 'confirmManualDelivery') {
    if (
      !exact(item, ['name', 'orderId', 'payload']) ||
      !SAFE_ID.test(String(item.orderId)) ||
      !item.payload ||
      typeof item.payload !== 'object'
    )
      return false
    const payload = item.payload as Record<string, unknown>
    return (
      exact(payload, ['expectedVersion', 'reason', 'evidenceManifestId', 'confirmedDeliveredAt']) &&
      validVersion(payload.expectedVersion) &&
      typeof payload.reason === 'string' &&
      payload.reason.trim().length > 0 &&
      payload.reason.length <= 500 &&
      !containsControlCharacter(payload.reason) &&
      SAFE_ID.test(String(payload.evidenceManifestId)) &&
      validInstant(payload.confirmedDeliveredAt)
    )
  }
  if (
    item.name !== 'afterSales' ||
    !exact(item, ['name', 'caseId', 'action', 'payload']) ||
    !SAFE_ID.test(String(item.caseId)) ||
    ![
      'return-transit',
      'receive-quarantine',
      'rework/start',
      'rework/complete',
      'inspect',
      'pack',
      'shipment',
      'complete',
      'disposition/approve',
    ].includes(String(item.action)) ||
    !item.payload ||
    typeof item.payload !== 'object'
  )
    return false
  const payload = item.payload as Record<string, unknown>
  if (!validVersion(payload.expectedVersion)) return false
  if (item.action === 'return-transit')
    return (
      exact(payload, ['expectedVersion', 'carrier', 'trackingNo']) &&
      typeof payload.carrier === 'string' &&
      payload.carrier.trim().length > 0 &&
      payload.carrier.length <= 80 &&
      typeof payload.trackingNo === 'string' &&
      payload.trackingNo.trim().length > 0 &&
      payload.trackingNo.length <= 120
    )
  if (item.action === 'rework/start')
    return (
      exact(payload, ['expectedVersion', 'quantity', 'workNote']) &&
      /^(?:0|[1-9]\d{0,11})\.\d{6}$/.test(String(payload.quantity)) &&
      payload.quantity !== '0.000000' &&
      typeof payload.workNote === 'string' &&
      payload.workNote.trim().length > 0 &&
      payload.workNote.length <= 500
    )
  if (item.action === 'inspect')
    return (
      exact(payload, [
        'expectedVersion',
        'method',
        'submittedQuantity',
        'passedQuantity',
        'failedQuantity',
        'defectCode',
        'disposition',
      ]) &&
      ['SAMPLING', 'FULL'].includes(String(payload.method)) &&
      [payload.submittedQuantity, payload.passedQuantity, payload.failedQuantity].every((value) =>
        /^(?:0|[1-9]\d{0,11})\.\d{6}$/.test(String(value)),
      ) &&
      typeof payload.defectCode === 'string' &&
      payload.defectCode.length <= 120 &&
      typeof payload.disposition === 'string' &&
      payload.disposition.trim().length > 0 &&
      payload.disposition.length <= 500
    )
  if (item.action === 'pack')
    return (
      exact(payload, ['expectedVersion', 'boxNo']) &&
      typeof payload.boxNo === 'string' &&
      payload.boxNo.length > 0 &&
      payload.boxNo.length <= 80 &&
      !containsControlCharacter(payload.boxNo)
    )
  if (item.action === 'disposition/approve')
    return (
      exact(payload, [
        'expectedVersion',
        'dispositionId',
        'dispositionType',
        'dispositionOutcome',
        'dispositionQuantity',
        'additionalAttempts',
        'decisionReason',
        'evidenceRef',
      ]) &&
      typeof payload.dispositionId === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(payload.dispositionId) &&
      ['SCRAP', 'DOWNGRADE', 'CONCESSION', 'OTHER_AUTHORIZED', 'REWORK_OVERRIDE'].includes(
        String(payload.dispositionType),
      ) &&
      ['RELEASE', 'DISPOSE', 'REWORK'].includes(String(payload.dispositionOutcome)) &&
      /^(?:0|[1-9]\d{0,11})\.\d{6}$/.test(String(payload.dispositionQuantity)) &&
      Number.isInteger(payload.additionalAttempts) &&
      Number(payload.additionalAttempts) >= 0 &&
      Number(payload.additionalAttempts) <= 5 &&
      typeof payload.decisionReason === 'string' &&
      payload.decisionReason.trim().length > 0 &&
      payload.decisionReason.length <= 500 &&
      typeof payload.evidenceRef === 'string' &&
      payload.evidenceRef.trim().length > 0 &&
      payload.evidenceRef.length <= 120
    )
  return exact(payload, ['expectedVersion'])
}
function persisted(flight: ShipmentMutationFlight): string {
  return JSON.stringify({
    scope: flight.scope,
    sourceId: flight.sourceId,
    request: flight.request,
    key: flight.key,
    status: flight.status,
    startedAt: flight.startedAt,
  })
}
function remove(): void {
  try {
    sessionStorage.removeItem(shipmentMutationStorageKey)
  } catch {
    /* fail closed in memory */
  }
}
function reset(): void {
  current.value = null
  scope = null
  refreshOwner = null
  owners.splice(0)
  remove()
}
registerTenantCache(reset)
function save(flight: ShipmentMutationFlight, required: boolean): boolean {
  try {
    sessionStorage.setItem(shipmentMutationStorageKey, persisted(flight))
    return true
  } catch {
    return !required
  }
}
function top(): symbol | undefined {
  return owners.at(-1)
}
function represents(value: ShipmentMutationFlight): boolean {
  return (
    current.value?.key === value.key &&
    current.value.startedAt === value.startedAt &&
    sameScope(current.value.scope, value.scope)
  )
}

export function useShipmentMutationFlight(): {
  flight: DeepReadonly<Ref<ShipmentMutationFlight | null>>
  setScope(value: ShipmentMutationScope | null): void
  syncFromStorage(
    value: ShipmentMutationScope,
    attempt: IdempotencyAttempt,
  ): ShipmentMutationFlight | null
  begin(
    owner: symbol,
    input: {
      sourceId: string
      request: ShipmentMutationRequest
      key: string
      attempt: IdempotencyAttempt
    },
  ): ShipmentMutationFlight | null
  markOutcomeUnknown(value: ShipmentMutationFlight): void
  markConfirmed(value: ShipmentMutationFlight): void
  clear(value: ShipmentMutationFlight): boolean
  activate(owner: symbol): void
  deactivate(owner: symbol): void
  claimRefresh(owner: symbol, value: ShipmentMutationFlight): boolean
  releaseRefresh(owner: symbol): void
} {
  return {
    flight: readonly(current),
    setScope(value) {
      if (value && !validScope(value)) value = null
      if (sameScope(scope, value)) return
      const replacingScope = scope !== null || current.value !== null
      current.value = null
      refreshOwner = null
      if (!value || replacingScope) remove()
      scope = value ? Object.freeze({ ...value }) : null
    },
    syncFromStorage(value, attempt) {
      if (!validScope(value) || !sameScope(scope, value)) return null
      try {
        const raw = sessionStorage.getItem(shipmentMutationStorageKey)
        if (!raw) return null
        const item = JSON.parse(raw) as Record<string, unknown>
        if (
          !exact(item, ['scope', 'sourceId', 'request', 'key', 'status', 'startedAt']) ||
          !validScope(item.scope) ||
          !sameScope(item.scope, value) ||
          !SAFE_ID.test(String(item.sourceId)) ||
          !validRequest(item.request) ||
          !KEY.test(String(item.key)) ||
          !['IN_FLIGHT', 'OUTCOME_UNKNOWN', 'CONFIRMED_PENDING_REFRESH'].includes(
            String(item.status),
          ) ||
          !validInstant(item.startedAt)
        ) {
          remove()
          return null
        }
        const restored = Object.freeze({
          scope: Object.freeze({ ...value }),
          sourceId: String(item.sourceId),
          request: freezeRequest(item.request as ShipmentMutationRequest),
          key: String(item.key),
          status: item.status as ShipmentMutationStatus,
          startedAt: item.startedAt,
          attempt,
        })
        current.value = restored
        return restored
      } catch {
        remove()
        return null
      }
    },
    begin(owner, input) {
      if (
        top() !== owner ||
        current.value ||
        !scope ||
        !SAFE_ID.test(input.sourceId) ||
        !validRequest(input.request) ||
        !KEY.test(input.key)
      )
        return null
      const flight = Object.freeze({
        ...input,
        scope: Object.freeze({ ...scope }),
        request: freezeRequest(input.request),
        status: 'IN_FLIGHT' as const,
        startedAt: new Date().toISOString(),
      })
      if (!save(flight, true)) return null
      current.value = flight
      return flight
    },
    markOutcomeUnknown(value) {
      if (represents(value) && current.value?.status !== 'CONFIRMED_PENDING_REFRESH') {
        current.value = Object.freeze({ ...current.value!, status: 'OUTCOME_UNKNOWN' })
        save(current.value, false)
      }
    },
    markConfirmed(value) {
      if (represents(value)) {
        current.value = Object.freeze({ ...current.value!, status: 'CONFIRMED_PENDING_REFRESH' })
        save(current.value, false)
      }
    },
    clear(value) {
      if (!represents(value)) return false
      current.value = null
      remove()
      return true
    },
    activate(owner) {
      const index = owners.indexOf(owner)
      if (index >= 0) owners.splice(index, 1)
      owners.push(owner)
    },
    deactivate(owner) {
      const index = owners.indexOf(owner)
      if (index >= 0) owners.splice(index, 1)
      if (refreshOwner === owner) refreshOwner = null
    },
    claimRefresh(owner, value) {
      if (top() !== owner || current.value !== value || (refreshOwner && refreshOwner !== owner))
        return false
      refreshOwner = owner
      return true
    },
    releaseRefresh(owner) {
      if (refreshOwner === owner) refreshOwner = null
    },
  }
}
