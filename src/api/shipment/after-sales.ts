import type { ApiRequestClient } from '../http'
import type { IdempotentPost } from './idempotent-post'
import type {
  AfterSalesAction,
  AfterSalesCase,
  AfterSalesStatus,
  AfterSalesTransitionInput,
  Page,
  Shipment,
} from '@/types/shipment'

export function createAfterSalesOperations(request: ApiRequestClient, post: IdempotentPost) {
  return {
    async getAfterSales(id: string): Promise<AfterSalesCase> {
      return request.get<AfterSalesCase>(`/after-sales/${id}`)
    },
    async listAfterSales(input: {
      salesOrderId?: string
      status?: AfterSalesStatus
      page: number
      size: number
    }): Promise<Page<AfterSalesCase>> {
      return request.get<Page<AfterSalesCase>>('/after-sales', { params: input })
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
