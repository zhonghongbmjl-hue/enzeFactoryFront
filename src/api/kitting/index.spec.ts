import type { AxiosInstance } from 'axios'
import { describe, expect, it, vi } from 'vitest'
import { mockApiResponse } from '../../../tests/api'
import { createKittingApi } from './index'

describe('kitting api', () => {
  it('uses kitting paths and idempotency headers for release mutations', async () => {
    const post = vi.fn().mockResolvedValue(mockApiResponse({ id: 'result-id', version: 1 }))
    const api = createKittingApi({ post } as unknown as AxiosInstance)

    await api.release('check-id', '12.000000', 'release-retry-key')
    expect(post).toHaveBeenNthCalledWith(
      1,
      '/kitting-checks/check-id/releases',
      { quantity: '12.000000' },
      expect.objectContaining({ headers: { 'Idempotency-Key': 'release-retry-key' } }),
    )

    await api.schedule('release-id', '5.000000', 'PB-20260824-001', 'schedule-retry-key')
    expect(post).toHaveBeenNthCalledWith(
      2,
      '/kitting-checks/releases/release-id/schedule',
      { quantity: '5.000000', scheduleReference: 'PB-20260824-001' },
      expect.objectContaining({ headers: { 'Idempotency-Key': 'schedule-retry-key' } }),
    )
  })
})
