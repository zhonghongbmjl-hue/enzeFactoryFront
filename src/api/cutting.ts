import type { AxiosInstance } from 'axios'
import { http, withIdempotency } from './http'
import type { ApiResponse } from '@/types/auth'
import type { CuttingOrder } from '@/types/cutting'
import type { DecimalString } from '@/utils/decimal'

export function createCuttingApi(client: AxiosInstance) {
  const post = async <T>(
    path: string,
    body: unknown,
    idempotent = false,
    idempotencyKey?: string,
  ): Promise<T> =>
    (
      await client.post<ApiResponse<T>>(
        path,
        body,
        idempotent ? withIdempotency({ method: 'post' }, idempotencyKey) : undefined,
      )
    ).data.data
  return {
    async create(
      input: {
        cuttingNo: string
        materialIssueId: string
        orderItemId: string
        skuId: string
        productionBatch: string
        sourceFabricLot: string
        inputQuantity: DecimalString
      },
      idempotencyKey?: string,
    ): Promise<CuttingOrder> {
      return post('/cutting-orders', input, true, idempotencyKey)
    },
    async get(id: string): Promise<CuttingOrder> {
      return (await client.get<ApiResponse<CuttingOrder>>(`/cutting-orders/${id}`)).data.data
    },
    async release(id: string, version: number): Promise<CuttingOrder> {
      return post(`/cutting-orders/${id}/release`, { version })
    },
    async start(id: string, version: number): Promise<CuttingOrder> {
      return post(`/cutting-orders/${id}/start`, { version })
    },
    async complete(
      id: string,
      input: {
        outputQuantity: DecimalString
        lossQuantity: DecimalString
        excessReturnQuantity: DecimalString
        bundles: Array<{ bundleNo: string; quantity: DecimalString }>
        returnNo?: string
        version: number
      },
      idempotencyKey?: string,
    ): Promise<CuttingOrder> {
      return post(`/cutting-orders/${id}/complete`, input, true, idempotencyKey)
    },
  }
}

export const cuttingApi = createCuttingApi(http)
