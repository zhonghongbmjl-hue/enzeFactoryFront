import { describe, expect, it, vi } from 'vitest'
import type { AxiosInstance } from 'axios'
import { createDashboardApi } from './dashboard'

describe('dashboard api', () => {
  it('按页号和固定页容量请求订单控制塔', async () => {
    const payload = { content: [], totalElements: 0, totalPages: 0, page: 2, size: 20 }
    const get = vi.fn().mockResolvedValue({ data: { data: payload } })
    const api = createDashboardApi({ get } as unknown as AxiosInstance)

    await expect(api.orderControlTower({ page: 2, size: 20 })).resolves.toEqual(payload)
    expect(get).toHaveBeenCalledWith('/dashboard/order-control-tower', {
      params: { page: 2, size: 20 },
    })
  })
})
