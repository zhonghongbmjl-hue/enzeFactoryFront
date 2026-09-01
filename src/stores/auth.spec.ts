import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { authApi } from '@/api/auth'
import { ApiClientError } from '@/api/http'
import { useAuthStore } from './auth'
import { registerTenantCache } from './tenantCache'

vi.mock('@/api/auth', () => ({
  authApi: { login: vi.fn(), me: vi.fn(), logout: vi.fn() },
}))

const loginResult = {
  accessToken: 'signed.jwt',
  tokenType: 'Bearer',
  expiresAt: '2099-08-23T12:00:00Z',
}
const profile = {
  userId: 'a8e88635-c2db-48ce-a384-fec40cd75cb4',
  username: 'planner',
  displayName: '生产计划员',
  tenantId: '7e179539-02b7-4190-bcad-83edcbb66a81',
  tenantCode: 'needle-one',
  roles: ['PRODUCTION_SUPERVISOR'],
  permissions: ['PRODUCTION_MANAGE'],
}
const otherTenantProfile = {
  ...profile,
  tenantId: '9f20640a-13c8-41ba-918c-58ab75f7b913',
  tenantCode: 'needle-two',
}
const FUTURE_EXPIRY = '2099-08-23T12:00:00Z'

function persistSession(overrides: Record<string, unknown> = {}): void {
  sessionStorage.setItem(
    'garment.auth',
    JSON.stringify({
      schemaVersion: 1,
      token: 'signed.jwt',
      expiresAt: FUTURE_EXPIRY,
      profile,
      authGeneration: 1,
      ...overrides,
    }),
  )
}

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(authApi.login).mockResolvedValue(loginResult)
    vi.mocked(authApi.me).mockResolvedValue(profile)
    vi.mocked(authApi.logout).mockResolvedValue(undefined)
  })

  it('submits tenant code and loads the server profile after login', async () => {
    const auth = useAuthStore()
    await auth.login({
      tenantCode: 'needle-one',
      username: 'planner',
      password: 'workshop-123',
    })
    expect(authApi.login).toHaveBeenCalledWith({
      tenantCode: 'needle-one',
      username: 'planner',
      password: 'workshop-123',
    })
    expect(authApi.me).toHaveBeenCalledOnce()
    expect(auth.profile).toEqual(profile)
    const persisted = sessionStorage.getItem('garment.auth')
    expect(persisted).not.toContain('workshop-123')
    expect(JSON.parse(persisted ?? '{}')).toMatchObject({
      schemaVersion: 1,
      token: 'signed.jwt',
      expiresAt: FUTURE_EXPIRY,
      profile,
    })
  })

  it('clears persisted prior-tenant caches before committing a login for another tenant', async () => {
    const cleaner = vi.fn()
    const unregister = registerTenantCache(cleaner)
    persistSession()
    sessionStorage.setItem('garment.tenant.orders', 'old-orders')
    localStorage.setItem('garment.tenant.filters', 'old-filters')
    sessionStorage.setItem('garment.operator.layout', 'compact')
    vi.mocked(authApi.me).mockResolvedValue(otherTenantProfile)
    const auth = useAuthStore()

    await auth.login({
      tenantCode: 'needle-two',
      username: 'planner',
      password: 'workshop-123',
    })

    expect(cleaner).toHaveBeenCalledOnce()
    expect(sessionStorage.getItem('garment.tenant.orders')).toBeNull()
    expect(localStorage.getItem('garment.tenant.filters')).toBeNull()
    expect(sessionStorage.getItem('garment.operator.layout')).toBe('compact')
    expect(auth.profile).toEqual(otherTenantProfile)
    expect(JSON.parse(sessionStorage.getItem('garment.auth') ?? '{}').profile).toEqual(
      otherTenantProfile,
    )
    unregister()
  })

  it('clears in-memory prior-tenant caches before committing a login for another tenant', async () => {
    const cleaner = vi.fn()
    const unregister = registerTenantCache(cleaner)
    const auth = useAuthStore()
    auth.token = 'old.signed.jwt'
    auth.profile = profile
    auth.sessionStatus = 'restored'
    sessionStorage.setItem('garment.tenant.orders', 'old-orders')
    vi.mocked(authApi.me).mockResolvedValue(otherTenantProfile)

    await auth.login({
      tenantCode: 'needle-two',
      username: 'planner',
      password: 'workshop-123',
    })

    expect(cleaner).toHaveBeenCalledOnce()
    expect(sessionStorage.getItem('garment.tenant.orders')).toBeNull()
    expect(auth.token).toBe('signed.jwt')
    expect(auth.profile).toEqual(otherTenantProfile)
    unregister()
  })

  it('clears tenant caches when the same user logs in again with a new auth generation', async () => {
    const cleaner = vi.fn()
    const unregister = registerTenantCache(cleaner)
    persistSession()
    sessionStorage.setItem('garment.tenant.orders', 'same-tenant-orders')
    const auth = useAuthStore()

    await auth.login({
      tenantCode: 'needle-one',
      username: 'planner',
      password: 'workshop-123',
    })

    expect(cleaner).toHaveBeenCalledOnce()
    expect(sessionStorage.getItem('garment.tenant.orders')).toBeNull()
    unregister()
  })

  it('clears token, profile and tenant cache even if remote logout fails', async () => {
    const cleaner = vi.fn()
    const unregister = registerTenantCache(cleaner)
    vi.mocked(authApi.logout).mockRejectedValue(new Error('offline'))
    const auth = useAuthStore()
    auth.token = 'signed.jwt'
    auth.profile = profile
    const result = await auth.logout()
    expect(result.remoteSucceeded).toBe(false)
    expect(auth.token).toBeNull()
    expect(auth.profile).toBeNull()
    expect(cleaner).toHaveBeenCalledOnce()
    unregister()
  })

  it('clears the prior tenant cache when tenant changes', () => {
    const cleaner = vi.fn()
    const unregister = registerTenantCache(cleaner)
    const auth = useAuthStore()
    auth.token = 'signed.jwt'
    auth.profile = profile
    sessionStorage.setItem('garment.auth', 'persisted-auth-session')
    sessionStorage.setItem('garment.tenant.orders', 'orders')
    sessionStorage.setItem('garment.tenant.inventory', 'inventory')
    localStorage.setItem('garment.tenant.filters', 'filters')
    localStorage.setItem('garment.tenant.drafts', 'drafts')
    sessionStorage.setItem('garment.operator.layout', 'compact')
    localStorage.setItem('other-site.preference', 'keep-me')

    auth.switchTenant('needle-two')

    expect(cleaner).toHaveBeenCalledOnce()
    expect(auth.token).toBeNull()
    expect(auth.profile).toBeNull()
    expect(sessionStorage.getItem('garment.auth')).toBeNull()
    expect(sessionStorage.getItem('garment.tenant.orders')).toBeNull()
    expect(sessionStorage.getItem('garment.tenant.inventory')).toBeNull()
    expect(localStorage.getItem('garment.tenant.filters')).toBeNull()
    expect(localStorage.getItem('garment.tenant.drafts')).toBeNull()
    expect(sessionStorage.getItem('garment.operator.layout')).toBe('compact')
    expect(localStorage.getItem('other-site.preference')).toBe('keep-me')
    unregister()
  })

  it('restores only a complete session from sessionStorage', () => {
    persistSession()
    const auth = useAuthStore()
    auth.restoreSession()
    expect(auth.sessionStatus).toBe('restored')
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.profile?.tenantCode).toBe('needle-one')
  })

  it('rejects an expired restored session before server validation', () => {
    persistSession({ expiresAt: '2026-08-23T00:00:00Z' })
    const auth = useAuthStore()
    auth.restoreSession(Date.parse('2026-08-23T00:01:00Z'))
    expect(auth.sessionStatus).toBe('anonymous')
    expect(auth.token).toBeNull()
    expect(sessionStorage.getItem('garment.auth')).toBeNull()
  })

  it('validates a restored session with /auth/me before authenticating it', async () => {
    persistSession()
    const auth = useAuthStore()
    auth.restoreSession()

    const result = await auth.validateRestoredSession()

    expect(result).toBe('valid')
    expect(authApi.me).toHaveBeenCalledOnce()
    expect(auth.sessionStatus).toBe('authenticated')
    expect(auth.isAuthenticated).toBe(true)
  })

  it('fails safely when /auth/me changes the tenant of a restored session', async () => {
    const cleaner = vi.fn()
    const unregister = registerTenantCache(cleaner)
    persistSession()
    sessionStorage.setItem('garment.tenant.orders', 'old-orders')
    localStorage.setItem('garment.tenant.filters', 'old-filters')
    vi.mocked(authApi.me).mockResolvedValue(otherTenantProfile)
    const auth = useAuthStore()
    auth.restoreSession()

    await expect(auth.validateRestoredSession()).resolves.toBe('anonymous')

    expect(auth.sessionStatus).toBe('anonymous')
    expect(auth.token).toBeNull()
    expect(auth.profile).toBeNull()
    expect(auth.sessionValidationMessage).toContain('会话')
    expect(cleaner).toHaveBeenCalledOnce()
    expect(sessionStorage.getItem('garment.auth')).toBeNull()
    expect(sessionStorage.getItem('garment.tenant.orders')).toBeNull()
    expect(localStorage.getItem('garment.tenant.filters')).toBeNull()
    unregister()
  })

  it('uses one in-flight /auth/me request for concurrent restored-session checks', async () => {
    let resolveMe: ((value: typeof profile) => void) | undefined
    vi.mocked(authApi.me).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveMe = resolve
        }),
    )
    persistSession()
    const auth = useAuthStore()
    auth.restoreSession()

    const first = auth.validateRestoredSession()
    const second = auth.validateRestoredSession()
    await vi.waitFor(() => expect(authApi.me).toHaveBeenCalledOnce())
    resolveMe?.(profile)

    await expect(Promise.all([first, second])).resolves.toEqual(['valid', 'valid'])
    expect(authApi.me).toHaveBeenCalledOnce()
  })

  it('clears a restored session rejected by the server', async () => {
    vi.mocked(authApi.me).mockRejectedValue(
      new ApiClientError('登录凭证已过期', 'TOKEN_EXPIRED', 'trace-expired'),
    )
    persistSession()
    const auth = useAuthStore()
    auth.restoreSession()

    await expect(auth.validateRestoredSession()).resolves.toBe('anonymous')
    expect(auth.sessionStatus).toBe('anonymous')
    expect(auth.token).toBeNull()
    expect(sessionStorage.getItem('garment.auth')).toBeNull()
  })

  it('keeps a restored session blocked and retryable after a network error', async () => {
    vi.mocked(authApi.me).mockRejectedValue(
      new ApiClientError('系统暂时无法响应，请稍后重试', 'REQUEST_FAILED'),
    )
    persistSession()
    const auth = useAuthStore()
    auth.restoreSession()

    await expect(auth.validateRestoredSession()).resolves.toBe('retry')
    expect(auth.sessionStatus).toBe('validation-error')
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.token).toBe('signed.jwt')
    expect(sessionStorage.getItem('garment.auth')).not.toBeNull()
  })

  it('increments the in-memory generation for login and every clear boundary', async () => {
    const auth = useAuthStore()
    const initial = auth.generation
    await auth.login({ tenantCode: 'needle-one', username: 'planner', password: 'workshop-123' })
    expect(auth.generation).toBeGreaterThan(initial)
    const authenticatedGeneration = auth.generation
    auth.clearSession()
    expect(auth.generation).toBeGreaterThan(authenticatedGeneration)
    const clearedGeneration = auth.generation
    auth.switchTenant('needle-two')
    expect(auth.generation).toBeGreaterThan(clearedGeneration)
  })

  it('persists the auth generation so a reload keeps the same session scope', async () => {
    const auth = useAuthStore()
    auth.generation = 6
    await auth.login({ tenantCode: 'needle-one', username: 'planner', password: 'workshop-123' })
    const authenticatedGeneration = auth.generation
    expect(JSON.parse(sessionStorage.getItem('garment.auth') ?? '{}').authGeneration).toBe(
      authenticatedGeneration,
    )

    setActivePinia(createPinia())
    const restored = useAuthStore()
    restored.restoreSession()
    expect(restored.generation).toBe(authenticatedGeneration)
  })

  it.each([
    ['legacy envelope', { token: 'signed.jwt', profile }],
    ['future schema', { schemaVersion: 2, token: 'signed.jwt', profile }],
    [
      'missing auth generation',
      { schemaVersion: 1, token: 'signed.jwt', expiresAt: FUTURE_EXPIRY, profile },
    ],
    ['missing expiry', { schemaVersion: 1, token: 'signed.jwt', profile }],
    ['invalid expiry', { schemaVersion: 1, token: 'signed.jwt', expiresAt: 'tomorrow', profile }],
    [
      'empty display name',
      { schemaVersion: 1, token: 'signed.jwt', profile: { ...profile, displayName: '' } },
    ],
    [
      'oversized display name',
      {
        schemaVersion: 1,
        token: 'signed.jwt',
        profile: { ...profile, displayName: '工'.repeat(129) },
      },
    ],
    [
      'invalid user id',
      { schemaVersion: 1, token: 'signed.jwt', profile: { ...profile, userId: '1' } },
    ],
    [
      'invalid tenant id',
      { schemaVersion: 1, token: 'signed.jwt', profile: { ...profile, tenantId: null } },
    ],
    [
      'invalid tenant code',
      {
        schemaVersion: 1,
        token: 'signed.jwt',
        profile: { ...profile, tenantCode: 'Needle One' },
      },
    ],
    [
      'invalid username',
      { schemaVersion: 1, token: 'signed.jwt', profile: { ...profile, username: {} } },
    ],
    [
      'roles contain object',
      {
        schemaVersion: 1,
        token: 'signed.jwt',
        profile: { ...profile, roles: ['ADMIN', { code: 'PLANNER' }] },
      },
    ],
    [
      'roles are null',
      { schemaVersion: 1, token: 'signed.jwt', profile: { ...profile, roles: null } },
    ],
    [
      'permissions contain null',
      {
        schemaVersion: 1,
        token: 'signed.jwt',
        profile: { ...profile, permissions: ['ORDER_VIEW', null] },
      },
    ],
    [
      'invalid permission code',
      {
        schemaVersion: 1,
        token: 'signed.jwt',
        profile: { ...profile, permissions: ['<script>'] },
      },
    ],
  ])('fails safely for a damaged persisted session: %s', (label, envelope) => {
    const persistedEnvelope =
      label === 'missing expiry' ? envelope : { expiresAt: FUTURE_EXPIRY, ...envelope }
    sessionStorage.setItem('garment.auth', JSON.stringify(persistedEnvelope))
    const auth = useAuthStore()
    auth.token = 'stale.jwt'
    auth.profile = profile

    expect(() => auth.restoreSession()).not.toThrow()
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.token).toBeNull()
    expect(auth.profile).toBeNull()
    expect(sessionStorage.getItem('garment.auth')).toBeNull()
  })

  it('clears live authentication when persisted JSON is malformed', () => {
    sessionStorage.setItem('garment.auth', '{not-json')
    const auth = useAuthStore()
    auth.token = 'stale.jwt'
    auth.profile = profile

    expect(() => auth.restoreSession()).not.toThrow()
    expect(auth.isAuthenticated).toBe(false)
    expect(sessionStorage.getItem('garment.auth')).toBeNull()
  })
})
