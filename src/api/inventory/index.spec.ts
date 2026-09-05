import type { AxiosInstance } from 'axios'
import { describe, expect, it, vi } from 'vitest'
import { mockApiResponse } from '../../../tests/api'
import { createInventoryApi } from './index'

describe('inventory api', () => {
  it('uses inventory paths and idempotency headers for quantity mutations', async () => {
    const get = vi.fn().mockResolvedValue(mockApiResponse([]))
    const post = vi.fn().mockResolvedValue(mockApiResponse({ id: 'result-id', version: 1 }))
    const api = createInventoryApi({ get, post } as unknown as AxiosInstance)

    await api.balances('material-id')
    expect(get).toHaveBeenCalledWith('/inventory-balances', {
      params: { materialId: 'material-id' },
    })

    await api.issue(
      {
        issueNo: 'ISS-001',
        orderItemId: 'order-item',
        warehouseId: 'warehouse-id',
        materialId: 'material-id',
        materialType: 'FABRIC',
        batchNo: 'LOT-001',
        quantity: '10.000000',
      },
      'issue-retry-key',
    )
    expect(post).toHaveBeenCalledWith(
      '/material-issues',
      expect.objectContaining({ issueNo: 'ISS-001' }),
      expect.objectContaining({ headers: { 'Idempotency-Key': 'issue-retry-key' } }),
    )

    await api.returnMaterial(
      { returnNo: 'RET-001', materialIssueId: 'issue-id', quantity: '1.000000' },
      'return-retry-key',
    )
    expect(post).toHaveBeenCalledWith(
      '/material-returns',
      expect.objectContaining({ returnNo: 'RET-001' }),
      expect.objectContaining({ headers: { 'Idempotency-Key': 'return-retry-key' } }),
    )
  })
})
