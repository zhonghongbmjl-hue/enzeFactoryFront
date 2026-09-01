import type { AxiosInstance } from 'axios'
import { http, withIdempotency } from './http'
import type { ApiResponse } from '@/types/auth'
import type {
  AfterSalesAction,
  AfterSalesCase,
  AfterSalesTransitionInput,
  AfterSalesStatus,
  ExceptionCase,
  ExceptionCategory,
  OpenExceptionCaseInput,
  Page,
  PackingOrder,
  QuantityInput,
  ResolveExceptionCaseInput,
  Shipment,
  ShipmentOrderWorkspace,
} from '@/types/shipment'

export function createShipmentApi(client: AxiosInstance) {
  const post = async <T>(url: string, body: unknown, key: string): Promise<T> =>
    (await client.post<ApiResponse<T>>(url, body, withIdempotency({ method: 'post' }, key))).data
      .data
  return {
    async orderWorkspace(orderId: string): Promise<ShipmentOrderWorkspace> {
      return (await client.get<ApiResponse<ShipmentOrderWorkspace>>(`/shipment/orders/${orderId}`))
        .data.data
    },
    async getShipment(id: string): Promise<Shipment> {
      return (await client.get<ApiResponse<Shipment>>(`/shipments/${id}`)).data.data
    },
    pack(
      input: {
        salesOrderId: string
        boxNo: string
        lines: ReadonlyArray<{ qualityInspectionId: string; quantity: string }>
      },
      key: string,
    ) {
      return post<PackingOrder>('/packing-orders', input, key)
    },
    createShipment(
      input: {
        salesOrderId: string
        lines: ReadonlyArray<{ packingOrderId: string; packingItemId: string; quantity: string }>
      },
      key: string,
    ) {
      return post<Shipment>('/shipments', input, key)
    },
    requestApproval(id: string, expectedVersion: number, key: string) {
      return post<Shipment>(`/shipments/${id}/request-approval`, { expectedVersion }, key)
    },
    approve(id: string, expectedVersion: number, key: string) {
      return post<Shipment>(`/shipments/${id}/approve`, { expectedVersion }, key)
    },
    dispatch(id: string, expectedVersion: number, lines: readonly QuantityInput[], key: string) {
      return post<Shipment>(`/shipments/${id}/dispatch`, { expectedVersion, lines }, key)
    },
    sign(id: string, expectedVersion: number, lines: readonly QuantityInput[], key: string) {
      return post<Shipment>(`/shipments/${id}/sign`, { expectedVersion, lines }, key)
    },
    async getAfterSales(id: string): Promise<AfterSalesCase> {
      return (await client.get<ApiResponse<AfterSalesCase>>(`/after-sales/${id}`)).data.data
    },
    async listAfterSales(input: {
      salesOrderId?: string
      status?: AfterSalesStatus
      page: number
      size: number
    }): Promise<Page<AfterSalesCase>> {
      return (
        await client.get<ApiResponse<Page<AfterSalesCase>>>('/after-sales', { params: input })
      ).data.data
    },
    async listExceptionCases(input: {
      salesOrderId?: string
      category?: ExceptionCategory
      status?: 'OPEN' | 'RESOLVED'
      page: number
      size: number
    }): Promise<Page<ExceptionCase>> {
      return (
        await client.get<ApiResponse<Page<ExceptionCase>>>('/shipment/exception-cases', {
          params: input,
        })
      ).data.data
    },
    openExceptionCase(input: OpenExceptionCaseInput, key: string) {
      return post<ExceptionCase>('/shipment/exception-cases', input, key)
    },
    resolveExceptionCase(id: string, input: ResolveExceptionCaseInput, key: string) {
      return post<ExceptionCase>(`/shipment/exception-cases/${id}/resolve`, input, key)
    },
    receiveAfterSales(
      input: {
        originalShipmentId: string
        originalPackingOrderId: string
        originalPackingItemId: string
        quantity: string
        reasonCode: string
        customerFeedback: string
      },
      key: string,
    ) {
      return post<AfterSalesCase>('/after-sales', input, key)
    },
    transitionAfterSales(
      id: string,
      action: AfterSalesAction,
      input: AfterSalesTransitionInput,
      key: string,
    ) {
      if (action === 'disposition/approve') {
        const dispositionId = input.dispositionId
        return post<AfterSalesCase>(
          `/after-sales/${id}/dispositions/${dispositionId}/approve`,
          {
            expectedVersion: input.expectedVersion,
            type: input.dispositionType,
            outcome: input.dispositionOutcome,
            quantity: input.dispositionQuantity,
            additionalAttempts: input.additionalAttempts,
            reason: input.decisionReason,
            evidenceRef: input.evidenceRef,
          },
          key,
        )
      }
      return post<AfterSalesCase | Shipment>(`/after-sales/${id}/${action}`, input, key)
    },
  }
}

export const shipmentApi = createShipmentApi(http)
