import { describe, expect, it, vi } from 'vitest'
import type { AxiosInstance } from 'axios'
import { mockApiResponse } from '../../../tests/api'
import { createMasterDataApi } from './index'

describe('master data api', () => {
  it('unwraps ApiResponse and forwards bounded paging/filter parameters', async () => {
    const get = vi.fn().mockResolvedValue(mockApiResponse({ content: [], totalElements: 0 }))
    const api = createMasterDataApi({ get } as unknown as AxiosInstance)
    await expect(
      api.list('organizations', { page: 1, size: 20, active: true, query: 'or' }),
    ).resolves.toMatchObject({ totalElements: 0 })
    expect(get).toHaveBeenCalledWith('/organizations', {
      params: { page: 1, size: 20, active: true, query: 'or' },
    })
  })

  it('loads only a bounded active select list', async () => {
    const get = vi.fn().mockResolvedValue(mockApiResponse([]))
    const api = createMasterDataApi({ get } as unknown as AxiosInstance)
    await api.select('factories', '一', 30)
    expect(get).toHaveBeenCalledWith('/factories/select', {
      params: { query: '一', limit: 30 },
    })
  })
})
