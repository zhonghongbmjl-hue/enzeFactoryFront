import { describe, expect, it, vi } from 'vitest'
import type { AxiosInstance } from 'axios'
import { mockApiResponse } from '../../../tests/api'
import { createBomApi } from './bom'

describe('BOM api', () => {
  it('uses named lifecycle endpoints with a version and idempotency header', async () => {
    const post = vi.fn().mockResolvedValue(mockApiResponse({ status: 'PENDING_APPROVAL' }))
    const get = vi
      .fn()
      .mockResolvedValue(
        mockApiResponse({ content: [], page: 2, size: 25, totalElements: 0, totalPages: 0 }),
      )
    const api = createBomApi({ get, post } as unknown as AxiosInstance)
    await api.list('product-id', 2, 25)
    expect(get).toHaveBeenCalledWith('/bom-versions', {
      params: { productId: 'product-id', page: 2, size: 25 },
    })
    await api.submit('bom-id', 7)
    expect(post).toHaveBeenCalledWith(
      '/bom-versions/bom-id/submit',
      { version: 7 },
      expect.objectContaining({
        headers: expect.objectContaining({ 'Idempotency-Key': expect.any(String) }),
      }),
    )
  })
})
