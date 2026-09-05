import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from './app'
import { useDashboardStore } from './dashboard'
import { useMasterDataStore } from './masterdata'
import { useOrderListStore } from './orders'
import { useProductListStore } from './products'
import { useWorkOrderListStore } from './workOrders'
import { clearTenantCaches } from './tenantCache'

describe('app store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('treats 1200px as desktop and closes the mobile drawer', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 })
    const app = useAppStore()
    app.syncViewport()
    expect(app.isDesktop).toBe(false)
    app.openNavigation()
    expect(app.navigationOpen).toBe(true)

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
    app.syncViewport()
    expect(app.isDesktop).toBe(true)
    expect(app.navigationOpen).toBe(false)
  })
})

describe('tenant-bound list stores', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('clears cached lists when the tenant session is reset', () => {
    const dashboard = useDashboardStore()
    const orders = useOrderListStore()
    const products = useProductListStore()
    const workOrders = useWorkOrderListStore()
    const masterdata = useMasterDataStore()

    dashboard.failure = 'stale tower'
    dashboard.page = 3
    orders.rows = [{ id: 'order-1' } as never]
    orders.query = 'PO-1'
    products.query = 'STYLE'
    products.page = 4
    workOrders.errorMessage = 'stale work order'
    workOrders.page = 2
    masterdata.query = 'ORG'
    masterdata.activeType = 'factories'

    clearTenantCaches()

    expect(dashboard.failure).toBe('')
    expect(dashboard.page).toBe(0)
    expect(orders.rows).toEqual([])
    expect(orders.query).toBe('')
    expect(products.query).toBe('')
    expect(products.page).toBe(1)
    expect(workOrders.errorMessage).toBe('')
    expect(workOrders.page).toBe(0)
    expect(masterdata.query).toBe('')
    expect(masterdata.activeType).toBe('organizations')
  })
})
