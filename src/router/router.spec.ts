import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory } from 'vue-router'
import { createApplicationRouter, safeReturnTo } from './index'
import { useAuthStore } from '@/stores/auth'
import type { UserProfile } from '@/types/auth'

const profile = (permissions: string[] = []): UserProfile => ({
  userId: 'a8e88635-c2db-48ce-a384-fec40cd75cb4',
  username: 'planner',
  displayName: '生产计划员',
  tenantId: '7e179539-02b7-4190-bcad-83edcbb66a81',
  tenantCode: 'needle-one',
  roles: ['PRODUCTION_SUPERVISOR'],
  permissions,
})

describe('permission router', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('redirects anonymous users and keeps an internal returnTo', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createApplicationRouter(pinia, createMemoryHistory())
    await router.push('/production?line=A')
    await router.isReady()
    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.returnTo).toBe('/production?line=A')
  })

  it('allows authenticated users to visit a permitted route', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    auth.token = 'signed.jwt'
    auth.profile = profile(['PRODUCTION_MANAGE'])
    auth.sessionStatus = 'authenticated'
    const router = createApplicationRouter(pinia, createMemoryHistory())
    await router.push('/production')
    await router.isReady()
    expect(router.currentRoute.value.path).toBe('/production')
  })

  it('protects work-order list and detail routes with production permission', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    auth.token = 'signed.jwt'
    auth.profile = profile(['PRODUCTION_MANAGE'])
    auth.sessionStatus = 'authenticated'
    const router = createApplicationRouter(pinia, createMemoryHistory())

    for (const path of ['/work-orders', '/work-orders/11111111-1111-1111-1111-111111111111']) {
      await router.push(path)
      await router.isReady()
      expect(router.currentRoute.value.path).toBe(path)
      expect(router.currentRoute.value.meta.permissions).toEqual(['PRODUCTION_MANAGE'])
    }
  })

  it('sends authenticated users without permission to the 403 page', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    auth.token = 'signed.jwt'
    auth.profile = profile(['ORDER_VIEW'])
    auth.sessionStatus = 'authenticated'
    const router = createApplicationRouter(pinia, createMemoryHistory())
    await router.push('/production')
    await router.isReady()
    expect(router.currentRoute.value.name).toBe('forbidden')
  })

  it('protects the master-data route with view permission', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    auth.token = 'signed.jwt'
    auth.profile = profile(['MASTERDATA_VIEW'])
    auth.sessionStatus = 'authenticated'
    const router = createApplicationRouter(pinia, createMemoryHistory())
    await router.push('/master-data')
    await router.isReady()
    expect(router.currentRoute.value.name).toBe('master-data')
  })

  it('protects all product and BOM routes with PRODUCT_VIEW', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    auth.token = 'signed.jwt'
    auth.profile = profile(['PRODUCT_VIEW'])
    auth.sessionStatus = 'authenticated'
    const router = createApplicationRouter(pinia, createMemoryHistory())
    for (const path of [
      '/products',
      '/products/11111111-1111-1111-1111-111111111111',
      '/bom-versions/22222222-2222-2222-2222-222222222222',
    ]) {
      await router.push(path)
      await router.isReady()
      expect(router.currentRoute.value.meta.permissions).toEqual(['PRODUCT_VIEW'])
    }
  })

  it('protects order list and detail routes with ORDER_VIEW', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    auth.token = 'signed.jwt'
    auth.profile = profile(['ORDER_VIEW'])
    auth.sessionStatus = 'authenticated'
    const router = createApplicationRouter(pinia, createMemoryHistory())
    for (const path of ['/orders', '/orders/11111111-1111-1111-1111-111111111111']) {
      await router.push(path)
      await router.isReady()
      expect(router.currentRoute.value.meta.permissions).toEqual(['ORDER_VIEW'])
    }
  })

  it('protects the order procurement workspace with PROCUREMENT_VIEW', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    auth.token = 'signed.jwt'
    auth.profile = profile(['PROCUREMENT_VIEW'])
    auth.sessionStatus = 'authenticated'
    const router = createApplicationRouter(pinia, createMemoryHistory())

    await router.push('/procurement/11111111-1111-1111-1111-111111111111')
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('procurement-workspace')
    expect(router.currentRoute.value.meta.permissions).toEqual(['PROCUREMENT_VIEW'])
  })

  it('protects inventory and cutting-kitting workbenches with INVENTORY_MANAGE', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    auth.token = 'signed.jwt'
    auth.profile = profile(['INVENTORY_MANAGE'])
    auth.sessionStatus = 'authenticated'
    const router = createApplicationRouter(pinia, createMemoryHistory())

    for (const path of ['/inventory', '/cutting-kitting']) {
      await router.push(path)
      await router.isReady()
      expect(router.currentRoute.value.meta.permissions).toEqual(['INVENTORY_MANAGE'])
    }
  })

  it('protects the quality workspace with QUALITY_INSPECT', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    auth.token = 'signed.jwt'
    auth.profile = profile(['QUALITY_INSPECT'])
    auth.sessionStatus = 'authenticated'
    const router = createApplicationRouter(pinia, createMemoryHistory())

    await router.push('/quality')
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('quality')
    expect(router.currentRoute.value.meta.permissions).toEqual(['QUALITY_INSPECT'])
  })

  it('protects shipment and after-sales routes with shipment view permission', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    auth.token = 'signed.jwt'
    auth.profile = profile(['SHIPMENT_VIEW'])
    auth.sessionStatus = 'authenticated'
    const router = createApplicationRouter(pinia, createMemoryHistory())

    for (const path of ['/shipments/order-1', '/after-sales/case-1']) {
      await router.push(path)
      await router.isReady()
      expect(router.currentRoute.value.path).toBe(path)
      expect(router.currentRoute.value.meta.anyPermissions).toEqual([
        'SHIPMENT_VIEW',
        'AFTER_SALES_MANAGE',
      ])
    }

    auth.profile = profile(['AFTER_SALES_MANAGE'])
    await router.push('/shipments/order-2')
    expect(router.currentRoute.value.path).toBe('/shipments/order-2')
    await router.push('/after-sales/case-2')
    expect(router.currentRoute.value.path).toBe('/after-sales/case-2')
  })

  it('allows an after-sales manager without order view to open the tenant inbox', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    auth.token = 'signed.jwt'
    auth.profile = profile(['AFTER_SALES_MANAGE'])
    auth.sessionStatus = 'authenticated'
    const router = createApplicationRouter(pinia, createMemoryHistory())

    await router.push('/after-sales')
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('after-sales-inbox')
    expect(router.currentRoute.value.meta.permissions).toEqual(['AFTER_SALES_MANAGE'])
  })

  it('validates a restored session before opening a protected route', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    auth.token = 'signed.jwt'
    auth.profile = profile(['PRODUCTION_MANAGE'])
    auth.sessionStatus = 'restored'
    const validate = vi.spyOn(auth, 'validateRestoredSession').mockImplementation(async () => {
      auth.sessionStatus = 'authenticated'
      return 'valid'
    })
    const router = createApplicationRouter(pinia, createMemoryHistory())

    await router.push('/production')
    await router.isReady()

    expect(validate).toHaveBeenCalledOnce()
    expect(router.currentRoute.value.path).toBe('/production')
  })

  it('keeps a restored session on a retry page after network validation failure', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    auth.token = 'signed.jwt'
    auth.profile = profile(['PRODUCTION_MANAGE'])
    auth.sessionStatus = 'validation-error'
    const router = createApplicationRouter(pinia, createMemoryHistory())

    await router.push('/production?line=A')
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('session-check')
    expect(router.currentRoute.value.query.returnTo).toBe('/production?line=A')
    expect(auth.token).toBe('signed.jwt')
  })
})

describe('safe return path', () => {
  it.each(['https://attacker.example', '//attacker.example', 'javascript:alert(1)', '/login'])(
    'rejects unsafe returnTo %s',
    (value) => expect(safeReturnTo(value)).toBe('/'),
  )

  it('keeps an internal application path', () => {
    expect(safeReturnTo('/production?line=A')).toBe('/production?line=A')
  })
})
