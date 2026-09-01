import type { AxiosInstance } from 'axios'
import { describe, expect, it, vi } from 'vitest'
import { createInventoryApi } from './inventory'
import { createCuttingApi } from './cutting'
import { createKittingApi } from './kitting'

describe('inventory, cutting and kitting api', () => {
  it('uses the documented paths and idempotency headers for quantity mutations', async () => {
    const get = vi.fn().mockResolvedValue({ data: { data: [] } })
    const post = vi.fn().mockResolvedValue({ data: { data: { id: 'result-id', version: 1 } } })
    const client = { get, post } as unknown as AxiosInstance
    const inventory = createInventoryApi(client)
    const cutting = createCuttingApi(client)
    const kitting = createKittingApi(client)

    await inventory.balances('material-id')
    expect(get).toHaveBeenCalledWith('/inventory-balances', {
      params: { materialId: 'material-id' },
    })

    await inventory.issue(
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
      expect.objectContaining({
        headers: expect.objectContaining({ 'Idempotency-Key': 'issue-retry-key' }),
      }),
    )

    await inventory.returnMaterial(
      {
        returnNo: 'RET-001',
        materialIssueId: 'issue-id',
        quantity: '1.000000',
      },
      'return-retry-key',
    )
    expect(post).toHaveBeenCalledWith(
      '/material-returns',
      expect.objectContaining({ returnNo: 'RET-001' }),
      expect.objectContaining({
        headers: expect.objectContaining({ 'Idempotency-Key': 'return-retry-key' }),
      }),
    )

    await cutting.create(
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

    await cutting.complete(
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
    expect(post).toHaveBeenCalledWith(
      '/cutting-orders/cutting-id/complete',
      expect.objectContaining({ version: 2 }),
      expect.objectContaining({
        headers: expect.objectContaining({ 'Idempotency-Key': 'cutting-complete-retry-key' }),
      }),
    )

    await kitting.release('check-id', '12.000000', 'release-retry-key')
    expect(post).toHaveBeenCalledWith(
      '/kitting-checks/check-id/releases',
      { quantity: '12.000000' },
      expect.objectContaining({
        headers: expect.objectContaining({ 'Idempotency-Key': 'release-retry-key' }),
      }),
    )

    await kitting.schedule('release-id', '5.000000', 'PB-20260824-001', 'schedule-retry-key')
    expect(post).toHaveBeenCalledWith(
      '/kitting-checks/releases/release-id/schedule',
      { quantity: '5.000000', scheduleReference: 'PB-20260824-001' },
      expect.objectContaining({
        headers: expect.objectContaining({ 'Idempotency-Key': 'schedule-retry-key' }),
      }),
    )
  })
})
