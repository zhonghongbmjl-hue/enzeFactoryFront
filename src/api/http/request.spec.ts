import { describe, expect, it, vi } from 'vitest'
import { createHttpClient } from './client'
import { createApiRequest } from './request'

describe('unified API request client', () => {
  it('returns business data instead of AxiosResponse', async () => {
    const client = createHttpClient({
      getSession: () => ({ token: null, generation: 0 }),
      onUnauthorized: vi.fn(),
    })
    const request = createApiRequest(client)

    await expect(
      request.get<{ id: string }>('/products/1', {
        adapter: async (config) => ({
          data: {
            success: true,
            code: 'OK',
            message: 'success',
            data: { id: 'product-1' },
            traceId: 'trace-success',
            timestamp: '2026-09-01T00:00:00Z',
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        }),
      }),
    ).resolves.toEqual({ id: 'product-1' })
  })
})
