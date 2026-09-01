import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { productionApi, productionEvidenceApi } from '@/api/production'
import WorkOrderListView from './WorkOrderListView.vue'
import WorkOrderDetailView from './WorkOrderDetailView.vue'
import ProcessInspectionPanel from './ProcessInspectionPanel.vue'

vi.mock('@/api/production', () => ({
  productionApi: {
    list: vi.fn(),
    get: vi.fn(),
    convert: vi.fn(),
    submit: vi.fn(),
    approve: vi.fn(),
    release: vi.fn(),
    report: vi.fn(),
    reports: vi.fn(),
    complete: vi.fn(),
  },
  productionEvidenceApi: { latest: vi.fn().mockResolvedValue(null) },
}))

vi.mock('vue-router', async () => {
  const actual = await vi.importActual<typeof import('vue-router')>('vue-router')
  return {
    ...actual,
    useRoute: () => ({ params: { id: 'wo-1' } }),
    useRouter: () => ({ push: vi.fn() }),
  }
})

const workOrder = {
  id: 'wo-1',
  workOrderNo: 'WO-PB-001',
  productionScheduleId: 'schedule-1',
  productionPlanItemId: 'plan-item-1',
  orderItemId: 'order-item-1',
  skuId: 'sku-1',
  factoryId: 'factory-1',
  workshopId: 'workshop-1',
  productionLineId: 'line-1',
  plannedQuantity: '10.000000',
  status: 'RELEASED' as const,
  totalInputQuantity: '6.000000',
  totalGoodQuantity: '4.000000',
  totalDefectQuantity: '1.000000',
  totalReworkQuantity: '0.500000',
  workInProgressQuantity: '1.000000',
  unstartedQuantity: '4.000000',
  reworkPendingQuantity: '1.000000',
  approvedScrapQuantity: '0.000000',
  productionBatch: {
    id: 'batch-1',
    productionScheduleId: 'schedule-1',
    productionPlanItemId: 'plan-item-1',
    orderItemId: 'order-item-1',
    skuId: 'sku-1',
    factoryId: 'factory-1',
    workshopId: 'workshop-1',
    productionLineId: 'line-1',
    plannedBatchCode: 'PB-001',
    plannedQuantity: '10.000000',
    startDate: '2026-08-25',
    endDate: '2026-08-30',
    status: 'RELEASED' as const,
    version: 1,
  },
  version: 3,
  createdAt: '2026-08-24T00:00:00Z',
  updatedAt: '2026-08-24T01:00:00Z',
}

describe('工单列表与详情', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(productionApi.list).mockResolvedValue({
      content: [workOrder],
      totalElements: 1,
      totalPages: 1,
      page: 0,
      size: 20,
    })
    vi.mocked(productionApi.get).mockResolvedValue(workOrder)
    vi.mocked(productionApi.reports).mockResolvedValue({
      content: [],
      totalElements: 0,
      totalPages: 0,
      page: 0,
      size: 20,
    })
    vi.mocked(productionApi.convert).mockResolvedValue(workOrder)
    vi.mocked(productionApi.report).mockResolvedValue({
      ...workOrder,
      status: 'IN_PRODUCTION',
    })
  })

  it('lists status, batch, line and planned quantity and converts an approved schedule', async () => {
    const wrapper = mount(WorkOrderListView)
    await flushPromises()

    expect(wrapper.text()).toContain('WO-PB-001')
    expect(wrapper.text()).toContain('PB-001')
    expect(wrapper.text()).toContain('line-1')
    expect(wrapper.text()).toContain('10.000000')

    await wrapper.get('[name="productionScheduleId"]').setValue('schedule-1')
    await wrapper.get('[data-testid="convert-form"]').trigger('submit')
    await flushPromises()
    expect(productionApi.convert).toHaveBeenCalledWith('schedule-1', expect.any(String))
  })

  it('reloads the current full non-first page after conversion and keeps server paging order', async () => {
    const pageZero = pageOf([summary(0)], 41, 3, 0)
    const pageOneBefore = pageOf(
      Array.from({ length: 20 }, (_, index) => summary(index + 20)),
      41,
      3,
      1,
    )
    const pageOneAfter = pageOf(
      Array.from({ length: 20 }, (_, index) => summary(index + 21)),
      42,
      3,
      1,
    )
    vi.mocked(productionApi.list)
      .mockResolvedValueOnce(pageZero)
      .mockResolvedValueOnce(pageOneBefore)
      .mockResolvedValueOnce(pageOneAfter)
    vi.mocked(productionApi.convert).mockResolvedValue({
      ...workOrder,
      id: 'converted-on-server-first-page',
      workOrderNo: 'WO-CONVERTED',
    })
    const wrapper = mount(WorkOrderListView)
    await flushPromises()
    const view = wrapper.vm as unknown as { load: (page: number) => Promise<void> }
    await view.load(1)

    await wrapper.get('[name="productionScheduleId"]').setValue('schedule-new')
    await wrapper.get('[data-testid="convert-form"]').trigger('submit')
    await flushPromises()

    expect(productionApi.list).toHaveBeenNthCalledWith(3, 1, 20)
    expect(wrapper.findAll('tbody tr')).toHaveLength(20)
    expect(wrapper.text()).toContain('WO-SERVER-21')
    expect(wrapper.text()).not.toContain('WO-CONVERTED')
    expect(wrapper.text()).toContain('第 2 / 3 页，共 42 张工单')
  })

  it('does not let an older list request overwrite the server page refreshed after conversion', async () => {
    const stale = deferred<ReturnType<typeof pageOf>>()
    const refreshed = deferred<ReturnType<typeof pageOf>>()
    vi.mocked(productionApi.list)
      .mockReturnValueOnce(stale.promise)
      .mockReturnValueOnce(refreshed.promise)
    const wrapper = mount(WorkOrderListView)

    await wrapper.get('[name="productionScheduleId"]').setValue('schedule-new')
    await wrapper.get('[data-testid="convert-form"]').trigger('submit')
    await flushPromises()
    refreshed.resolve(pageOf([summary(7)], 1, 1, 0))
    await flushPromises()
    stale.resolve(pageOf([summary(99)], 1, 1, 0))
    await flushPromises()

    expect(wrapper.text()).toContain('WO-SERVER-7')
    expect(wrapper.text()).not.toContain('WO-SERVER-99')
  })

  it('shows lifecycle, conserved totals and submits string-decimal reporting', async () => {
    const wrapper = mount(WorkOrderDetailView)
    await flushPromises()

    expect(wrapper.text()).toContain('草稿')
    expect(wrapper.text()).toContain('已下达')
    expect(wrapper.text()).toContain('累计良品')
    expect(wrapper.text()).toContain('当前在制')

    const values = {
      inputQuantity: '4.000000',
      goodQuantity: '5.000000',
      defectQuantity: '0.000000',
      reworkInputQuantity: '0.000000',
      closingWorkInProgressQuantity: '0.000000',
      operator: 'worker-2',
      team: 'team-a',
      workHours: '1.000000',
      equipment: 'machine-1',
    }
    for (const [name, value] of Object.entries(values)) {
      await wrapper.get(`[name="${name}"]`).setValue(value)
    }
    await wrapper.get('[data-testid="report-form"]').trigger('submit')
    await flushPromises()

    expect(productionApi.report).toHaveBeenCalledWith(
      'wo-1',
      expect.objectContaining({ inputQuantity: '4.000000', goodQuantity: '5.000000', version: 3 }),
      expect.any(String),
    )
  })

  it('refreshes the completion gate when the process inspection changes', async () => {
    const wrapper = mount(WorkOrderDetailView)
    await flushPromises()
    const callsBeforeUpdate = vi.mocked(productionEvidenceApi.latest).mock.calls.length

    wrapper.findComponent(ProcessInspectionPanel).vm.$emit('inspection-updated')
    await flushPromises()

    expect(productionEvidenceApi.latest).toHaveBeenCalledTimes(callsBeforeUpdate + 1)
  })

  it.each([
    ['DRAFT', '提交审批', 'submit'],
    ['PENDING_APPROVAL', '审批工单', 'approve'],
    ['APPROVED', '下达产线', 'release'],
  ] as const)(
    'reuses an uncertain %s action key until the retry succeeds',
    async (status, label, action) => {
      const current = { ...workOrder, status }
      vi.mocked(productionApi.get).mockResolvedValue(current)
      vi.mocked(productionApi[action])
        .mockRejectedValueOnce(new Error('unknown outcome'))
        .mockResolvedValueOnce({ ...current, version: current.version + 1 })
      const wrapper = mount(WorkOrderDetailView)
      await flushPromises()

      await wrapper.get('button').trigger('click')
      await flushPromises()
      await wrapper.get('button').trigger('click')
      await flushPromises()

      const calls = vi.mocked(productionApi[action]).mock.calls
      expect(calls).toHaveLength(2)
      expect(calls[0]?.[2]).toBeTruthy()
      expect(calls[1]?.[2]).toBe(calls[0]?.[2])
      expect(wrapper.text()).toContain(label)
    },
  )

  it('keeps each action single-flight and becomes operable after a failure', async () => {
    const pending = deferred<typeof workOrder>()
    vi.mocked(productionApi.get)
      .mockResolvedValueOnce({ ...workOrder, status: 'DRAFT' })
      .mockResolvedValueOnce({ ...workOrder, status: 'APPROVED', version: 5 })
    vi.mocked(productionApi.submit)
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce({ ...workOrder, status: 'PENDING_APPROVAL', version: 4 })
    const wrapper = mount(WorkOrderDetailView)
    await flushPromises()
    const button = wrapper.get('button')

    await button.trigger('click')
    await button.trigger('click')
    expect(productionApi.submit).toHaveBeenCalledTimes(1)
    expect(button.attributes('disabled')).toBeDefined()
    pending.reject(new Error('unknown outcome'))
    await flushPromises()

    expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(productionApi.submit).toHaveBeenCalledTimes(2)
  })

  it('does not let an older submit response overwrite a newer approval', async () => {
    const submit = deferred<typeof workOrder>()
    const approve = deferred<typeof workOrder>()
    vi.mocked(productionApi.get)
      .mockResolvedValueOnce({ ...workOrder, status: 'DRAFT' })
      .mockResolvedValueOnce({ ...workOrder, status: 'APPROVED', version: 5 })
    vi.mocked(productionApi.submit).mockReturnValue(submit.promise)
    vi.mocked(productionApi.approve).mockReturnValue(approve.promise)
    const wrapper = mount(WorkOrderDetailView)
    await flushPromises()
    const view = wrapper.vm as unknown as {
      workOrder: typeof workOrder
      transition: (action: 'submit' | 'approve' | 'release') => Promise<void>
    }

    const oldRequest = view.transition('submit')
    view.workOrder = { ...workOrder, status: 'PENDING_APPROVAL', version: 4 }
    const newRequest = view.transition('approve')
    approve.resolve({ ...workOrder, status: 'APPROVED', version: 5 })
    await newRequest
    submit.resolve({ ...workOrder, status: 'PENDING_APPROVAL', version: 4 })
    await oldRequest
    await flushPromises()

    expect(wrapper.get('button').text()).toContain('下达产线')
  })

  it('refreshes the core even when a replay is newer locally but older than the server', async () => {
    vi.mocked(productionApi.get)
      .mockResolvedValueOnce({ ...workOrder, status: 'DRAFT', version: 3 })
      .mockResolvedValueOnce({ ...workOrder, status: 'APPROVED', version: 5 })
    vi.mocked(productionApi.submit).mockResolvedValue({
      ...workOrder,
      status: 'PENDING_APPROVAL',
      version: 4,
    })
    const wrapper = mount(WorkOrderDetailView)
    await flushPromises()

    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(productionApi.get).toHaveBeenCalledTimes(2)
    expect(wrapper.get('button').text()).toContain('下达产线')
  })

  it('keeps the action key when its follow-up core refresh fails', async () => {
    vi.mocked(productionApi.get)
      .mockResolvedValueOnce({ ...workOrder, status: 'DRAFT', version: 3 })
      .mockRejectedValueOnce(new Error('refresh unavailable'))
      .mockResolvedValueOnce({ ...workOrder, status: 'PENDING_APPROVAL', version: 4 })
    vi.mocked(productionApi.submit).mockResolvedValue({
      ...workOrder,
      status: 'PENDING_APPROVAL',
      version: 4,
    })
    const wrapper = mount(WorkOrderDetailView)
    await flushPromises()

    await wrapper.get('button').trigger('click')
    await flushPromises()
    await wrapper.get('button').trigger('click')
    await flushPromises()

    const calls = vi.mocked(productionApi.submit).mock.calls
    expect(calls).toHaveLength(2)
    expect(calls[1]?.[2]).toBe(calls[0]?.[2])
    expect(wrapper.get('button').text()).toContain('审批工单')
  })

  it('reports success separately when only the history refresh fails', async () => {
    vi.mocked(productionApi.get)
      .mockResolvedValueOnce(workOrder)
      .mockResolvedValueOnce({ ...workOrder, status: 'IN_PRODUCTION', version: 4 })
    vi.mocked(productionApi.reports)
      .mockResolvedValueOnce({ content: [], totalElements: 0, totalPages: 0, page: 0, size: 20 })
      .mockRejectedValueOnce(new Error('history unavailable'))
    const wrapper = mount(WorkOrderDetailView)
    await flushPromises()
    for (const [name, value] of Object.entries({
      inputQuantity: '1.000000',
      goodQuantity: '1.000000',
      operator: 'worker',
      team: 'team',
      workHours: '1.000000',
      equipment: 'machine',
    })) {
      await wrapper.get(`[name="${name}"]`).setValue(value)
    }

    await wrapper.get('[data-testid="report-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('报工已成功，流水刷新失败')
    expect(wrapper.text()).not.toContain('生产报工失败')
  })

  it('keeps the report key when its follow-up core refresh fails', async () => {
    vi.mocked(productionApi.get)
      .mockResolvedValueOnce(workOrder)
      .mockRejectedValueOnce(new Error('refresh unavailable'))
      .mockResolvedValueOnce({ ...workOrder, status: 'IN_PRODUCTION', version: 4 })
    vi.mocked(productionApi.report).mockResolvedValue({
      ...workOrder,
      status: 'IN_PRODUCTION',
      version: 4,
    })
    const wrapper = mount(WorkOrderDetailView)
    await flushPromises()
    for (const [name, value] of Object.entries({
      inputQuantity: '1.000000',
      goodQuantity: '1.000000',
      operator: 'worker',
      team: 'team',
      workHours: '1.000000',
      equipment: 'machine',
    })) {
      await wrapper.get(`[name="${name}"]`).setValue(value)
    }

    await wrapper.get('[data-testid="report-form"]').trigger('submit')
    await flushPromises()
    await wrapper.get('[data-testid="report-form"]').trigger('submit')
    await flushPromises()

    const calls = vi.mocked(productionApi.report).mock.calls
    expect(calls).toHaveLength(2)
    expect(calls[1]?.[2]).toBe(calls[0]?.[2])
  })

  it('does not let an older reports page overwrite a newer page', async () => {
    const oldPage = deferred<Awaited<ReturnType<typeof productionApi.reports>>>()
    const newPage = deferred<Awaited<ReturnType<typeof productionApi.reports>>>()
    vi.mocked(productionApi.reports)
      .mockResolvedValueOnce({ content: [], totalElements: 40, totalPages: 2, page: 0, size: 20 })
      .mockReturnValueOnce(oldPage.promise)
      .mockReturnValueOnce(newPage.promise)
    const wrapper = mount(WorkOrderDetailView)
    await flushPromises()
    const view = wrapper.vm as unknown as { loadReports: (page: number) => Promise<void> }

    const older = view.loadReports(0)
    const newer = view.loadReports(1)
    newPage.resolve({ content: [], totalElements: 40, totalPages: 2, page: 1, size: 20 })
    await newer
    oldPage.resolve({ content: [], totalElements: 40, totalPages: 2, page: 0, size: 20 })
    await older
    await flushPromises()

    expect(wrapper.text()).toContain('第 2 / 2 页')
  })
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((success, failure) => {
    resolve = success
    reject = failure
  })
  return { promise, resolve, reject }
}

function summary(index: number) {
  return {
    ...workOrder,
    id: `server-${index}`,
    workOrderNo: `WO-SERVER-${index}`,
    productionBatch: {
      plannedBatchCode: `PB-${index}`,
      startDate: workOrder.productionBatch.startDate,
      endDate: workOrder.productionBatch.endDate,
      status: workOrder.productionBatch.status,
    },
  }
}

function pageOf(
  content: ReturnType<typeof summary>[],
  totalElements: number,
  totalPages: number,
  page: number,
) {
  return { content, totalElements, totalPages, page, size: 20 }
}
