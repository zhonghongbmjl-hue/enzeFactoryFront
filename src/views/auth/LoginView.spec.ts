import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory } from 'vue-router'
import { createApplicationRouter } from '@/router'
import { useAuthStore } from '@/stores/auth'
import { ApiClientError } from '@/api/http'
import LoginView from './LoginView.vue'

describe('LoginView', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('submits all credentials and follows a safe return path', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createApplicationRouter(pinia, createMemoryHistory())
    await router.push('/login?returnTo=/production')
    const auth = useAuthStore()
    const login = vi.spyOn(auth, 'login').mockImplementation(async () => {
      auth.token = 'signed.jwt'
      auth.profile = {
        userId: 'a8e88635-c2db-48ce-a384-fec40cd75cb4',
        username: 'planner',
        displayName: '生产计划员',
        tenantId: '7e179539-02b7-4190-bcad-83edcbb66a81',
        tenantCode: 'needle-one',
        roles: ['PRODUCTION_SUPERVISOR'],
        permissions: ['PRODUCTION_MANAGE'],
      }
      auth.sessionStatus = 'authenticated'
    })
    const wrapper = mount(LoginView, { global: { plugins: [pinia, router] } })
    await wrapper.get('[name="tenantCode"]').setValue('needle-one')
    await wrapper.get('[name="username"]').setValue('planner')
    await wrapper.get('[name="password"]').setValue('workshop-123')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/production'))
    expect(login).toHaveBeenCalledWith({
      tenantCode: 'needle-one',
      username: 'planner',
      password: 'workshop-123',
    })
  })

  it('shows a public login message and trace ID after failure', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createApplicationRouter(pinia, createMemoryHistory())
    await router.push('/login')
    vi.spyOn(useAuthStore(), 'login').mockRejectedValue(
      new ApiClientError('租户、账号或密码不正确', 'AUTHENTICATION_FAILED', 'trace-login-9'),
    )
    const wrapper = mount(LoginView, { global: { plugins: [pinia, router] } })
    await wrapper.get('[name="tenantCode"]').setValue('needle-one')
    await wrapper.get('[name="username"]').setValue('planner')
    await wrapper.get('[name="password"]').setValue('bad-password')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.text()).toContain('租户、账号或密码不正确'))
    expect(wrapper.text()).toContain('trace-login-9')
    expect(wrapper.text()).not.toContain('bad-password')
  })

  it('shows the fail-safe notice after a restored session reports another tenant', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createApplicationRouter(pinia, createMemoryHistory())
    await router.push('/login')
    const auth = useAuthStore()
    auth.sessionValidationMessage = '会话租户信息无效，请重新登录'

    const wrapper = mount(LoginView, { global: { plugins: [pinia, router] } })

    expect(wrapper.get('[role="alert"]').text()).toContain('会话租户信息无效')
  })

  it('uses a tenant-code pattern that compiles with browser Unicode Sets semantics', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createApplicationRouter(pinia, createMemoryHistory())
    await router.push('/login')
    const wrapper = mount(LoginView, { global: { plugins: [pinia, router] } })
    const pattern = wrapper.get('[name="tenantCode"]').attributes('pattern')

    expect(() => new RegExp(`^(?:${pattern})$`, 'v')).not.toThrow()
  })
})
