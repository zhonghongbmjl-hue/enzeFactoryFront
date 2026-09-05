import type { AxiosInstance } from 'axios'
import { createApiRequest, http } from '../http'
import type { OrderControlTowerPage } from '@/types/dashboard'

export function createDashboardApi(client: AxiosInstance) {
  const request = createApiRequest(client)
  return {
    async orderControlTower(params: {
      page: number
      size: number
    }): Promise<OrderControlTowerPage> {
      return request.get<OrderControlTowerPage>('/dashboard/order-control-tower', { params })
    },
  }
}

export const dashboardApi = createDashboardApi(http)
