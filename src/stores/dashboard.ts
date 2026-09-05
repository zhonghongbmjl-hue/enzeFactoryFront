import { defineStore } from 'pinia'
import { dashboardApi } from '@/api/dashboard'
import type { OrderControlTowerPage } from '@/types/dashboard'
import { bindStoreToTenant } from './tenantReset'

export const CONTROL_TOWER_PAGE_SIZE = 20

export const useDashboardStore = defineStore('dashboard', {
  state: () => ({
    result: undefined as OrderControlTowerPage | undefined,
    page: 0,
    loading: false,
    failure: '',
    traceId: '',
  }),
  actions: {
    async load(target?: number): Promise<void> {
      if (this.loading) return
      const page = target ?? this.page
      this.loading = true
      this.failure = ''
      this.traceId = ''
      try {
        this.result = await dashboardApi.orderControlTower({
          page,
          size: CONTROL_TOWER_PAGE_SIZE,
        })
        this.page = this.result.page
      } catch (error) {
        const candidate = error as { message?: string; traceId?: string }
        this.failure = candidate.message || '订单控制塔加载失败'
        this.traceId = candidate.traceId || ''
      } finally {
        this.loading = false
      }
    },
  },
})

bindStoreToTenant(useDashboardStore)
