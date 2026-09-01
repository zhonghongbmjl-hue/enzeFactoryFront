import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'
import { useAuthStore } from '@/stores/auth'
import AdminLayout from './AdminLayout.vue'

describe('管理台菜单权限', () => {
  it('仅有售后管理权限时仍显示直属售后待办入口且不显示订单入口', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    auth.profile = {
      userId: '66666666-6666-4666-8666-666666666666',
      username: 'after-sales-manager',
      displayName: '售后主管',
      tenantId: '55555555-5555-4555-8555-555555555555',
      tenantCode: 'factory-a',
      roles: ['AFTER_SALES'],
      permissions: ['AFTER_SALES_MANAGE'],
    }
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    })
    await router.push('/')
    await router.isReady()
    const wrapper = mount(AdminLayout, { global: { plugins: [pinia, router] } })

    expect(wrapper.get('a[aria-label="售后待办"]').attributes('href')).toBe('/after-sales')
    expect(wrapper.find('a[aria-label="订单履约"]').exists()).toBe(false)
    expect(wrapper.find('a[aria-label="包装发运与售后（按订单进入）"]').exists()).toBe(false)
  })
})
