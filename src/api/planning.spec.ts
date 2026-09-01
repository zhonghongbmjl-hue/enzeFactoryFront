import type { AxiosInstance } from 'axios'
import { describe, expect, it, vi } from 'vitest'
import { createPlanningApi } from './planning'

describe('production planning api', () => {
  it('keeps decimal quantities as strings and sends a stable idempotency key', async () => {
    const get = vi.fn().mockResolvedValue({ data: { data: { id: 'plan-1' } } })
    const post = vi.fn().mockResolvedValue({ data: { data: { id: 'plan-1', version: 0 } } })
    const api = createPlanningApi({ get, post } as unknown as AxiosInstance)
    const input = {
      orderId: 'order-1',
      orderItemId: 'item-1',
      skuId: 'sku-1',
      kittingReleaseId: 'release-1',
      factoryId: 'factory-1',
      workshopId: 'workshop-1',
      productionLineId: 'line-1',
      quantity: '12.345678' as const,
      startDate: '2026-08-25',
      endDate: '2026-08-30',
      plannedBatchCode: 'PB-001',
    }

    await api.create(input, 'stable-planning-key')
    expect(post).toHaveBeenCalledWith(
      '/production-plans',
      expect.objectContaining({ quantity: '12.345678' }),
      expect.objectContaining({
        headers: expect.objectContaining({ 'Idempotency-Key': 'stable-planning-key' }),
      }),
    )
    await api.get('plan-1')
    expect(get).toHaveBeenCalledWith('/production-plans/plan-1')
    await api.approve('plan-1', 0)
    expect(post).toHaveBeenCalledWith('/production-plans/plan-1/approve', { version: 0 })
  })
})
