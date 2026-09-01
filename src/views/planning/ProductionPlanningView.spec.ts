import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { planningApi } from '@/api/planning'
import ProductionPlanningView from './ProductionPlanningView.vue'

vi.mock('@/api/planning', () => ({
  planningApi: { create: vi.fn(), get: vi.fn(), approve: vi.fn() },
}))

describe('排产驾驶舱', () => {
  function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((accept) => {
      resolve = accept
    })
    return { promise, resolve }
  }

  const draftPlan = {
    id: 'plan-1',
    planNo: 'PLAN-PB-001',
    status: 'DRAFT' as const,
    version: 0,
    items: [
      {
        id: 'item-plan-1',
        productionPlanId: 'plan-1',
        salesOrderId: 'order-1',
        orderItemId: 'item-1',
        skuId: 'sku-1',
        quantity: '50.000000',
        schedule: {
          id: 'schedule-1',
          productionPlanItemId: 'item-plan-1',
          kittingReleaseId: 'release-1',
          factoryId: 'factory-1',
          workshopId: 'workshop-1',
          productionLineId: 'line-1',
          startDate: '2026-08-25',
          endDate: '2026-08-30',
          plannedBatchCode: 'PB-001',
          quantity: '50.000000',
          approvalStatus: 'DRAFT' as const,
          version: 0,
        },
      },
    ],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(planningApi.create).mockResolvedValue(draftPlan)
  })

  it('submits a manual schedule with string quantity and renders its approval gate', async () => {
    const wrapper = mount(ProductionPlanningView)
    const values: Record<string, string> = {
      orderId: 'order-1',
      orderItemId: 'item-1',
      skuId: 'sku-1',
      kittingReleaseId: 'release-1',
      factoryId: 'factory-1',
      workshopId: 'workshop-1',
      productionLineId: 'line-1',
      quantity: '50.000000',
      startDate: '2026-08-25',
      endDate: '2026-08-30',
      plannedBatchCode: 'PB-001',
    }
    for (const [name, value] of Object.entries(values)) {
      await wrapper.get(`[name="${name}"]`).setValue(value)
    }
    await wrapper.get('[data-testid="planning-form"]').trigger('submit')
    await flushPromises()

    expect(planningApi.create).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: '50.000000', plannedBatchCode: 'PB-001' }),
      expect.any(String),
    )
    expect(wrapper.text()).toContain('待审批')
    expect(wrapper.text()).toContain('仅已审批排程可下推工单')
  })

  it('clears a previously loaded plan before a failed load and cannot approve its stale id', async () => {
    vi.mocked(planningApi.get)
      .mockResolvedValueOnce(draftPlan)
      .mockRejectedValueOnce(new Error('读取失败'))
    const wrapper = mount(ProductionPlanningView)

    await wrapper.get('[aria-label="排产计划 ID"]').setValue('plan-1')
    await wrapper.get('.plan-query').trigger('submit')
    await flushPromises()
    expect(wrapper.find('.approve-action').exists()).toBe(true)

    await wrapper.get('[aria-label="排产计划 ID"]').setValue('missing-plan')
    await wrapper.get('.plan-query').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('读取失败')
    expect(wrapper.find('.approve-action').exists()).toBe(false)
    expect(planningApi.approve).not.toHaveBeenCalled()
  })

  it('clears a previously loaded plan as soon as a later create attempt fails', async () => {
    vi.mocked(planningApi.get).mockResolvedValueOnce(draftPlan)
    vi.mocked(planningApi.create).mockRejectedValueOnce(new Error('创建失败'))
    const wrapper = mount(ProductionPlanningView)

    await wrapper.get('[aria-label="排产计划 ID"]').setValue('plan-1')
    await wrapper.get('.plan-query').trigger('submit')
    await flushPromises()
    expect(wrapper.find('.approve-action').exists()).toBe(true)

    const values: Record<string, string> = {
      orderId: 'order-1',
      orderItemId: 'item-1',
      skuId: 'sku-1',
      kittingReleaseId: 'release-1',
      factoryId: 'factory-1',
      workshopId: 'workshop-1',
      productionLineId: 'line-1',
      quantity: '50.000000',
      startDate: '2026-08-25',
      endDate: '2026-08-30',
      plannedBatchCode: 'PB-002',
    }
    for (const [name, value] of Object.entries(values)) {
      await wrapper.get(`[name="${name}"]`).setValue(value)
    }
    await wrapper.get('[data-testid="planning-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('创建失败')
    expect(wrapper.find('.approve-action').exists()).toBe(false)
    expect(planningApi.approve).not.toHaveBeenCalled()
  })

  it('disables the query while loading and discards a response for a changed query snapshot', async () => {
    const waiting = deferred<typeof draftPlan>()
    vi.mocked(planningApi.get).mockReturnValueOnce(waiting.promise)
    const wrapper = mount(ProductionPlanningView)
    const query = wrapper.get<HTMLInputElement>('[aria-label="排产计划 ID"]')

    await query.setValue('plan-1')
    await wrapper.get('.plan-query').trigger('submit')
    expect(query.attributes('disabled')).toBeDefined()
    expect(wrapper.get('.plan-query button').attributes('disabled')).toBeDefined()

    query.element.value = 'plan-2'
    query.element.dispatchEvent(new Event('input'))
    waiting.resolve(draftPlan)
    await flushPromises()

    expect(wrapper.find('.approve-action').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('PLAN-PB-001')
    expect(planningApi.approve).not.toHaveBeenCalled()
  })

  it('disables create inputs and discards a response after its payload changes programmatically', async () => {
    const waiting = deferred<typeof draftPlan>()
    vi.mocked(planningApi.create).mockReturnValueOnce(waiting.promise)
    const wrapper = mount(ProductionPlanningView)
    const values: Record<string, string> = {
      orderId: 'order-1',
      orderItemId: 'item-1',
      skuId: 'sku-1',
      kittingReleaseId: 'release-1',
      factoryId: 'factory-1',
      workshopId: 'workshop-1',
      productionLineId: 'line-1',
      quantity: '50.000000',
      startDate: '2026-08-25',
      endDate: '2026-08-30',
      plannedBatchCode: 'PB-001',
    }
    for (const [name, value] of Object.entries(values)) {
      await wrapper.get(`[name="${name}"]`).setValue(value)
    }

    await wrapper.get('[data-testid="planning-form"]').trigger('submit')
    expect(wrapper.get('fieldset').attributes('disabled')).toBeDefined()
    const batch = wrapper.get<HTMLInputElement>('[name="plannedBatchCode"]')
    batch.element.value = 'PB-CHANGED'
    batch.element.dispatchEvent(new Event('input'))
    waiting.resolve(draftPlan)
    await flushPromises()

    expect(wrapper.find('.approve-action').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('PLAN-PB-001')
  })
})
