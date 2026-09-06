import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'
import { useAuthStore } from '@/stores/auth'
import AdminLayout from './AdminLayout.vue'

describe('管理台菜单权限', () => {
  it('路由切换后将焦点移到原生主内容区域', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div>首页</div>' } },
        { path: '/orders', component: { template: '<div>订单</div>' } },
      ],
    })
    await router.push('/')
    await router.isReady()
    const wrapper = mount(AdminLayout, {
      attachTo: document.body,
      global: { plugins: [pinia, router] },
    })

    await router.push('/orders')
    await wrapper.vm.$nextTick()

    expect(document.activeElement).toBe(wrapper.get('#main-content').element)
    wrapper.unmount()
  })

  it('仅有售后管理权限时仍显示直属售后待办入口且不显示订单入口', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
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

    expect(wrapper.get('[aria-label="售后待办"]').exists()).toBe(true)
    expect(wrapper.find('.el-menu-item-group__title').exists()).toBe(false)
    expect(wrapper.find('[aria-label="订单履约"]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="包装发运与售后（按订单进入）"]').exists()).toBe(false)
  })

  it('窄屏使用可关闭的完整导航抽屉', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 })
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    auth.profile = {
      userId: '66666666-6666-4666-8666-666666666666',
      username: 'planner',
      displayName: '计划员',
      tenantId: '55555555-5555-4555-8555-555555555555',
      tenantCode: 'factory-a',
      roles: ['PLANNER'],
      permissions: ['ORDER_VIEW', 'PRODUCTION_MANAGE'],
    }
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<h1>主页</h1>' } }],
    })
    await router.push('/')
    await router.isReady()
    const wrapper = mount(AdminLayout, { global: { plugins: [pinia, router] } })

    const trigger = wrapper.get('[aria-label="打开主导航"]')
    expect(trigger.attributes('aria-expanded')).toBe('false')
    await trigger.trigger('click')
    expect(trigger.attributes('aria-expanded')).toBe('true')
    expect(document.body.querySelector('[aria-label="生产排产"]')).not.toBeNull()
    const close = document.body.querySelector('[aria-label="关闭主导航"]') as HTMLButtonElement
    close.click()
    await wrapper.vm.$nextTick()
    expect(trigger.attributes('aria-expanded')).toBe('false')
  })
})
