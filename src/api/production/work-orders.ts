import type { AxiosInstance } from 'axios'
import { createApiRequest, withIdempotency } from '../http'
import type {
  PageResponse,
  ProductionCompletion,
  ProductionCompletionInput,
  ProductionReport,
  ProductionReportInput,
  WorkOrder,
  WorkOrderSummary,
} from '@/types/production'

export function createProductionApi(client: AxiosInstance) {
  const request = createApiRequest(client)
  const action = async (
    id: string,
    name: 'submit' | 'approve' | 'release',
    version: number,
    idempotencyKey?: string,
  ) =>
    request.post<WorkOrder>(
      `/work-orders/${id}/${name}`,
      { version },
      withIdempotency({ method: 'post' }, idempotencyKey),
    )

  return {
    async convert(productionScheduleId: string, idempotencyKey?: string): Promise<WorkOrder> {
      return request.post<WorkOrder>(
        '/work-orders/from-schedule',
        { productionScheduleId },
        withIdempotency({ method: 'post' }, idempotencyKey),
      )
    },
    async list(page = 0, size = 20): Promise<PageResponse<WorkOrderSummary>> {
      return request.get<PageResponse<WorkOrderSummary>>('/work-orders', {
        params: { page, size },
      })
    },
    async get(id: string): Promise<WorkOrder> {
      return request.get<WorkOrder>(`/work-orders/${id}`)
    },
    async reports(id: string, page = 0, size = 20): Promise<PageResponse<ProductionReport>> {
      return request.get<PageResponse<ProductionReport>>(`/work-orders/${id}/reports`, {
        params: { page, size },
      })
    },
    submit: (id: string, version: number, key?: string): Promise<WorkOrder> =>
      action(id, 'submit', version, key),
    approve: (id: string, version: number, key?: string): Promise<WorkOrder> =>
      action(id, 'approve', version, key),
    release: (id: string, version: number, key?: string): Promise<WorkOrder> =>
      action(id, 'release', version, key),
    async report(
      id: string,
      input: ProductionReportInput,
      idempotencyKey?: string,
    ): Promise<WorkOrder> {
      return request.post<WorkOrder>(
        `/work-orders/${id}/reports`,
        input,
        withIdempotency({ method: 'post' }, idempotencyKey),
      )
    },
    async complete(
      id: string,
      input: ProductionCompletionInput,
      idempotencyKey?: string,
    ): Promise<ProductionCompletion> {
      return request.post<ProductionCompletion>(
        `/work-orders/${id}/complete`,
        input,
        withIdempotency({ method: 'post' }, idempotencyKey),
      )
    },
  }
}
