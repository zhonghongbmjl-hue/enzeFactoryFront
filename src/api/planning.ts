import type { AxiosInstance } from 'axios'
import { http, withIdempotency } from './http'
import type { ApiResponse } from '@/types/auth'
import type { CreateProductionPlanInput, ProductionPlan } from '@/types/planning'

export function createPlanningApi(client: AxiosInstance) {
  return {
    async create(
      input: CreateProductionPlanInput,
      idempotencyKey?: string,
    ): Promise<ProductionPlan> {
      return (
        await client.post<ApiResponse<ProductionPlan>>(
          '/production-plans',
          input,
          withIdempotency({ method: 'post' }, idempotencyKey),
        )
      ).data.data
    },
    async get(id: string): Promise<ProductionPlan> {
      return (await client.get<ApiResponse<ProductionPlan>>(`/production-plans/${id}`)).data.data
    },
    async approve(id: string, version: number): Promise<ProductionPlan> {
      return (
        await client.post<ApiResponse<ProductionPlan>>(`/production-plans/${id}/approve`, {
          version,
        })
      ).data.data
    },
  }
}

export const planningApi = createPlanningApi(http)
