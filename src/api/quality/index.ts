import type { AxiosInstance } from 'axios'
import { createApiRequest, http, withIdempotency } from '../http'
import type {
  FinishedProductInspection,
  InspectionInput,
  LegacyReworkBridge,
  LegacyReworkBridgeInput,
  OrderQualityFacts,
  QualityAggregate,
  QualityPolicy,
  ReworkCompletionInput,
  TrimmingInput,
  TrimmingRecord,
} from '@/types/quality'

export function createQualityApi(client: AxiosInstance) {
  const request = createApiRequest(client)
  return {
    async trim(input: TrimmingInput, key: string): Promise<TrimmingRecord> {
      return request.post<TrimmingRecord>(
        '/trimming-records',
        input,
        withIdempotency({ method: 'post' }, key),
      )
    },
    async inspect(input: InspectionInput, key: string): Promise<FinishedProductInspection> {
      return request.post<FinishedProductInspection>(
        '/finished-product-inspections',
        input,
        withIdempotency({ method: 'post' }, key),
      )
    },
    async completeRework(
      id: string,
      input: ReworkCompletionInput,
      key: string,
    ): Promise<FinishedProductInspection> {
      return request.post<FinishedProductInspection>(
        `/rework-orders/${id}/complete`,
        input,
        withIdempotency({ method: 'post' }, key),
      )
    },
    async bridgeLegacyRework(
      id: string,
      input: LegacyReworkBridgeInput,
      key: string,
    ): Promise<LegacyReworkBridge> {
      return request.post<LegacyReworkBridge>(
        `/rework-orders/${id}/legacy-method-bridge`,
        input,
        withIdempotency({ method: 'post' }, key),
      )
    },
    async aggregate(workOrderId: string, page = 0, size = 50): Promise<QualityAggregate> {
      return request.get<QualityAggregate>(`/quality/work-orders/${workOrderId}`, {
        params: { page, size },
      })
    },
    async aggregateOrder(salesOrderId: string): Promise<OrderQualityFacts> {
      return request.get<OrderQualityFacts>(`/quality/orders/${salesOrderId}`)
    },
    async policy(): Promise<QualityPolicy> {
      return request.get<QualityPolicy>('/quality/policy')
    },
    async updatePolicy(maxReworkAttempts: number, key: string): Promise<QualityPolicy> {
      return request.put<QualityPolicy>(
        '/quality/policy',
        { maxReworkAttempts },
        withIdempotency({ method: 'put' }, key),
      )
    },
  }
}

export const qualityApi = createQualityApi(http)
