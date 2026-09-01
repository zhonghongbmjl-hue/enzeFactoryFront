import { beforeEach, describe, expect, it } from 'vitest'
import { createIdempotencyAttempt } from '@/api/http'
import { clearTenantCaches } from '@/stores/tenantCache'
import {
  qualityMutationStorageKey,
  useQualityMutationFlight,
  type QualityMutationScope,
} from './qualityMutationFlight'

const SALES_ORDER_ID = '1135b20e-6cd4-4aac-84eb-f135401e7e12'
const WORK_ORDER_ID = '26b8e39a-f360-4d19-a666-ad51236d07f3'
const REWORK_ID = '34b9f490-0471-4d93-b1f2-78c0619b18fb'
const scope: QualityMutationScope = {
  tenantId: '7e179539-02b7-4190-bcad-83edcbb66a81',
  userId: 'a8e88635-c2db-48ce-a384-fec40cd75cb4',
  authGeneration: 7,
}

function attemptFor() {
  return createIdempotencyAttempt()
}

function validStoredFlight(overrides: Record<string, unknown> = {}) {
  return {
    scope,
    sourceSalesOrderId: SALES_ORDER_ID,
    sourceWorkOrderId: WORK_ORDER_ID,
    generation: 1,
    name: 'trimming',
    payload: { workOrderId: WORK_ORDER_ID, quantity: '2.000000' },
    key: '64f39c04-cc56-43d0-889f-a00fbbe627aa',
    status: 'IN_FLIGHT',
    startedAt: '2026-08-25T00:00:00.000Z',
    ...overrides,
  }
}

describe('quality mutation flight security boundary', () => {
  beforeEach(() => {
    clearTenantCaches()
    sessionStorage.clear()
  })

  it.each([
    ['tenant', { ...scope, tenantId: '9f20640a-13c8-41ba-918c-58ab75f7b913' }],
    ['user', { ...scope, userId: 'bea9e532-305d-49a4-91ed-918711da4455' }],
    ['auth generation', { ...scope, authGeneration: 8 }],
  ])('does not restore a flight across a changed %s scope', (_label, storedScope) => {
    sessionStorage.setItem(
      qualityMutationStorageKey,
      JSON.stringify(validStoredFlight({ scope: storedScope })),
    )
    const flightStore = useQualityMutationFlight()
    flightStore.setScope(scope)

    expect(flightStore.syncFromStorage(scope, attemptFor)).toBeNull()
    expect(sessionStorage.getItem(qualityMutationStorageKey)).toBeNull()
  })

  it.each([
    ['top-level extra field', { injected: 'secret' }],
    [
      'trimming payload extra field',
      { payload: { workOrderId: WORK_ORDER_ID, quantity: '2.000000', disposition: 'secret' } },
    ],
    ['invalid source UUID', { sourceSalesOrderId: 'sales-1' }],
    ['invalid decimal', { payload: { workOrderId: WORK_ORDER_ID, quantity: '2' } }],
    ['invalid key', { key: 'bad key' }],
    ['oversized result id', { status: 'CONFIRMED_PENDING_REFRESH', resultId: 'x'.repeat(129) }],
    [
      'inspection enum',
      {
        name: 'inspection',
        payload: {
          workOrderId: WORK_ORDER_ID,
          inspectionMethod: 'LEGACY_UNSPECIFIED',
          submittedQuantity: '2.000000',
          passedQuantity: '2.000000',
          failedQuantity: '0.000000',
          disposition: '',
        },
      },
    ],
    [
      'inspection quantity conservation',
      {
        name: 'inspection',
        payload: {
          workOrderId: WORK_ORDER_ID,
          inspectionMethod: 'FULL',
          submittedQuantity: '2.000000',
          passedQuantity: '1.000000',
          failedQuantity: '0.000000',
          disposition: '',
        },
      },
    ],
    [
      'inspection oversized text',
      {
        name: 'inspection',
        payload: {
          workOrderId: WORK_ORDER_ID,
          inspectionMethod: 'FULL',
          submittedQuantity: '2.000000',
          passedQuantity: '2.000000',
          failedQuantity: '0.000000',
          disposition: 'x'.repeat(501),
        },
      },
    ],
    [
      'rework extra field',
      {
        name: 'rework',
        reworkId: REWORK_ID,
        payload: {
          passedQuantity: '2.000000',
          failedQuantity: '0.000000',
          disposition: '',
          defectCode: 'SECRET',
        },
      },
    ],
    [
      'rework invalid UUID',
      {
        name: 'rework',
        reworkId: 'rework-1',
        payload: { passedQuantity: '2.000000', failedQuantity: '0.000000', disposition: '' },
      },
    ],
    [
      'bridge invalid enum',
      { name: 'legacyBridge', reworkId: REWORK_ID, payload: { selectedMethod: 'LEGACY' } },
    ],
    [
      'bridge smuggled text',
      {
        name: 'legacyBridge',
        reworkId: REWORK_ID,
        payload: { selectedMethod: 'FULL', disposition: '不得持久化的敏感文本' },
      },
    ],
  ])('rejects and destroys %s from session storage', (_label, mutation) => {
    sessionStorage.setItem(qualityMutationStorageKey, JSON.stringify(validStoredFlight(mutation)))
    const flightStore = useQualityMutationFlight()
    flightStore.setScope(scope)

    expect(flightStore.syncFromStorage(scope, attemptFor)).toBeNull()
    expect(sessionStorage.getItem(qualityMutationStorageKey)).toBeNull()
  })

  it('clears both the singleton and garment tenant storage on an auth boundary', () => {
    const store = useQualityMutationFlight()
    const owner = Symbol('owner')
    store.setScope(scope)
    store.activate(owner)
    const attempt = createIdempotencyAttempt()
    expect(
      store.begin(owner, {
        sourceSalesOrderId: SALES_ORDER_ID,
        sourceWorkOrderId: WORK_ORDER_ID,
        generation: 1,
        request: {
          name: 'trimming',
          payload: { workOrderId: WORK_ORDER_ID, quantity: '2.000000' },
        },
        attempt,
        key: attempt.keyFor({ workOrderId: WORK_ORDER_ID, quantity: '2.000000' }),
      }),
    ).not.toBeNull()

    clearTenantCaches()

    expect(store.flight.value).toBeNull()
    expect(sessionStorage.getItem(qualityMutationStorageKey)).toBeNull()
  })

  it.each([
    ['tenant', { ...scope, tenantId: '9f20640a-13c8-41ba-918c-58ab75f7b913' }],
    ['user', { ...scope, userId: 'bea9e532-305d-49a4-91ed-918711da4455' }],
    ['auth generation', { ...scope, authGeneration: 8 }],
  ])(
    'synchronously clears memory and storage when the active %s scope changes',
    (_label, nextScope) => {
      const store = useQualityMutationFlight()
      const owner = Symbol('owner')
      store.setScope(scope)
      store.activate(owner)
      const attempt = createIdempotencyAttempt()
      expect(
        store.begin(owner, {
          sourceSalesOrderId: SALES_ORDER_ID,
          sourceWorkOrderId: WORK_ORDER_ID,
          generation: 1,
          request: {
            name: 'trimming',
            payload: { workOrderId: WORK_ORDER_ID, quantity: '2.000000' },
          },
          attempt,
          key: attempt.keyFor('scope-change'),
        }),
      ).not.toBeNull()

      store.setScope(nextScope)

      expect(store.flight.value).toBeNull()
      expect(sessionStorage.getItem(qualityMutationStorageKey)).toBeNull()
    },
  )

  it('persists only the scoped retry request and omits response-only result data', () => {
    const store = useQualityMutationFlight()
    const owner = Symbol('owner')
    store.setScope(scope)
    store.activate(owner)
    const attempt = createIdempotencyAttempt()
    const flight = store.begin(owner, {
      sourceSalesOrderId: SALES_ORDER_ID,
      sourceWorkOrderId: WORK_ORDER_ID,
      generation: 1,
      request: {
        name: 'legacyBridge',
        reworkId: REWORK_ID,
        payload: { selectedMethod: 'FULL' },
      },
      attempt,
      key: attempt.keyFor({ reworkId: REWORK_ID, selectedMethod: 'FULL' }),
    })!
    store.markConfirmed(flight, 'e54d8c6b-fb58-4f6e-bfe2-f39c4c7f6a28')

    const persisted = JSON.parse(sessionStorage.getItem(qualityMutationStorageKey) ?? '{}')
    expect(persisted).toEqual(
      expect.objectContaining({
        scope,
        name: 'legacyBridge',
        reworkId: REWORK_ID,
        payload: { selectedMethod: 'FULL' },
      }),
    )
    expect(persisted).not.toHaveProperty('resultId')
    expect(JSON.stringify(persisted)).not.toContain('disposition')
  })
})

describe('quality mutation flight owner stack', () => {
  beforeEach(() => {
    clearTenantCaches()
    sessionStorage.clear()
  })

  it('falls back to the latest still-active owner and treats activate/deactivate idempotently', () => {
    const store = useQualityMutationFlight()
    const ownerA = Symbol('A')
    const ownerB = Symbol('B')
    store.setScope(scope)
    store.activate(ownerA)
    store.activate(ownerA)
    store.activate(ownerB)
    store.deactivate(ownerB)
    store.deactivate(ownerB)

    const attempt = createIdempotencyAttempt()
    expect(
      store.begin(ownerA, {
        sourceSalesOrderId: SALES_ORDER_ID,
        sourceWorkOrderId: WORK_ORDER_ID,
        generation: 1,
        request: {
          name: 'trimming',
          payload: { workOrderId: WORK_ORDER_ID, quantity: '1.000000' },
        },
        attempt,
        key: attempt.keyFor('A'),
      }),
    ).not.toBeNull()
  })

  it('rejects begin and refresh claims from missing or non-top owners', () => {
    const store = useQualityMutationFlight()
    const ownerA = Symbol('A')
    const ownerB = Symbol('B')
    store.setScope(scope)
    store.activate(ownerA)
    store.activate(ownerB)
    const attempt = createIdempotencyAttempt()
    const input = {
      sourceSalesOrderId: SALES_ORDER_ID,
      sourceWorkOrderId: WORK_ORDER_ID,
      generation: 1,
      request: {
        name: 'trimming' as const,
        payload: { workOrderId: WORK_ORDER_ID, quantity: '1.000000' },
      },
      attempt,
      key: attempt.keyFor('owner'),
    }

    expect(store.begin(ownerA, input)).toBeNull()
    store.deactivate(ownerB)
    const flight = store.begin(ownerA, input)
    expect(flight).not.toBeNull()
    expect(store.claimRefresh(ownerB, flight!)).toBe(false)
    store.deactivate(ownerA)
    expect(store.claimRefresh(ownerA, flight!)).toBe(false)
  })

  it('releases a departed refresh owner and lets the prior active owner take over', () => {
    const store = useQualityMutationFlight()
    const ownerA = Symbol('A')
    const ownerB = Symbol('B')
    store.setScope(scope)
    store.activate(ownerA)
    store.activate(ownerB)
    const attempt = createIdempotencyAttempt()
    const started = store.begin(ownerB, {
      sourceSalesOrderId: SALES_ORDER_ID,
      sourceWorkOrderId: WORK_ORDER_ID,
      generation: 1,
      request: {
        name: 'trimming',
        payload: { workOrderId: WORK_ORDER_ID, quantity: '1.000000' },
      },
      attempt,
      key: attempt.keyFor('refresh-owner'),
    })!
    store.markConfirmed(started)
    const confirmed = store.flight.value!
    expect(store.claimRefresh(ownerB, confirmed)).toBe(true)

    store.deactivate(ownerB)

    expect(store.claimRefresh(ownerA, store.flight.value!)).toBe(true)
  })
})
