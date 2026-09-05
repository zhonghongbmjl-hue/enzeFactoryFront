import { describe, expect, it, vi } from 'vitest'
import { mockApiResponse } from '../../../tests/api'
import { createQualityApi } from './index'

describe('quality api', () => {
  it('uses real quality routes, decimal strings and explicit idempotency keys', async () => {
    const post = vi.fn().mockResolvedValue(mockApiResponse({}))
    const get = vi.fn().mockResolvedValue(mockApiResponse({}))
    const put = vi.fn().mockResolvedValue(mockApiResponse({}))
    const api = createQualityApi({ post, get, put } as never)

    await api.trim({ workOrderId: 'wo-1', quantity: '2.000000' }, 'trim-key')
    await api.inspect(
      {
        workOrderId: 'wo-1',
        inspectionMethod: 'SAMPLING',
        submittedQuantity: '2.000000',
        passedQuantity: '1.000000',
        failedQuantity: '1.000000',
        defectCode: 'SEAM',
        disposition: '返修',
      },
      'inspect-key',
    )
    await api.completeRework(
      'rework-1',
      { passedQuantity: '1.000000', failedQuantity: '0.000000', disposition: '完成' },
      'rework-key',
    )
    await api.bridgeLegacyRework('rework-legacy', { selectedMethod: 'FULL' }, 'bridge-key')
    await api.aggregate('wo-1')
    await api.aggregateOrder('sales-1')
    await api.policy()
    await api.updatePolicy(5, 'policy-key')

    expect(post).toHaveBeenNthCalledWith(
      1,
      '/trimming-records',
      { workOrderId: 'wo-1', quantity: '2.000000' },
      expect.objectContaining({ headers: { 'Idempotency-Key': 'trim-key' } }),
    )
    expect(post).toHaveBeenNthCalledWith(
      2,
      '/finished-product-inspections',
      expect.objectContaining({ inspectionMethod: 'SAMPLING', submittedQuantity: '2.000000' }),
      expect.objectContaining({ headers: { 'Idempotency-Key': 'inspect-key' } }),
    )
    expect(post).toHaveBeenNthCalledWith(
      3,
      '/rework-orders/rework-1/complete',
      expect.objectContaining({ passedQuantity: '1.000000' }),
      expect.objectContaining({ headers: { 'Idempotency-Key': 'rework-key' } }),
    )
    expect(post).toHaveBeenNthCalledWith(
      4,
      '/rework-orders/rework-legacy/legacy-method-bridge',
      { selectedMethod: 'FULL' },
      expect.objectContaining({ headers: { 'Idempotency-Key': 'bridge-key' } }),
    )
    expect(get).toHaveBeenCalledWith('/quality/work-orders/wo-1', {
      params: { page: 0, size: 50 },
    })
    expect(get).toHaveBeenCalledWith('/quality/orders/sales-1')
    expect(get).toHaveBeenCalledWith('/quality/policy')
    expect(put).toHaveBeenCalledWith(
      '/quality/policy',
      { maxReworkAttempts: 5 },
      expect.objectContaining({ headers: { 'Idempotency-Key': 'policy-key' } }),
    )
  })
})
