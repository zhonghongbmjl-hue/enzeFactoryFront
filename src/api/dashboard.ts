import type { AxiosInstance } from 'axios'
import { http } from './http'
import type { ApiResponse } from '@/types/auth'
import type { OrderControlTowerPage } from '@/types/dashboard'

export function createDashboardApi(client: AxiosInstance) {
  return {
    async orderControlTower(params: {
      page: number
      size: number
    }): Promise<OrderControlTowerPage> {
      return (
        await client.get<ApiResponse<OrderControlTowerPage>>('/dashboard/order-control-tower', {
          params,
        })
      ).data.data
    },
  }
}

export const dashboardApi = createDashboardApi(http)
