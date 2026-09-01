import { readonly, shallowRef, type DeepReadonly, type Ref } from 'vue'
import type { IdempotencyAttempt } from '@/api/http'
import { registerTenantCache } from '@/stores/tenantCache'
import type {
  InspectionInput,
  LegacyReworkBridgeInput,
  ReworkCompletionInput,
  TrimmingInput,
} from '@/types/quality'

export type QualityMutationName = 'trimming' | 'inspection' | 'rework' | 'legacyBridge'
export type QualityMutationStatus = 'IN_FLIGHT' | 'OUTCOME_UNKNOWN' | 'CONFIRMED_PENDING_REFRESH'
export interface QualityMutationScope {
  readonly tenantId: string
  readonly userId: string
  readonly authGeneration: number
}
export type QualityMutationRequest =
  | { readonly name: 'trimming'; readonly payload: Readonly<TrimmingInput> }
  | { readonly name: 'inspection'; readonly payload: Readonly<InspectionInput> }
  | {
      readonly name: 'rework'
      readonly reworkId: string
      readonly payload: Readonly<ReworkCompletionInput>
    }
  | {
      readonly name: 'legacyBridge'
      readonly reworkId: string
      readonly payload: Readonly<LegacyReworkBridgeInput>
    }

export interface QualityMutationFlight {
  readonly scope: QualityMutationScope
  readonly sourceSalesOrderId: string
  readonly sourceWorkOrderId: string
  readonly generation: number
  readonly request: QualityMutationRequest
  readonly key: string
  readonly status: QualityMutationStatus
  readonly startedAt: string
  readonly resultId?: string | undefined
  readonly attempt: IdempotencyAttempt
}

interface StoredQualityMutationFlight {
  scope: QualityMutationScope
  sourceSalesOrderId: string
  sourceWorkOrderId: string
  generation: number
  name: QualityMutationName
  payload: unknown
  reworkId?: string | undefined
  key: string
  status: QualityMutationStatus
  startedAt: string
}

export const qualityMutationStorageKey = 'garment.tenant.quality-mutation-flight'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DECIMAL_PATTERN = /^(?:0|[1-9]\d{0,11})\.\d{6}$/
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9-]{16,128}$/
const DEFECT_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._:-]{0,119}$/
const currentFlight = shallowRef<QualityMutationFlight | null>(null)
const owners: symbol[] = []
let boundScope: QualityMutationScope | null = null
let refreshOwner: symbol | null = null

function exactKeys(
  value: Record<string, unknown>,
  required: string[],
  optional: string[] = [],
): boolean {
  const keys = Object.keys(value)
  return (
    required.every((key) => keys.includes(key)) &&
    keys.every((key) => required.includes(key) || optional.includes(key))
  )
}
function validUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}
function validDecimal(value: unknown): value is string {
  return typeof value === 'string' && DECIMAL_PATTERN.test(value)
}
function decimalUnits(value: string): bigint {
  return BigInt(value.replace('.', ''))
}
function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0)
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127)
  })
}
function validText(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length <= maximum && !containsControlCharacter(value)
}
function validScope(value: unknown): value is QualityMutationScope {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    exactKeys(candidate, ['tenantId', 'userId', 'authGeneration']) &&
    validUuid(candidate.tenantId) &&
    validUuid(candidate.userId) &&
    Number.isSafeInteger(candidate.authGeneration) &&
    Number(candidate.authGeneration) >= 1
  )
}
function sameScope(left: QualityMutationScope | null, right: QualityMutationScope | null): boolean {
  return Boolean(
    left &&
    right &&
    left.tenantId === right.tenantId &&
    left.userId === right.userId &&
    left.authGeneration === right.authGeneration,
  )
}
function freezeScope(scope: QualityMutationScope): QualityMutationScope {
  return Object.freeze({ ...scope })
}
function freezeRequest(request: QualityMutationRequest): QualityMutationRequest {
  if (request.name === 'rework') {
    return Object.freeze({
      name: request.name,
      reworkId: request.reworkId,
      payload: Object.freeze({ ...request.payload }),
    })
  }
  if (request.name === 'legacyBridge') {
    return Object.freeze({
      name: request.name,
      reworkId: request.reworkId,
      payload: Object.freeze({ ...request.payload }),
    })
  }
  if (request.name === 'trimming') {
    return Object.freeze({ name: request.name, payload: Object.freeze({ ...request.payload }) })
  }
  return Object.freeze({ name: request.name, payload: Object.freeze({ ...request.payload }) })
}

function validRequest(value: unknown, sourceWorkOrderId: string): value is QualityMutationRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as Record<string, unknown>
  if (!request.payload || typeof request.payload !== 'object') return false
  const payload = request.payload as Record<string, unknown>
  if (request.name === 'trimming') {
    return (
      exactKeys(request, ['name', 'payload']) &&
      exactKeys(payload, ['workOrderId', 'quantity']) &&
      payload.workOrderId === sourceWorkOrderId &&
      validUuid(payload.workOrderId) &&
      validDecimal(payload.quantity) &&
      decimalUnits(payload.quantity) > 0n
    )
  }
  if (request.name === 'inspection') {
    if (
      !exactKeys(request, ['name', 'payload']) ||
      !exactKeys(
        payload,
        [
          'workOrderId',
          'inspectionMethod',
          'submittedQuantity',
          'passedQuantity',
          'failedQuantity',
          'disposition',
        ],
        ['defectCode'],
      ) ||
      payload.workOrderId !== sourceWorkOrderId ||
      !validUuid(payload.workOrderId) ||
      !['SAMPLING', 'FULL'].includes(String(payload.inspectionMethod)) ||
      !validDecimal(payload.submittedQuantity) ||
      !validDecimal(payload.passedQuantity) ||
      !validDecimal(payload.failedQuantity) ||
      !validText(payload.disposition, 500)
    )
      return false
    const submitted = decimalUnits(payload.submittedQuantity)
    const passed = decimalUnits(payload.passedQuantity)
    const failed = decimalUnits(payload.failedQuantity)
    if (submitted <= 0n || submitted !== passed + failed) return false
    return failed > 0n
      ? typeof payload.defectCode === 'string' && DEFECT_CODE_PATTERN.test(payload.defectCode)
      : payload.defectCode === undefined
  }
  if (request.name === 'rework') {
    return (
      exactKeys(request, ['name', 'reworkId', 'payload']) &&
      validUuid(request.reworkId) &&
      exactKeys(payload, ['passedQuantity', 'failedQuantity', 'disposition']) &&
      validDecimal(payload.passedQuantity) &&
      validDecimal(payload.failedQuantity) &&
      decimalUnits(payload.passedQuantity) + decimalUnits(payload.failedQuantity) > 0n &&
      validText(payload.disposition, 500)
    )
  }
  if (request.name === 'legacyBridge') {
    return (
      exactKeys(request, ['name', 'reworkId', 'payload']) &&
      validUuid(request.reworkId) &&
      exactKeys(payload, ['selectedMethod']) &&
      ['SAMPLING', 'FULL'].includes(String(payload.selectedMethod))
    )
  }
  return false
}
function validInstant(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))
    return false
  const epoch = Date.parse(value)
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === value
}
function storedFlight(flight: QualityMutationFlight): StoredQualityMutationFlight {
  return {
    scope: flight.scope,
    sourceSalesOrderId: flight.sourceSalesOrderId,
    sourceWorkOrderId: flight.sourceWorkOrderId,
    generation: flight.generation,
    name: flight.request.name,
    payload: flight.request.payload,
    ...((flight.request.name === 'rework' || flight.request.name === 'legacyBridge') && {
      reworkId: flight.request.reworkId,
    }),
    key: flight.key,
    status: flight.status,
    startedAt: flight.startedAt,
  }
}
function persist(flight: QualityMutationFlight, required: boolean): boolean {
  try {
    window.sessionStorage.setItem(qualityMutationStorageKey, JSON.stringify(storedFlight(flight)))
    return true
  } catch {
    return !required
  }
}
function removePersisted(): void {
  try {
    window.sessionStorage.removeItem(qualityMutationStorageKey)
    window.sessionStorage.removeItem('quality-workspace-confirmed-mutation')
  } catch {
    /* In-memory state remains fail-closed. */
  }
}
function resetSingleton(): void {
  currentFlight.value = null
  boundScope = null
  refreshOwner = null
  owners.splice(0)
  removePersisted()
}
registerTenantCache(resetSingleton)

function restore(
  scope: QualityMutationScope,
  attemptFor: (name: QualityMutationName) => IdempotencyAttempt,
): QualityMutationFlight | null {
  let raw: string | null
  try {
    raw = window.sessionStorage.getItem(qualityMutationStorageKey)
  } catch {
    return currentFlight.value
  }
  if (!raw) return null
  try {
    const stored = JSON.parse(raw) as Record<string, unknown>
    if (
      !exactKeys(
        stored,
        [
          'scope',
          'sourceSalesOrderId',
          'sourceWorkOrderId',
          'generation',
          'name',
          'payload',
          'key',
          'status',
          'startedAt',
        ],
        ['reworkId'],
      ) ||
      !validScope(stored.scope) ||
      !sameScope(stored.scope, scope) ||
      !validUuid(stored.sourceSalesOrderId) ||
      !validUuid(stored.sourceWorkOrderId) ||
      !Number.isSafeInteger(stored.generation) ||
      Number(stored.generation) < 0 ||
      !IDEMPOTENCY_KEY_PATTERN.test(String(stored.key ?? '')) ||
      !['IN_FLIGHT', 'OUTCOME_UNKNOWN', 'CONFIRMED_PENDING_REFRESH'].includes(
        String(stored.status ?? ''),
      ) ||
      !validInstant(stored.startedAt)
    ) {
      removePersisted()
      return null
    }
    const requestCandidate =
      stored.name === 'rework' || stored.name === 'legacyBridge'
        ? { name: stored.name, reworkId: stored.reworkId, payload: stored.payload }
        : { name: stored.name, payload: stored.payload }
    if (!validRequest(requestCandidate, stored.sourceWorkOrderId)) {
      removePersisted()
      return null
    }
    return Object.freeze({
      scope: freezeScope(stored.scope),
      sourceSalesOrderId: stored.sourceSalesOrderId,
      sourceWorkOrderId: stored.sourceWorkOrderId,
      generation: stored.generation as number,
      request: freezeRequest(requestCandidate),
      key: stored.key as string,
      status: stored.status as QualityMutationStatus,
      startedAt: stored.startedAt,
      attempt: attemptFor(requestCandidate.name),
    })
  } catch {
    removePersisted()
    return null
  }
}
function topOwner(): symbol | undefined {
  return owners.at(-1)
}
function representsCurrentFlight(candidate: QualityMutationFlight): boolean {
  const current = currentFlight.value
  return Boolean(
    current &&
    current.key === candidate.key &&
    current.startedAt === candidate.startedAt &&
    current.sourceSalesOrderId === candidate.sourceSalesOrderId &&
    current.sourceWorkOrderId === candidate.sourceWorkOrderId &&
    sameScope(current.scope, candidate.scope),
  )
}

export function useQualityMutationFlight(): {
  flight: DeepReadonly<Ref<QualityMutationFlight | null>>
  setScope: (scope: QualityMutationScope | null) => void
  syncFromStorage: (
    scope: QualityMutationScope,
    attemptFor: (name: QualityMutationName) => IdempotencyAttempt,
  ) => QualityMutationFlight | null
  begin: (
    owner: symbol,
    input: Omit<QualityMutationFlight, 'scope' | 'status' | 'startedAt'>,
  ) => QualityMutationFlight | null
  markOutcomeUnknown: (flight: QualityMutationFlight) => void
  markConfirmed: (flight: QualityMutationFlight, resultId?: string) => void
  clear: (flight: QualityMutationFlight) => boolean
  activate: (owner: symbol) => void
  deactivate: (owner: symbol) => void
  claimRefresh: (owner: symbol, flight: QualityMutationFlight) => boolean
  releaseRefresh: (owner: symbol) => void
} {
  return {
    flight: readonly(currentFlight),
    setScope(scope) {
      if (scope && !validScope(scope)) scope = null
      if (sameScope(boundScope, scope)) return
      const replacingBoundScope = boundScope !== null || currentFlight.value !== null
      currentFlight.value = null
      refreshOwner = null
      if (!scope || replacingBoundScope) removePersisted()
      else {
        try {
          window.sessionStorage.removeItem('quality-workspace-confirmed-mutation')
        } catch {
          /* best effort legacy cleanup */
        }
      }
      boundScope = scope ? freezeScope(scope) : null
    },
    syncFromStorage(scope, attemptFor) {
      if (!validScope(scope) || !sameScope(boundScope, scope)) return null
      const restored = restore(scope, attemptFor)
      currentFlight.value = restored
      return restored
    },
    begin(owner, input) {
      if (
        topOwner() !== owner ||
        currentFlight.value ||
        !boundScope ||
        !validRequest(input.request, input.sourceWorkOrderId) ||
        !validUuid(input.sourceSalesOrderId) ||
        !validUuid(input.sourceWorkOrderId) ||
        !Number.isSafeInteger(input.generation) ||
        input.generation < 0 ||
        !IDEMPOTENCY_KEY_PATTERN.test(input.key)
      )
        return null
      const flight = Object.freeze({
        ...input,
        scope: freezeScope(boundScope),
        request: freezeRequest(input.request),
        status: 'IN_FLIGHT' as const,
        startedAt: new Date().toISOString(),
      })
      if (!persist(flight, true)) return null
      currentFlight.value = flight
      return flight
    },
    markOutcomeUnknown(flight) {
      const current = currentFlight.value
      if (
        !current ||
        !representsCurrentFlight(flight) ||
        current.status === 'CONFIRMED_PENDING_REFRESH'
      )
        return
      const next = Object.freeze({ ...current, status: 'OUTCOME_UNKNOWN' as const })
      persist(next, false)
      currentFlight.value = next
    },
    markConfirmed(flight, resultId) {
      const current = currentFlight.value
      if (
        !current ||
        !representsCurrentFlight(flight) ||
        current.status === 'CONFIRMED_PENDING_REFRESH'
      )
        return
      const next = Object.freeze({
        ...current,
        status: 'CONFIRMED_PENDING_REFRESH' as const,
        resultId,
      })
      persist(next, false)
      currentFlight.value = next
    },
    clear(flight) {
      if (!representsCurrentFlight(flight)) return false
      removePersisted()
      currentFlight.value = null
      return true
    },
    activate(owner) {
      const existing = owners.indexOf(owner)
      if (existing >= 0) owners.splice(existing, 1)
      owners.push(owner)
    },
    deactivate(owner) {
      const existing = owners.indexOf(owner)
      if (existing < 0) return
      owners.splice(existing, 1)
      if (refreshOwner === owner) {
        refreshOwner = null
        if (currentFlight.value?.status === 'CONFIRMED_PENDING_REFRESH')
          currentFlight.value = Object.freeze({ ...currentFlight.value })
      }
    },
    claimRefresh(owner, flight) {
      if (currentFlight.value !== flight || topOwner() !== owner) return false
      if (refreshOwner && refreshOwner !== owner) return false
      refreshOwner = owner
      return true
    },
    releaseRefresh(owner) {
      if (refreshOwner === owner) refreshOwner = null
    },
  }
}
