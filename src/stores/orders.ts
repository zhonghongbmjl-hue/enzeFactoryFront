import { defineStore } from 'pinia'
import { salesOrderApi } from '@/api/orders'
import type { OrderStatus, SalesOrder } from '@/types/order'
import { emptyFailure, toFailure, type RequestFailure } from './failure'
import { bindStoreToTenant } from './tenantReset'

export const useOrderListStore = defineStore('orders', {
  state: () => ({
    rows: [] as SalesOrder[],
    loading: false,
    page: 1,
    size: 20,
    total: 0,
    query: '',
    status: 'ALL' as 'ALL' | OrderStatus,
    failure: emptyFailure() as RequestFailure,
    requestGeneration: 0,
  }),
  actions: {
    async load(): Promise<void> {
      const generation = ++this.requestGeneration
      this.loading = true
      this.failure = emptyFailure()
      try {
        const result = await salesOrderApi.list({
          page: this.page - 1,
          size: this.size,
          ...(this.query.trim() ? { query: this.query.trim() } : {}),
          ...(this.status !== 'ALL' ? { status: this.status } : {}),
        })
        if (generation !== this.requestGeneration) return
        this.rows = result.content
        this.total = result.totalElements
      } catch (error) {
        if (generation !== this.requestGeneration) return
        this.failure = toFailure(error, '订单列表加载失败')
      } finally {
        if (generation === this.requestGeneration) this.loading = false
      }
    },
  },
})

bindStoreToTenant(useOrderListStore)
