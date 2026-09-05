import type { AxiosInstance } from 'axios'
import { describe, expect, it, vi } from 'vitest'
import { mockApiResponse } from '../../../tests/api'
import { createCuttingApi } from './index'

describe('cutting api', () => {
  it('uses cutting paths and idempotency headers for quantity mutations', async () => {
    const post = vi.fn().mockResolvedValue(mockApiResponse({ id: 'result-id', version: 1 }))
    const api = createCuttingApi({ post } as unknown as AxiosInstance)

    await api.create(
      {
        cuttingNo: 'CUT-001',
        materialIssueId: 'issue-id',
        orderItemId: 'order-item',
        skuId: 'sku-id',
        productionBatch: 'PB-001',
        sourceFabricLot: 'LOT-001',
        inputQuantity: '10.000000',
      },
      'cutting-create-retry-key',
    )
    expect(post).toHaveBeenNthCalledWith(
      1,
      '/cutting-orders',
      expect.objectContaining({ cuttingNo: 'CUT-001' }),
      expect.objectContaining({ headers: { 'Idempotency-Key': 'cutting-create-retry-key' } }),
    )

    await api.complete(
      'cutting-id',
      {
        outputQuantity: '8.000000',
        lossQuantity: '1.000000',
        excessReturnQuantity: '1.000000',
        bundles: [{ bundleNo: 'B01', quantity: '8.000000' }],
        returnNo: 'RET-001',
        version: 2,
      },
      'cutting-complete-retry-key',
    )
    expect(post).toHaveBeenNthCalledWith(
      2,
      '/cutting-orders/cutting-id/complete',
      expect.objectContaining({ version: 2 }),
      expect.objectContaining({ headers: { 'Idempotency-Key': 'cutting-complete-retry-key' } }),
    )
  })
})
