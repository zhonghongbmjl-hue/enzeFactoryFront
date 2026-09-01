import type { AxiosInstance } from 'axios'
import { describe, expect, it, vi } from 'vitest'
import { createProcurementApi } from './procurement'

describe('procurement api', () => {
  it('loads both material branches and sends versioned idempotent actions', async () => {
    const get = vi
      .fn()
      .mockResolvedValue({ data: { data: { salesOrderId: 'order-id', branches: [] } } })
    const post = vi.fn().mockResolvedValue({
      data: { data: { id: 'plan-id', status: 'PENDING_APPROVAL', version: 2 } },
    })
    const api = createProcurementApi({ get, post } as unknown as AxiosInstance)

    await api.workspace('order-id')
    expect(get).toHaveBeenCalledWith('/procurement/orders/order-id')

    await api.planAction('plan-id', 'submit', 1)
    expect(post).toHaveBeenCalledWith(
      '/purchase-plans/plan-id/submit',
      { version: 1 },
      expect.objectContaining({
        headers: expect.objectContaining({ 'Idempotency-Key': expect.any(String) }),
      }),
    )

    await api.planAction('plan-id', 'complete', 4)
    expect(post).toHaveBeenCalledWith(
      '/purchase-plans/plan-id/complete',
      { version: 4 },
      expect.objectContaining({
        headers: expect.objectContaining({ 'Idempotency-Key': expect.any(String) }),
      }),
    )

    await api.purchaseOrderAction('po-id', 'complete', 6)
    expect(post).toHaveBeenCalledWith(
      '/purchase-orders/po-id/complete',
      { version: 6 },
      expect.objectContaining({
        headers: expect.objectContaining({ 'Idempotency-Key': expect.any(String) }),
      }),
    )

    await api.inspectionAction('inspection-id', 'finish', 1)
    expect(post).toHaveBeenCalledWith(
      '/incoming-inspections/inspection-id/finish',
      { version: 1 },
      expect.objectContaining({
        headers: expect.objectContaining({ 'Idempotency-Key': expect.any(String) }),
      }),
    )

    await api.inspectionAction('inspection-id', 'complete', 2)
    expect(post).toHaveBeenCalledWith(
      '/incoming-inspections/inspection-id/complete',
      { version: 2 },
      expect.objectContaining({
        headers: expect.objectContaining({ 'Idempotency-Key': expect.any(String) }),
      }),
    )
  })
})
