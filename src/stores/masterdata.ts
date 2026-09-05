import { defineStore } from 'pinia'
import { masterDataApi } from '@/api/masterdata'
import type { MasterDataRecord, MasterDataType } from '@/types/masterdata'
import { emptyFailure, toFailure, type RequestFailure } from './failure'
import { bindStoreToTenant } from './tenantReset'

export const useMasterDataStore = defineStore('masterdata', {
  state: () => ({
    activeType: 'organizations' as MasterDataType,
    rows: [] as MasterDataRecord[],
    loading: false,
    total: 0,
    page: 1,
    size: 20,
    query: '',
    active: 'enabled' as 'all' | 'enabled' | 'disabled',
    failure: emptyFailure() as RequestFailure,
    requestGeneration: 0,
  }),
  actions: {
    async load(): Promise<void> {
      const generation = ++this.requestGeneration
      const requestedType = this.activeType
      this.loading = true
      this.failure = emptyFailure()
      try {
        const result = await masterDataApi.list(requestedType, {
          page: this.page - 1,
          size: this.size,
          sort: 'code,asc',
          ...(this.active === 'all' ? {} : { active: this.active === 'enabled' }),
          ...(this.query ? { query: this.query } : {}),
        })
        if (generation !== this.requestGeneration || this.activeType !== requestedType) return
        this.rows = result.content
        this.total = result.totalElements
      } catch (error) {
        if (generation !== this.requestGeneration || this.activeType !== requestedType) return
        this.failure = toFailure(error, '基础资料加载失败')
      } finally {
        if (generation === this.requestGeneration) this.loading = false
      }
    },
    async selectType(type: MasterDataType): Promise<void> {
      this.activeType = type
      this.page = 1
      await this.load()
    },
  },
})

bindStoreToTenant(useMasterDataStore)
