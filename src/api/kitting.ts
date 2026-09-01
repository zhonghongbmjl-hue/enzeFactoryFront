import type { AxiosInstance } from 'axios'
import { http, withIdempotency } from './http'
import type { ApiResponse } from '@/types/auth'
import type { KittingCheck, KittingRelease } from '@/types/cutting'
import type { DecimalString } from '@/utils/decimal'

export function createKittingApi(client: AxiosInstance) {
  return {
    async check(input: { orderItemId: string; skuId: string }): Promise<KittingCheck> {
      return (await client.post<ApiResponse<KittingCheck>>('/kitting-checks', input)).data.data
    },
    async get(id: string): Promise<KittingCheck> {
      return (await client.get<ApiResponse<KittingCheck>>(`/kitting-checks/${id}`)).data.data
    },
    async releases(id: string): Promise<KittingRelease[]> {
      return (await client.get<ApiResponse<KittingRelease[]>>(`/kitting-checks/${id}/releases`))
        .data.data
    },
    async release(
      id: string,
      quantity: DecimalString,
      idempotencyKey?: string,
    ): Promise<KittingRelease> {
      return (
        await client.post<ApiResponse<KittingRelease>>(
          `/kitting-checks/${id}/releases`,
          { quantity },
          withIdempotency({ method: 'post' }, idempotencyKey),
        )
      ).data.data
    },
    async schedule(
      releaseId: string,
      quantity: DecimalString,
      scheduleReference: string,
      idempotencyKey?: string,
    ): Promise<KittingRelease> {
      return (
        await client.post<ApiResponse<KittingRelease>>(
          `/kitting-checks/releases/${releaseId}/schedule`,
          { quantity, scheduleReference },
          withIdempotency({ method: 'post' }, idempotencyKey),
        )
      ).data.data
    },
  }
}

export const kittingApi = createKittingApi(http)
