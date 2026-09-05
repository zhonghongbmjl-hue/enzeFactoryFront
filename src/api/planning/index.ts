import type { AxiosInstance } from 'axios'
import { createApiRequest, http, withIdempotency } from '../http'
import type { CreateProductionPlanInput, ProductionPlan } from '@/types/planning'

export function createPlanningApi(client: AxiosInstance) {
  const request = createApiRequest(client)
  return {
    async create(
      input: CreateProductionPlanInput,
      idempotencyKey?: string,
    ): Promise<ProductionPlan> {
      return request.post<ProductionPlan>(
        '/production-plans',
        input,
        withIdempotency({ method: 'post' }, idempotencyKey),
      )
    },
    async get(id: string): Promise<ProductionPlan> {
      return request.get<ProductionPlan>(`/production-plans/${id}`)
    },
    async approve(id: string, version: number): Promise<ProductionPlan> {
      return request.post<ProductionPlan>(`/production-plans/${id}/approve`, { version })
    },
  }
}

export const planningApi = createPlanningApi(http)
