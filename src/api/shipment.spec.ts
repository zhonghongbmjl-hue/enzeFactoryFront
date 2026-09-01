import { describe, expect, it, vi } from 'vitest'
import { createShipmentApi } from './shipment'

describe('shipment api', () => {
  it('forwards bounded after-sales paging and exception workflow idempotency', async () => {
    const get = vi.fn().mockResolvedValue({ data: { data: { items: [], total: 0 } } })
    const post = vi.fn().mockResolvedValue({ data: { data: {} } })
    const api = createShipmentApi({ get, post } as never)

    await api.listAfterSales({ status: 'CREATED', page: 1, size: 100 })
    await api.listExceptionCases({ status: 'OPEN', page: 0, size: 20 })
    await api.openExceptionCase(
      {
        salesOrderId: 'order-1',
        category: 'CUSTOMER_CLAIM',
        referenceNo: 'CLAIM-1',
        description: '索赔待结算',
        affectedQuantity: '1.000000',
      },
      'exception-open-key',
    )
    await api.resolveExceptionCase(
      'case-1',
      {
        expectedVersion: 0,
        resolutionCode: 'CLAIM_SETTLED',
        evidenceType: 'SETTLEMENT_REFERENCE',
        evidenceRef: 'SETTLEMENT-1',
      },
      'exception-resolve-key',
    )

    expect(get).toHaveBeenNthCalledWith(1, '/after-sales', {
      params: { status: 'CREATED', page: 1, size: 100 },
    })
    expect(get).toHaveBeenNthCalledWith(2, '/shipment/exception-cases', {
      params: { status: 'OPEN', page: 0, size: 20 },
    })
    expect(post).toHaveBeenNthCalledWith(
      1,
      '/shipment/exception-cases',
      expect.objectContaining({ category: 'CUSTOMER_CLAIM' }),
      expect.objectContaining({ headers: { 'Idempotency-Key': 'exception-open-key' } }),
    )
    expect(post).toHaveBeenNthCalledWith(
      2,
      '/shipment/exception-cases/case-1/resolve',
      expect.objectContaining({ expectedVersion: 0 }),
      expect.objectContaining({ headers: { 'Idempotency-Key': 'exception-resolve-key' } }),
    )
  })
})
