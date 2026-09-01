import { describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Router } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { registerTenantCache } from '@/stores/tenantCache'
import { createUnauthorizedHandler } from './authBoundary'

describe('401 application boundary', () => {
  it('clears JWT, profile and tenant caches before redirecting to login', () => {
    setActivePinia(createPinia())
    const auth = useAuthStore()
    auth.token = 'expired.jwt'
    auth.profile = {
      userId: 'a8e88635-c2db-48ce-a384-fec40cd75cb4',
      username: 'planner',
      displayName: '生产计划员',
      tenantId: '7e179539-02b7-4190-bcad-83edcbb66a81',
      tenantCode: 'needle-one',
      roles: [],
      permissions: [],
    }
    const cleaner = vi.fn()
    const unregister = registerTenantCache(cleaner)
    sessionStorage.setItem('garment.auth', 'persisted-auth-session')
    sessionStorage.setItem('garment.tenant.orders', 'orders')
    sessionStorage.setItem('garment.tenant.inventory', 'inventory')
    localStorage.setItem('garment.tenant.filters', 'filters')
    localStorage.setItem('garment.tenant.drafts', 'drafts')
    sessionStorage.setItem('garment.operator.layout', 'compact')
    localStorage.setItem('other-site.preference', 'keep-me')
    const replace = vi.fn()
    const router = {
      currentRoute: { value: { fullPath: '/production?line=A' } },
      replace,
    } as unknown as Pick<Router, 'currentRoute' | 'replace'>

    createUnauthorizedHandler(auth, router)(auth.generation)

    expect(auth.token).toBeNull()
    expect(auth.profile).toBeNull()
    expect(cleaner).toHaveBeenCalledOnce()
    expect(sessionStorage.getItem('garment.auth')).toBeNull()
    expect(sessionStorage.getItem('garment.tenant.orders')).toBeNull()
    expect(sessionStorage.getItem('garment.tenant.inventory')).toBeNull()
    expect(localStorage.getItem('garment.tenant.filters')).toBeNull()
    expect(localStorage.getItem('garment.tenant.drafts')).toBeNull()
    expect(sessionStorage.getItem('garment.operator.layout')).toBe('compact')
    expect(localStorage.getItem('other-site.preference')).toBe('keep-me')
    expect(replace).toHaveBeenCalledWith({
      name: 'login',
      query: { returnTo: '/production?line=A' },
    })
    unregister()
  })

  it('does not clear or navigate for an older request generation', () => {
    setActivePinia(createPinia())
    const auth = useAuthStore()
    auth.token = 'new.jwt'
    auth.generation = 12
    const replace = vi.fn()
    const clearSession = vi.spyOn(auth, 'clearSession')
    const router = {
      currentRoute: { value: { fullPath: '/production' } },
      replace,
    } as unknown as Pick<Router, 'currentRoute' | 'replace'>

    createUnauthorizedHandler(auth, router)(11)

    expect(clearSession).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
    expect(auth.token).toBe('new.jwt')
  })
})
