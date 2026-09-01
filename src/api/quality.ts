import type { AxiosInstance } from 'axios'
import { http, withIdempotency } from './http'
import type { ApiResponse } from '@/types/auth'
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
  return {
    async trim(input: TrimmingInput, key: string): Promise<TrimmingRecord> {
      return (
        await client.post<ApiResponse<TrimmingRecord>>(
          '/trimming-records',
          input,
          withIdempotency({ method: 'post' }, key),
        )
      ).data.data
    },
    async inspect(input: InspectionInput, key: string): Promise<FinishedProductInspection> {
      return (
        await client.post<ApiResponse<FinishedProductInspection>>(
          '/finished-product-inspections',
          input,
          withIdempotency({ method: 'post' }, key),
        )
      ).data.data
    },
    async completeRework(
      id: string,
      input: ReworkCompletionInput,
      key: string,
    ): Promise<FinishedProductInspection> {
      return (
        await client.post<ApiResponse<FinishedProductInspection>>(
          `/rework-orders/${id}/complete`,
          input,
          withIdempotency({ method: 'post' }, key),
        )
      ).data.data
    },
    async bridgeLegacyRework(
      id: string,
      input: LegacyReworkBridgeInput,
      key: string,
    ): Promise<LegacyReworkBridge> {
      return (
        await client.post<ApiResponse<LegacyReworkBridge>>(
          `/rework-orders/${id}/legacy-method-bridge`,
          input,
          withIdempotency({ method: 'post' }, key),
        )
      ).data.data
    },
    async aggregate(workOrderId: string, page = 0, size = 50): Promise<QualityAggregate> {
      return (
        await client.get<ApiResponse<QualityAggregate>>(`/quality/work-orders/${workOrderId}`, {
          params: { page, size },
        })
      ).data.data
    },
    async aggregateOrder(salesOrderId: string): Promise<OrderQualityFacts> {
      return (await client.get<ApiResponse<OrderQualityFacts>>(`/quality/orders/${salesOrderId}`))
        .data.data
    },
    async policy(): Promise<QualityPolicy> {
      return (await client.get<ApiResponse<QualityPolicy>>('/quality/policy')).data.data
    },
    async updatePolicy(maxReworkAttempts: number, key: string): Promise<QualityPolicy> {
      return (
        await client.put<ApiResponse<QualityPolicy>>(
          '/quality/policy',
          { maxReworkAttempts },
          withIdempotency({ method: 'put' }, key),
        )
      ).data.data
    },
  }
}

export const qualityApi = createQualityApi(http)
