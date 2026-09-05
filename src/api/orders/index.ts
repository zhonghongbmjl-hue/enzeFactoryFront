import type { AxiosInstance } from 'axios'
import { createApiRequest, http, withIdempotency } from '../http'
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
  const request = createApiRequest(client)
  return {
    async list(params: {
      query?: string
      status?: OrderStatus
      page: number
      size: number
    }): Promise<SalesOrderPage> {
      return request.get<SalesOrderPage>('/sales-orders', { params })
    },
    async get(id: string): Promise<SalesOrder> {
      return request.get<SalesOrder>(`/sales-orders/${id}`)
    },
    async create(input: SalesOrderInput): Promise<SalesOrder> {
      return request.post<SalesOrder>('/sales-orders', input, withIdempotency({ method: 'post' }))
    },
    async action(id: string, action: OrderAction, version: number): Promise<SalesOrder> {
      return request.post<SalesOrder>(
        `/sales-orders/${id}/${action}`,
        { version },
        withIdempotency({ method: 'post' }),
      )
    },
    async uploadManualDeliveryEvidence(
      id: string,
      file: File,
      idempotencyKey?: string,
    ): Promise<ManualDeliveryEvidence> {
      const body = new FormData()
      body.append('file', file)
      return request.post<ManualDeliveryEvidence>(
        `/sales-orders/${id}/manual-delivery-evidence`,
        body,
        withIdempotency({ method: 'post' }, idempotencyKey),
      )
    },
    async confirmManualDelivery(
      id: string,
      input: ManualDeliveryConfirmationInput,
      idempotencyKey?: string,
    ): Promise<ManualDeliveryConfirmation> {
      return request.post<ManualDeliveryConfirmation>(
        `/sales-orders/${id}/manual-delivery-confirmations`,
        input,
        withIdempotency({ method: 'post' }, idempotencyKey),
      )
    },
  }
}

export const salesOrderApi = createSalesOrderApi(http)
