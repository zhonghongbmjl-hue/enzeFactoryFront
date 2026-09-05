import { defineStore } from 'pinia'
import { productApi } from '@/api/products'
import type { Product, ProductStatus } from '@/types/product'
import { emptyFailure, toFailure, type RequestFailure } from './failure'
import { bindStoreToTenant } from './tenantReset'

export const useProductListStore = defineStore('products', {
  state: () => ({
    rows: [] as Product[],
    loading: false,
    page: 1,
    size: 20,
    total: 0,
    query: '',
    status: 'ALL' as 'ALL' | ProductStatus,
    failure: emptyFailure() as RequestFailure,
    requestGeneration: 0,
  }),
  actions: {
    async load(): Promise<void> {
      const generation = ++this.requestGeneration
      this.loading = true
      this.failure = emptyFailure()
      try {
        const result = await productApi.list({
          page: this.page - 1,
          size: this.size,
          sort: 'styleNo,asc',
          ...(this.query ? { query: this.query } : {}),
          ...(this.status !== 'ALL' ? { status: this.status } : {}),
        })
        if (generation !== this.requestGeneration) return
        this.rows = result.content
        this.total = result.totalElements
      } catch (error) {
        if (generation !== this.requestGeneration) return
        this.failure = toFailure(error, '产品资料加载失败')
      } finally {
        if (generation === this.requestGeneration) this.loading = false
      }
    },
  },
})

bindStoreToTenant(useProductListStore)
