import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { kittingApi } from '@/api/kitting'
import { masterDataApi } from '@/api/masterdata'
import { salesOrderApi } from '@/api/orders'
import { planningApi } from '@/api/planning'
import type { MasterDataRecord } from '@/types/masterdata'
import type { SalesOrder } from '@/types/order'
import ProductionPlanningView from './ProductionPlanningView.vue'

const routeState = vi.hoisted(() => ({
  query: {} as Record<string, string>,
  replace: vi.fn(),
}))

vi.mock('vue-router', async () => {
  const actual = await vi.importActual<typeof import('vue-router')>('vue-router')
  return {
    ...actual,
    useRoute: () => ({ query: routeState.query }),
    useRouter: () => ({ replace: routeState.replace }),
  }
})

vi.mock('@/api/planning', () => ({
  planningApi: { create: vi.fn(), get: vi.fn(), approve: vi.fn() },
}))
vi.mock('@/api/kitting', () => ({
  kittingApi: { check: vi.fn(), releases: vi.fn() },
}))
vi.mock('@/api/masterdata', () => ({
  masterDataApi: { list: vi.fn() },
}))
vi.mock('@/api/orders', () => ({
  salesOrderApi: { list: vi.fn() },
}))

const SelectFieldStub = {
  name: 'SelectField',
  props: ['modelValue', 'options', 'id', 'name', 'dataTestid', 'disabled'],
  emits: ['update:modelValue', 'change'],
  template: `<select
    :id="id"
    :name="name"
    :data-testid="dataTestid"
    :value="modelValue"
    :disabled="disabled"
    @change="$emit('update:modelValue', $event.target.value); $emit('change', $event.target.value)"
  ><option value=""></option><option v-for="item in options" :key="String(item.value)" :value="item.value">{{ item.label }}</option></select>`,
}

function record(
  partial: Partial<MasterDataRecord> & Pick<MasterDataRecord, 'id' | 'code' | 'name'>,
): MasterDataRecord {
  return {
    active: true,
    version: 1,
    createdAt: '',
    updatedAt: '',
    ...partial,
  }
}

describe('排产驾驶舱', () => {
  function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((accept) => {
      resolve = accept
    })
    return { promise, resolve }
  }

  const listedOrder = {
    id: 'order-1',
    orderNo: 'PO-001',
    status: 'READY_FOR_PRODUCTION',
    items: [{ id: 'item-1', skuId: 'sku-1', color: '藏青', size: 'M', fit: 'REGULAR' }],
  } as SalesOrder

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

  function mountView() {
    return mount(ProductionPlanningView, {
      global: { stubs: { SelectField: SelectFieldStub } },
    })
  }

  async function fillPlanForm(
    wrapper: ReturnType<typeof mountView>,
    extra: Record<string, string> = {},
  ) {
    await flushPromises()
    await wrapper.get('[name="orderId"]').setValue('order-1')
    await wrapper.get('[name="orderItemId"]').setValue('item-1')
    await flushPromises()
    const values: Record<string, string> = {
      kittingReleaseId: 'release-1',
      factoryId: 'factory-1',
      workshopId: 'workshop-1',
      productionLineId: 'line-1',
      quantity: '50.000000',
      startDate: '2026-08-25',
      endDate: '2026-08-30',
      plannedBatchCode: 'PB-001',
      ...extra,
    }
    for (const [name, value] of Object.entries(values)) {
      await wrapper.get(`[name="${name}"]`).setValue(value)
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    for (const key of Object.keys(routeState.query)) delete routeState.query[key]
    vi.mocked(planningApi.create).mockResolvedValue(draftPlan)
    vi.mocked(kittingApi.check).mockResolvedValue({
      id: 'check-id',
      orderItemId: 'item-1',
      skuId: 'sku-1',
      requiredQuantity: '100.000000',
      fabricReadyQuantity: '80.000000',
      accessoryReadyQuantity: '60.000000',
      overallReadyQuantity: '60.000000',
      releasedQuantity: '50.000000',
      remainingQuantity: '10.000000',
      status: 'PARTIALLY_READY',
      version: 1,
    })
    vi.mocked(kittingApi.releases).mockResolvedValue([
      {
        id: 'release-1',
        kittingCheckId: 'check-id',
        quantity: '50.000000',
        scheduledQuantity: '0.000000',
        remainingForScheduling: '50.000000',
        idempotencyKey: 'release-key',
        version: 0,
      },
    ])
    vi.mocked(salesOrderApi.list).mockResolvedValue({
      content: [listedOrder],
      totalElements: 1,
      totalPages: 1,
      page: 0,
      size: 50,
    })
    vi.mocked(masterDataApi.list).mockImplementation(async (type) => {
      const pages = {
        factories: [record({ id: 'factory-1', code: 'F1', name: '一厂' })],
        workshops: [
          record({ id: 'workshop-1', code: 'W1', name: '一车间', parentId: 'factory-1' }),
        ],
        'production-lines': [
          record({ id: 'line-1', code: 'L1', name: '一线', parentId: 'workshop-1' }),
        ],
      }
      const content = pages[type as keyof typeof pages] ?? []
      return { content, totalElements: content.length, totalPages: 1, number: 0, size: 100 }
    })
  })

  it('submits a manual schedule with string quantity and renders its approval gate', async () => {
    const wrapper = mountView()
    await fillPlanForm(wrapper)
    await wrapper.get('[data-testid="planning-form"]').trigger('submit')
    await flushPromises()

    expect(planningApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-1',
        orderItemId: 'item-1',
        skuId: 'sku-1',
        kittingReleaseId: 'release-1',
        quantity: '50.000000',
        plannedBatchCode: 'PB-001',
      }),
      expect.any(String),
    )
    expect(wrapper.text()).toContain('待审批')
    expect(wrapper.text()).toContain('仅已审批排程可下推工单')
  })

  it('restores an approved plan from the URL and exposes a direct work-order handoff', async () => {
    routeState.query.productionPlanId = 'plan-1'
    vi.mocked(planningApi.get).mockResolvedValue({
      ...draftPlan,
      status: 'APPROVED',
      version: 1,
      items: draftPlan.items.map((item) => ({
        ...item,
        schedule: { ...item.schedule, approvalStatus: 'APPROVED', version: 1 },
      })),
    })
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('PLAN-PB-001')
    expect(wrapper.get('.work-order-action').text()).toContain('前往生成工单')
    expect(wrapper.find('[aria-label="排产计划 ID"]').exists()).toBe(false)
  })

  it('restores the selected production plan from the URL after refresh', async () => {
    routeState.query.productionPlanId = 'plan-1'
    vi.mocked(planningApi.get).mockResolvedValue(draftPlan)

    const wrapper = mountView()
    await flushPromises()

    expect(planningApi.get).toHaveBeenCalledWith('plan-1')
    expect(wrapper.text()).toContain('PLAN-PB-001')
  })

  it('clears a previously loaded plan as soon as a later create attempt fails', async () => {
    routeState.query.productionPlanId = 'plan-1'
    vi.mocked(planningApi.get).mockResolvedValueOnce(draftPlan)
    vi.mocked(planningApi.create).mockRejectedValueOnce(new Error('创建失败'))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('.approve-action').exists()).toBe(true)

    await fillPlanForm(wrapper, { plannedBatchCode: 'PB-002' })
    await wrapper.get('[data-testid="planning-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('创建失败')
    expect(wrapper.find('.approve-action').exists()).toBe(false)
    expect(planningApi.approve).not.toHaveBeenCalled()
  })

  it('disables create inputs and discards a response after its payload changes programmatically', async () => {
    const waiting = deferred<typeof draftPlan>()
    vi.mocked(planningApi.create).mockReturnValueOnce(waiting.promise)
    const wrapper = mountView()
    await fillPlanForm(wrapper)

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

  it('创建排产可用下拉选择订单、订单项和产线资源', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.get('[data-testid="planning-order"]').text()).toContain('PO-001')
    expect(wrapper.get('[data-testid="planning-factory"]').text()).toContain('F1 · 一厂')
    await wrapper.get('[data-testid="planning-order"]').setValue('order-1')
    await flushPromises()
    expect(wrapper.get('[data-testid="planning-order-item"]').text()).toContain(
      '藏青 / M / REGULAR',
    )

    await wrapper.get('[data-testid="planning-order-item"]').setValue('item-1')
    await flushPromises()
    expect(wrapper.get('[data-testid="planning-sku"]').element).toHaveProperty('value', 'sku-1')
    expect(kittingApi.check).toHaveBeenCalledWith({ orderItemId: 'item-1', skuId: 'sku-1' })
    expect(kittingApi.releases).toHaveBeenCalledWith('check-id')
    expect(wrapper.get('[data-testid="planning-kitting-release"]').text()).toContain(
      '可排产 50.000000 · 已释放 50.000000',
    )
    expect(wrapper.get('[data-testid="planning-kitting-release"]').element).toHaveProperty(
      'value',
      'release-1',
    )

    await wrapper.get('[data-testid="planning-factory"]').setValue('factory-1')
    await flushPromises()
    expect(wrapper.get('[data-testid="planning-workshop"]').text()).toContain('W1 · 一车间')
    await wrapper.get('[data-testid="planning-workshop"]').setValue('workshop-1')
    await flushPromises()
    expect(wrapper.get('[data-testid="planning-line"]').text()).toContain('L1 · 一线')
  })
})
