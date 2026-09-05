import { defineStore } from 'pinia'
import { productionApi } from '@/api/production'
import type { WorkOrderSummary } from '@/types/production'
import { bindStoreToTenant } from './tenantReset'

export const WORK_ORDER_PAGE_SIZE = 20

export const useWorkOrderListStore = defineStore('workOrders', {
  state: () => ({
    rows: [] as WorkOrderSummary[],
    loading: false,
    errorMessage: '',
    page: 0,
    totalPages: 0,
    totalElements: 0,
    requestGeneration: 0,
  }),
  actions: {
    async load(targetPage?: number): Promise<void> {
      const generation = ++this.requestGeneration
      const page = targetPage ?? this.page
      this.loading = true
      this.errorMessage = ''
      try {
        const result = await productionApi.list(page, WORK_ORDER_PAGE_SIZE)
        if (generation !== this.requestGeneration) return
        this.rows = result.content
        this.page = result.page
        this.totalPages = result.totalPages
        this.totalElements = result.totalElements
      } catch (error) {
        if (generation !== this.requestGeneration) return
        this.errorMessage = error instanceof Error ? error.message : '工单列表加载失败'
      } finally {
        if (generation === this.requestGeneration) this.loading = false
      }
    },
  },
})

bindStoreToTenant(useWorkOrderListStore)
