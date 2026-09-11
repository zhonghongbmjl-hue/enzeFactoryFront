import type { AxiosInstance } from 'axios'
import { createApiRequest, http, withIdempotency } from '../http'
import type { KittingCheck, KittingRelease } from '@/types/cutting'
import type { DecimalString } from '@/utils/decimal'

export function createKittingApi(client: AxiosInstance) {
  const request = createApiRequest(client)
  return {
    async list(limit = 50): Promise<KittingCheck[]> {
      return request.get<KittingCheck[]>('/kitting-checks', { params: { limit } })
    },
    async check(input: { orderItemId: string; skuId: string }): Promise<KittingCheck> {
      return request.post<KittingCheck>('/kitting-checks', input)
    },
    async get(id: string): Promise<KittingCheck> {
      return request.get<KittingCheck>(`/kitting-checks/${id}`)
    },
    async releases(id: string): Promise<KittingRelease[]> {
      return request.get<KittingRelease[]>(`/kitting-checks/${id}/releases`)
    },
    async release(
      id: string,
      quantity: DecimalString,
      idempotencyKey?: string,
    ): Promise<KittingRelease> {
      return request.post<KittingRelease>(
        `/kitting-checks/${id}/releases`,
        { quantity },
        withIdempotency({ method: 'post' }, idempotencyKey),
      )
    },
    async schedule(
      releaseId: string,
      quantity: DecimalString,
      scheduleReference: string,
      idempotencyKey?: string,
    ): Promise<KittingRelease> {
      return request.post<KittingRelease>(
        `/kitting-checks/releases/${releaseId}/schedule`,
        { quantity, scheduleReference },
        withIdempotency({ method: 'post' }, idempotencyKey),
      )
    },
  }
}

export const kittingApi = createKittingApi(http)
