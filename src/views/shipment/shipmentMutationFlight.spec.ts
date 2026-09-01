import { beforeEach, describe, expect, it } from 'vitest'
import { createIdempotencyAttempt } from '@/api/http'
import { clearTenantCaches } from '@/stores/tenantCache'
import { shipmentMutationStorageKey, useShipmentMutationFlight } from './shipmentMutationFlight'

const ORDER = '11111111-1111-4111-8111-111111111111'
const SHIPMENT = '22222222-2222-4222-8222-222222222222'
const scope = {
  tenantId: '55555555-5555-4555-8555-555555555555',
  userId: '66666666-6666-4666-8666-666666666666',
  authGeneration: 2,
}
const request = { name: 'approve' as const, shipmentId: SHIPMENT, expectedVersion: 4 }

describe('发运全局 mutation flight', () => {
  beforeEach(() => {
    clearTenantCaches()
    sessionStorage.clear()
  })

  it('登出、租户、用户和认证代次变化会清除内存与持久化请求', () => {
    const store = useShipmentMutationFlight()
    const owner = Symbol('owner')
    store.activate(owner)
    store.setScope(scope)
    expect(
      store.begin(owner, {
        sourceId: ORDER,
        request,
        key: 'shipment-action-0001',
        attempt: createIdempotencyAttempt(),
      }),
    ).not.toBeNull()
    expect(sessionStorage.getItem(shipmentMutationStorageKey)).not.toBeNull()

    store.setScope({ ...scope, userId: '77777777-7777-4777-8777-777777777777' })
    expect(store.flight.value).toBeNull()
    expect(sessionStorage.getItem(shipmentMutationStorageKey)).toBeNull()
    store.activate(owner)
    expect(
      store.begin(owner, {
        sourceId: ORDER,
        request,
        key: 'shipment-action-0002',
        attempt: createIdempotencyAttempt(),
      }),
    ).not.toBeNull()
    store.setScope({ ...scope, authGeneration: 3 })
    expect(store.flight.value).toBeNull()
    store.setScope(null)
    expect(store.flight.value).toBeNull()
  })

  it('仅栈顶实例可提交且卸载后由上一实例接管刷新', () => {
    const store = useShipmentMutationFlight()
    const first = Symbol('first')
    const second = Symbol('second')
    store.setScope(scope)
    store.activate(first)
    store.activate(second)
    expect(
      store.begin(first, {
        sourceId: ORDER,
        request,
        key: 'shipment-action-0001',
        attempt: createIdempotencyAttempt(),
      }),
    ).toBeNull()
    const flight = store.begin(second, {
      sourceId: ORDER,
      request,
      key: 'shipment-action-0001',
      attempt: createIdempotencyAttempt(),
    })!
    store.markConfirmed(flight)
    expect(store.claimRefresh(first, store.flight.value!)).toBe(false)
    store.deactivate(second)
    expect(store.claimRefresh(first, store.flight.value!)).toBe(true)
  })

  it('只恢复同一scope且严格白名单的记录', () => {
    const store = useShipmentMutationFlight()
    const owner = Symbol('owner')
    store.setScope(scope)
    store.activate(owner)
    store.begin(owner, {
      sourceId: ORDER,
      request,
      key: 'shipment-action-0001',
      attempt: createIdempotencyAttempt(),
    })
    const raw = JSON.parse(sessionStorage.getItem(shipmentMutationStorageKey)!)
    raw.actor = 'should-not-persist'
    sessionStorage.setItem(shipmentMutationStorageKey, JSON.stringify(raw))
    expect(store.syncFromStorage(scope, createIdempotencyAttempt())).toBeNull()
    expect(sessionStorage.getItem(shipmentMutationStorageKey)).toBeNull()
  })

  it('结果未知时持久化原key和原请求供同scope恢复重试', () => {
    const store = useShipmentMutationFlight()
    const owner = Symbol('owner')
    store.setScope(scope)
    store.activate(owner)
    const created = store.begin(owner, {
      sourceId: ORDER,
      request,
      key: 'shipment-action-0003',
      attempt: createIdempotencyAttempt(),
    })!
    store.markOutcomeUnknown(created)
    const restored = store.syncFromStorage(scope, createIdempotencyAttempt())
    expect(restored?.status).toBe('OUTCOME_UNKNOWN')
    expect(restored?.key).toBe('shipment-action-0003')
    expect(restored?.request).toEqual(request)
  })

  it('人工送达确认仅以严格字段持久化并可由同scope恢复', () => {
    const store = useShipmentMutationFlight()
    const owner = Symbol('manual-delivery-owner')
    store.setScope(scope)
    store.activate(owner)
    const manualRequest = {
      name: 'confirmManualDelivery' as const,
      orderId: ORDER,
      payload: {
        expectedVersion: 9,
        reason: '承运方无签收回传，人工核验客户已收货',
        evidenceManifestId: '44444444-4444-4444-8444-444444444444',
        confirmedDeliveredAt: '2026-08-25T10:00:00.000Z',
      },
    }
    const created = store.begin(owner, {
      sourceId: ORDER,
      request: manualRequest,
      key: 'manual-delivery-0001',
      attempt: createIdempotencyAttempt(),
    })!
    expect(created).not.toBeNull()
    store.markOutcomeUnknown(created)
    const restored = store.syncFromStorage(scope, createIdempotencyAttempt())
    expect(restored?.request).toEqual(manualRequest)
    expect(restored?.status).toBe('OUTCOME_UNKNOWN')
  })

  it('多明细发运和售后请求只接受严格持久化白名单', () => {
    const store = useShipmentMutationFlight()
    const owner = Symbol('owner')
    store.setScope(scope)
    store.activate(owner)
    expect(
      store.begin(owner, {
        sourceId: ORDER,
        request: {
          name: 'createShipment',
          payload: {
            salesOrderId: ORDER,
            lines: [{ packingOrderId: SHIPMENT, quantity: '1.000000' }],
          },
        } as never,
        key: 'shipment-action-0004',
        attempt: createIdempotencyAttempt(),
      }),
    ).toBeNull()

    expect(
      store.begin(owner, {
        sourceId: ORDER,
        request: {
          name: 'createShipment',
          payload: {
            salesOrderId: ORDER,
            lines: [
              {
                packingOrderId: SHIPMENT,
                packingItemId: '33333333-3333-4333-8333-333333333333',
                quantity: '1.000000',
              },
            ],
          },
        },
        key: 'shipment-action-0005',
        attempt: createIdempotencyAttempt(),
      }),
    ).not.toBeNull()
    const persisted = JSON.parse(sessionStorage.getItem(shipmentMutationStorageKey)!)
    expect(persisted.actor).toBeUndefined()
    expect(persisted.request.payload.lines).toHaveLength(1)
  })

  it('异常工作流请求复用scope和严格字段白名单且不持久化actor', () => {
    const store = useShipmentMutationFlight()
    const owner = Symbol('exception-owner')
    store.setScope(scope)
    store.activate(owner)
    expect(
      store.begin(owner, {
        sourceId: ORDER,
        request: {
          name: 'openExceptionCase',
          payload: {
            salesOrderId: ORDER,
            category: 'CUSTOMER_CLAIM',
            referenceNo: 'CLAIM-101',
            description: '索赔待结算',
            affectedQuantity: '1.000000',
            actor: 'must-not-pass',
          },
        } as never,
        key: 'shipment-exception-0001',
        attempt: createIdempotencyAttempt(),
      }),
    ).toBeNull()
    const flight = store.begin(owner, {
      sourceId: ORDER,
      request: {
        name: 'openExceptionCase',
        payload: {
          salesOrderId: ORDER,
          category: 'CUSTOMER_CLAIM',
          referenceNo: 'CLAIM-101',
          description: '索赔待结算',
          affectedQuantity: '1.000000',
        },
      },
      key: 'shipment-exception-0002',
      attempt: createIdempotencyAttempt(),
    })!
    store.markOutcomeUnknown(flight)
    const persisted = JSON.parse(sessionStorage.getItem(shipmentMutationStorageKey)!)
    expect(persisted.actor).toBeUndefined()
    expect(persisted.request.payload.actor).toBeUndefined()
    expect(store.syncFromStorage(scope, createIdempotencyAttempt())?.key).toBe(
      'shipment-exception-0002',
    )
  })
})
