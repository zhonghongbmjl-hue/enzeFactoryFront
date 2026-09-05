import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dashboardApi } from '@/api/dashboard'
import OrderControlTowerView from './OrderControlTowerView.vue'

vi.mock('@/api/dashboard', () => ({
  dashboardApi: { orderControlTower: vi.fn() },
}))

const rows = [
  {
    orderId: '11111111-1111-4111-8111-111111111111',
    orderNo: 'PO-2026-001',
    customerName: '华东客户',
    deliveryDate: '2026-08-29',
    status: 'IN_PRODUCTION',
    procurementPercent: 75,
    fabricKittingPercent: 100,
    accessoryKittingPercent: 80,
    overallKittingPercent: 90,
    productionPercent: 60,
    selfInspectionStatus: 'PASSED',
    frozenImageCount: 3,
    correctionCount: 1,
    lastSelfInspectionAt: '2026-08-27T08:00:00Z',
    qualityPassRate: 96.5,
    reworkRate: 3.5,
    shipmentPercent: 20,
    deliveryRisk: 'HIGH',
  },
  {
    orderId: '22222222-2222-4222-8222-222222222222',
    orderNo: 'PO-2026-002',
    customerName: '华南客户',
    deliveryDate: '2026-08-20',
    status: 'MATERIAL_PREPARING',
    procurementPercent: 40,
    fabricKittingPercent: 60,
    accessoryKittingPercent: 20,
    overallKittingPercent: 40,
    productionPercent: 0,
    selfInspectionStatus: 'NOT_STARTED',
    frozenImageCount: 0,
    correctionCount: 0,
    lastSelfInspectionAt: null,
    qualityPassRate: 0,
    reworkRate: 0,
    shipmentPercent: 0,
    deliveryRisk: 'OVERDUE',
  },
] as const

describe('订单履约控制塔', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(dashboardApi.orderControlTower).mockResolvedValue({
      content: [...rows],
      totalElements: 22,
      totalPages: 2,
      page: 0,
      size: 20,
    })
  })

  it('一张订单卡聚合采购、齐套、自检、质检、返工和发运指标', async () => {
    const wrapper = mount(OrderControlTowerView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()

    expect(wrapper.get('h1').text()).toBe('订单履约控制塔')
    expect(wrapper.get('.order-card-grid').exists()).toBe(true)
    const first = wrapper.get('[data-testid="order-progress-PO-2026-001"]')
    expect(first.classes()).toContain('risk-high')
    expect(first.text()).toMatch(/采购\s*75%/)
    expect(first.text()).toContain('面料 100%')
    expect(first.text()).toContain('辅料 80%')
    expect(first.text()).toContain('总体 90%')
    expect(first.text()).toContain('自检通过')
    expect(first.text()).toContain('冻结图 3')
    expect(first.text()).toContain('纠正 1')
    expect(first.text()).toContain('质检通过率 96.50%')
    expect(first.text()).toContain('返工率 3.50%')
    expect(first.text()).toMatch(/发运\s*20%/)
    expect(first.text()).toContain('高风险')
    expect(wrapper.get('.tower-pagination').text()).toContain('第 1 / 2 页')
  })

  it('分页按后端页号刷新且失败时显示可重试错误', async () => {
    const wrapper = mount(OrderControlTowerView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()
    expect(dashboardApi.orderControlTower).toHaveBeenCalledWith({ page: 0, size: 20 })

    vi.mocked(dashboardApi.orderControlTower).mockRejectedValueOnce({
      message: '控制塔暂时不可用',
      traceId: 'trace-dashboard',
    })
    await wrapper.get('.btn-next').trigger('click')
    await flushPromises()
    expect(dashboardApi.orderControlTower).toHaveBeenLastCalledWith({ page: 1, size: 20 })
    expect(wrapper.get('[role="alert"]').text()).toContain('控制塔暂时不可用')
    expect(wrapper.get('[role="alert"]').text()).toContain('trace-dashboard')
    expect(wrapper.get('.tower-pagination').text()).toContain('第 1 / 2 页')

    vi.mocked(dashboardApi.orderControlTower).mockResolvedValueOnce({
      content: [],
      totalElements: 22,
      totalPages: 2,
      page: 0,
      size: 20,
    })
    await wrapper.get('[data-testid="retry-control-tower"]').trigger('click')
    await flushPromises()
    expect(dashboardApi.orderControlTower).toHaveBeenLastCalledWith({ page: 0, size: 20 })
    expect(wrapper.text()).toContain('第 1 / 2 页')
  })
})
