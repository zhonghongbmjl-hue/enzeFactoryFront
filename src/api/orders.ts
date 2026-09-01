import type { AxiosInstance } from 'axios'
import { http, withIdempotency } from './http'
import type { ApiResponse } from '@/types/auth'
import type {
  OrderAction,
  ManualDeliveryConfirmation,
  ManualDeliveryConfirmationInput,
  ManualDeliveryEvidence,
  OrderStatus,
  SalesOrder,
  SalesOrderInput,
  SalesOrderPage,
} from '@/types/order'

export function createSalesOrderApi(client: AxiosInstance) {
  return {
    async list(params: {
      query?: string
      status?: OrderStatus
      page: number
      size: number
    }): Promise<SalesOrderPage> {
      return (await client.get<ApiResponse<SalesOrderPage>>('/sales-orders', { params })).data.data
    },
    async get(id: string): Promise<SalesOrder> {
      return (await client.get<ApiResponse<SalesOrder>>(`/sales-orders/${id}`)).data.data
    },
    async create(input: SalesOrderInput): Promise<SalesOrder> {
      return (
        await client.post<ApiResponse<SalesOrder>>(
          '/sales-orders',
          input,
          withIdempotency({ method: 'post' }),
        )
      ).data.data
    },
    async action(id: string, action: OrderAction, version: number): Promise<SalesOrder> {
      return (
        await client.post<ApiResponse<SalesOrder>>(
          `/sales-orders/${id}/${action}`,
          { version },
          withIdempotency({ method: 'post' }),
        )
      ).data.data
    },
    async uploadManualDeliveryEvidence(
      id: string,
      file: File,
      idempotencyKey?: string,
    ): Promise<ManualDeliveryEvidence> {
      const body = new FormData()
      body.append('file', file)
      return (
        await client.post<ApiResponse<ManualDeliveryEvidence>>(
          `/sales-orders/${id}/manual-delivery-evidence`,
          body,
          withIdempotency({ method: 'post' }, idempotencyKey),
        )
      ).data.data
    },
    async confirmManualDelivery(
      id: string,
      input: ManualDeliveryConfirmationInput,
      idempotencyKey?: string,
    ): Promise<ManualDeliveryConfirmation> {
      return (
        await client.post<ApiResponse<ManualDeliveryConfirmation>>(
          `/sales-orders/${id}/manual-delivery-confirmations`,
          input,
          withIdempotency({ method: 'post' }, idempotencyKey),
        )
      ).data.data
    },
  }
}

export const salesOrderApi = createSalesOrderApi(http)
