import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { qualityApi } from '@/api/quality'
import { ApiClientError } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import { clearTenantCaches } from '@/stores/tenantCache'
import { qualityMutationStorageKey } from './qualityMutationFlight'
import QualityWorkspaceView from './QualityWorkspaceView.vue'

vi.mock('@/api/quality', () => ({
  qualityApi: {
    aggregateOrder: vi.fn(),
    aggregate: vi.fn(),
    trim: vi.fn(),
    inspect: vi.fn(),
    completeRework: vi.fn(),
    bridgeLegacyRework: vi.fn(),
  },
}))

const SALES_ORDER_ID = '1135b20e-6cd4-4aac-84eb-f135401e7e12'
const WORK_ORDER_ID = '26b8e39a-f360-4d19-a666-ad51236d07f3'
const PRODUCTION_BATCH_ID = '48daf5bc-0372-4a57-a2b1-ebdf75a346e1'
const ORDER_ITEM_ID = '59eb06cd-1483-4b68-b3c2-fce086b457f2'
const SKU_ID = '6afc17de-2594-4c79-a4d3-0df197c56803'
const INSPECTION_ID = '7b0d28ef-36a5-4d8a-b5e4-1e02a8d67914'
const REWORK_ID = '8c1e390a-47b6-4e9b-86f5-2f13b9e78a25'
const LEGACY_REWORK_ID = '9d2f4a1b-58c7-4fac-97a6-3024caf89b36'
const TENANT_ID = '7e179539-02b7-4190-bcad-83edcbb66a81'
const USER_ID = 'a8e88635-c2db-48ce-a384-fec40cd75cb4'

function selectField(wrapper: ReturnType<typeof mount>, name: string) {
  const field = wrapper
    .findAllComponents({ name: 'SelectField' })
    .find((item) => item.props('name') === name)
  if (!field) throw new Error(`SelectField [name="${name}"] not found`)
  return field
}

const aggregate = {
  salesOrderId: SALES_ORDER_ID,
  workOrderId: WORK_ORDER_ID,
  productionBatchId: PRODUCTION_BATCH_ID,
  orderItemId: ORDER_ITEM_ID,
  skuId: SKU_ID,
  requiredQuantity: '10.000000',
  completedQuantity: '10.000000',
  trimmedQuantity: '8.000000',
  trimmingAvailableQuantity: '2.000000',
  initialSubmittedQuantity: '6.000000',
  inspectionAvailableQuantity: '2.000000',
  passedQuantity: '4.000000',
  failedAuditQuantity: '2.000000',
  pendingReworkQuantity: '2.000000',
  pendingDispositionQuantity: '0.000000',
  status: 'REWORK' as const,
  trimmings: [],
  inspections: [
    {
      id: INSPECTION_ID,
      workOrderId: WORK_ORDER_ID,
      productionBatchId: PRODUCTION_BATCH_ID,
      orderItemId: ORDER_ITEM_ID,
      skuId: SKU_ID,
      type: 'FINISHED_PRODUCT' as const,
      inspectionMethod: 'SAMPLING' as const,
      submittedQuantity: '6.000000',
      passedQuantity: '4.000000',
      failedQuantity: '2.000000',
      result: 'PARTIAL' as const,
      inspectionVersion: 1,
      sourceInspectionId: null,
      sourceReworkOrderId: null,
      chainDepth: 0,
      defectCode: 'SEAM',
      disposition: '车间返修',
      createdAt: '2026-08-25T00:00:00Z',
    },
  ],
  reworkOrders: [
    {
      id: REWORK_ID,
      workOrderId: WORK_ORDER_ID,
      productionBatchId: PRODUCTION_BATCH_ID,
      orderItemId: ORDER_ITEM_ID,
      skuId: SKU_ID,
      sourceInspectionId: INSPECTION_ID,
      inspectionType: 'FINISHED_PRODUCT' as const,
      inspectionMethod: 'SAMPLING' as const,
      quantity: '2.000000',
      chainDepth: 1,
      defectCode: 'SEAM',
      status: 'PENDING' as const,
      completedInspectionId: null,
      createdAt: '2026-08-25T00:00:00Z',
      completedAt: null,
    },
  ],
  nonconformingDispositions: [],
  historyPage: {
    page: 0,
    size: 50,
    trimmingTotal: 0,
    inspectionTotal: 1,
    reworkTotal: 1,
    dispositionTotal: 0,
    hasNext: false,
  },
}

const orderAggregate = {
  salesOrderId: SALES_ORDER_ID,
  orderNo: 'SO-QUALITY',
  mainStatus: 'APPROVED',
  requiredQuantity: '10.000000',
  completedQuantity: '10.000000',
  trimmedQuantity: '8.000000',
  initialInspectedQuantity: '6.000000',
  passedQuantity: '4.000000',
  pendingReworkQuantity: '2.000000',
  pendingDispositionQuantity: '0.000000',
  status: 'REWORK' as const,
  items: [
    {
      orderItemId: ORDER_ITEM_ID,
      skuId: SKU_ID,
      requiredQuantity: '10.000000',
      completedQuantity: '10.000000',
      trimmedQuantity: '8.000000',
      initialInspectedQuantity: '6.000000',
      passedQuantity: '4.000000',
      pendingReworkQuantity: '2.000000',
      pendingDispositionQuantity: '0.000000',
      status: 'REWORK' as const,
      workOrders: [
        {
          workOrderId: WORK_ORDER_ID,
          productionBatchId: PRODUCTION_BATCH_ID,
          completedQuantity: '10.000000',
          trimmedQuantity: '8.000000',
          initialInspectedQuantity: '6.000000',
          passedQuantity: '4.000000',
          pendingReworkQuantity: '2.000000',
          pendingDispositionQuantity: '0.000000',
          status: 'REWORK' as const,
          inspectionMethods: ['SAMPLING' as const],
        },
      ],
    },
  ],
}

describe('质量工作台', () => {
  beforeEach(() => {
    clearTenantCaches()
    setActivePinia(createPinia())
    const auth = useAuthStore()
    auth.profile = {
      userId: USER_ID,
      username: 'quality.inspector',
      displayName: '质量检验员',
      tenantId: TENANT_ID,
      tenantCode: 'needle-one',
      roles: ['QUALITY_INSPECTOR'],
      permissions: ['QUALITY_INSPECT'],
    }
    auth.token = 'signed.jwt'
    auth.generation = 7
    auth.sessionStatus = 'authenticated'
    vi.clearAllMocks()
    window.sessionStorage.clear()
    vi.mocked(qualityApi.aggregateOrder).mockResolvedValue(orderAggregate)
    vi.mocked(qualityApi.aggregate).mockResolvedValue(aggregate)
    vi.mocked(qualityApi.trim).mockResolvedValue({} as never)
    vi.mocked(qualityApi.inspect).mockResolvedValue({} as never)
    vi.mocked(qualityApi.completeRework).mockResolvedValue({} as never)
    vi.mocked(qualityApi.bridgeLegacyRework).mockResolvedValue({} as never)
  })

  it('shows immutable source pools, the one formal inspection and rework lineage', async () => {
    const wrapper = mount(QualityWorkspaceView)
    await wrapper.get('[name="salesOrderId"]').setValue(SALES_ORDER_ID)
    await wrapper.get('[data-testid="load-quality"]').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('生产完成账本')
    expect(wrapper.text()).toContain('10.000000')
    expect(wrapper.text()).toContain('待后整')
    expect(wrapper.text()).toContain('2.000000')
    expect(wrapper.text()).toContain('唯一正式成品质检')
    expect(wrapper.text()).toContain('抽检')
    expect(wrapper.text()).toContain(INSPECTION_ID)
    expect(wrapper.text()).toContain(REWORK_ID)
    expect(wrapper.text()).toContain(`来源检验 ${INSPECTION_ID}`)
    expect(wrapper.text()).toContain(`SKU ${SKU_ID}`)
    expect(wrapper.text()).toContain(`批次 ${PRODUCTION_BATCH_ID}`)
    expect(wrapper.text()).toContain('主状态 APPROVED')
  })

  it('shows pending disposition and loads bounded history pages with the selected work order', async () => {
    const pendingFacts = {
      ...aggregate,
      pendingReworkQuantity: '0.000000',
      pendingDispositionQuantity: '2.000000',
      status: 'NONCONFORMING_PENDING_APPROVAL' as const,
      nonconformingDispositions: [
        {
          id: 'disposition-1',
          workOrderId: WORK_ORDER_ID,
          productionBatchId: PRODUCTION_BATCH_ID,
          orderItemId: ORDER_ITEM_ID,
          skuId: SKU_ID,
          sourceInspectionId: 'inspection-4',
          inspectionType: 'FINISHED_PRODUCT' as const,
          inspectionMethod: 'FULL' as const,
          quantity: '2.000000',
          chainDepth: 4,
          maxReworkAttemptsSnapshot: 3,
          defectCode: 'SEAM',
          status: 'PENDING_APPROVAL' as const,
          createdAt: '2026-08-25T00:00:00Z',
        },
      ],
      historyPage: { ...aggregate.historyPage, hasNext: true },
    }
    vi.mocked(qualityApi.aggregate)
      .mockResolvedValueOnce(pendingFacts)
      .mockResolvedValueOnce({
        ...pendingFacts,
        historyPage: { ...pendingFacts.historyPage, page: 1, hasNext: false },
      })
    const wrapper = mount(QualityWorkspaceView)
    await wrapper.get('[name="salesOrderId"]').setValue(SALES_ORDER_ID)
    await wrapper.get('[data-testid="load-quality"]').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-testid="pending-disposition"]').text()).toContain('待处置审批')
    const pager = wrapper.get('[data-testid="quality-history-page"]')
    await pager.findAll('button')[1]!.trigger('click')
    await flushPromises()
    expect(qualityApi.aggregate).toHaveBeenLastCalledWith(WORK_ORDER_ID, 1, 50)
    expect(wrapper.get('[data-testid="quality-history-page"]').text()).toContain('第 2 页')
  })

  it('keeps trimming single-flight and refreshes facts before clearing its key', async () => {
    const pending = deferred<unknown>()
    vi.mocked(qualityApi.trim).mockReturnValueOnce(pending.promise as never)
    const wrapper = await loaded()
    await wrapper.get('[name="trimQuantity"]').setValue('2.000000')

    await wrapper.get('[data-testid="trim-form"]').trigger('submit')
    await wrapper.get('[data-testid="trim-form"]').trigger('submit')
    expect(qualityApi.trim).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-testid="trim-submit"]').attributes('disabled')).toBeDefined()
    pending.resolve({})
    await flushPromises()

    expect(qualityApi.aggregateOrder).toHaveBeenCalledTimes(2)
    expect(qualityApi.aggregate).toHaveBeenCalledTimes(2)
    expect(vi.mocked(qualityApi.trim).mock.calls[0]?.[1]).toBeTruthy()
  })

  it('does not allow an old fact response to overwrite a newer refresh', async () => {
    const oldResponse = deferred<typeof orderAggregate>()
    const newResponse = deferred<typeof orderAggregate>()
    vi.mocked(qualityApi.aggregateOrder)
      .mockReturnValueOnce(oldResponse.promise)
      .mockReturnValueOnce(newResponse.promise)
    const wrapper = mount(QualityWorkspaceView)
    await wrapper.get('[name="salesOrderId"]').setValue(SALES_ORDER_ID)
    await wrapper.get('[data-testid="load-quality"]').trigger('submit')
    await wrapper.get('[data-testid="load-quality"]').trigger('submit')
    newResponse.resolve({ ...orderAggregate, passedQuantity: '8.000000' })
    await flushPromises()
    oldResponse.resolve({ ...orderAggregate, passedQuantity: '1.000000' })
    await flushPromises()

    expect(wrapper.text()).toContain('8.000000')
    expect(wrapper.text()).not.toContain('1.000000')
  })

  it('submits split quantities and completes the selected rework with idempotency keys', async () => {
    const wrapper = await loaded()
    for (const [name, value] of Object.entries({
      submittedQuantity: '2.000000',
      passedQuantity: '1.000000',
      failedQuantity: '1.000000',
      inspectionMethod: 'FULL',
      defectCode: ' seam:01 ',
      disposition: '车间返修',
    })) {
      if (name === 'inspectionMethod') await selectField(wrapper, name).setValue(value)
      else await wrapper.get(`[name="${name}"]`).setValue(value)
    }
    await wrapper.get('[data-testid="inspection-form"]').trigger('submit')
    await flushPromises()
    expect(qualityApi.inspect).toHaveBeenCalledWith(
      expect.objectContaining({
        workOrderId: WORK_ORDER_ID,
        inspectionMethod: 'FULL',
        submittedQuantity: '2.000000',
        defectCode: 'SEAM:01',
      }),
      expect.any(String),
    )

    await wrapper.get('[name="reworkPassedQuantity"]').setValue('2.000000')
    await wrapper.get('[name="reworkFailedQuantity"]').setValue('0.000000')
    await wrapper.get('[data-testid="rework-form"]').trigger('submit')
    await flushPromises()
    expect(qualityApi.completeRework).toHaveBeenCalledWith(
      REWORK_ID,
      expect.objectContaining({ passedQuantity: '2.000000' }),
      expect.any(String),
    )
  })

  it('shows a legacy rework as fail-closed and records an explicit audited method bridge', async () => {
    vi.mocked(qualityApi.aggregate).mockResolvedValue({
      ...aggregate,
      inspections: [
        { ...aggregate.inspections[0]!, inspectionMethod: 'LEGACY_UNSPECIFIED' as const },
      ],
      reworkOrders: [
        {
          ...aggregate.reworkOrders[0]!,
          id: LEGACY_REWORK_ID,
          inspectionMethod: 'LEGACY_UNSPECIFIED' as const,
          legacyReworkBridgeId: null,
          remediatedInspectionMethod: null,
        },
      ],
    })
    const wrapper = await loaded()

    expect(wrapper.text()).toContain('历史方式待补录')
    expect(wrapper.get('[data-testid="rework-submit"]').attributes('disabled')).toBeDefined()
    await selectField(wrapper, 'legacyBridgeMethod').setValue('FULL')
    await wrapper.get('[data-testid="legacy-bridge-submit"]').trigger('click')
    await flushPromises()

    expect(qualityApi.bridgeLegacyRework).toHaveBeenCalledWith(
      LEGACY_REWORK_ID,
      { selectedMethod: 'FULL' },
      expect.any(String),
    )
    expect(qualityApi.completeRework).not.toHaveBeenCalled()
  })

  it('clears A facts before loading B and keeps actions disabled when B detail fails', async () => {
    const wrapper = await loaded()
    const bOrder = deferred<typeof orderAggregate>()
    vi.mocked(qualityApi.aggregateOrder).mockReturnValueOnce(bOrder.promise)
    vi.mocked(qualityApi.aggregate).mockRejectedValueOnce(new Error('B detail unavailable'))

    await wrapper.get('[name="salesOrderId"]').setValue('sales-2')
    await wrapper.get('[data-testid="load-quality"]').trigger('submit')

    const clearedImmediately = !wrapper.find('[data-testid="inspection-form"]').exists()
    const oldInspectionHiddenImmediately = !wrapper.text().includes(INSPECTION_ID)

    bOrder.resolve({
      ...orderAggregate,
      salesOrderId: 'sales-2',
      orderNo: 'SO-B',
      items: [
        {
          ...orderAggregate.items[0]!,
          workOrders: [
            {
              ...orderAggregate.items[0]!.workOrders[0]!,
              workOrderId: 'wo-2',
              productionBatchId: 'batch-2',
            },
          ],
        },
      ],
    })
    await flushPromises()

    expect(clearedImmediately).toBe(true)
    expect(oldInspectionHiddenImmediately).toBe(true)
    expect(wrapper.text()).toContain('SO-B')
    expect(wrapper.text()).toContain('B detail unavailable')
    expect(wrapper.find('[data-testid="inspection-form"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain(INSPECTION_ID)
    expect(qualityApi.inspect).not.toHaveBeenCalled()
  })

  it.each([
    ['trimming', '[data-testid="trim-form"]', 'trimQuantity', '2.000000', 'trim'],
    ['inspection', '[data-testid="inspection-form"]', 'disposition', '通过', 'inspect'],
    ['rework', '[data-testid="rework-form"]', 'reworkDisposition', '完成', 'completeRework'],
  ] as const)(
    'keeps the %s mutation confirmed and blocks a second POST until refresh succeeds',
    async (_name, formSelector, field, value, apiMethod) => {
      const wrapper = await loaded()
      if (apiMethod === 'inspect') {
        await wrapper.get('[name="submittedQuantity"]').setValue('2.000000')
        await wrapper.get('[name="passedQuantity"]').setValue('2.000000')
        await wrapper.get('[name="failedQuantity"]').setValue('0.000000')
      }
      if (apiMethod === 'completeRework') {
        await wrapper.get('[name="reworkPassedQuantity"]').setValue('2.000000')
        await wrapper.get('[name="reworkFailedQuantity"]').setValue('0.000000')
      }
      await wrapper.get(`[name="${field}"]`).setValue(value)
      vi.mocked(qualityApi.aggregateOrder).mockRejectedValueOnce(new Error('refresh failed'))

      const originalForm = wrapper.get(formSelector)
      await originalForm.trigger('submit')
      await flushPromises()

      expect(qualityApi[apiMethod]).toHaveBeenCalledTimes(1)
      expect(wrapper.text()).toContain('已入账，刷新失败/待同步')
      expect(wrapper.find(formSelector).exists()).toBe(false)
      await originalForm.trigger('submit')
      await flushPromises()
      expect(qualityApi[apiMethod]).toHaveBeenCalledTimes(1)

      vi.mocked(qualityApi.aggregateOrder).mockResolvedValueOnce(orderAggregate)
      vi.mocked(qualityApi.aggregate).mockResolvedValueOnce(aggregate)
      await wrapper.get('[data-testid="retry-quality-refresh"]').trigger('click')
      await flushPromises()

      expect(wrapper.text()).not.toContain('已入账，刷新失败/待同步')
    },
  )

  it.each(['trimming', 'inspection', 'rework'] as const)(
    'serializes the whole workspace while a deferred %s POST is in flight',
    async (mutation) => {
      vi.mocked(qualityApi.aggregateOrder).mockResolvedValueOnce(orderWithSecondWorkOrder())
      const wrapper = await loaded()
      await fillAllMutationForms(wrapper)
      const pending = deferred<unknown>()
      deferMutation(mutation, pending.promise)

      await wrapper.get(mutationForm(mutation)).trigger('submit')
      await Promise.resolve()

      expect(wrapper.get('[name="salesOrderId"]').attributes('disabled')).toBeDefined()
      expect(
        wrapper.get('[data-testid="load-quality"] button[type="submit"]').attributes('disabled'),
      ).toBeDefined()
      expect(wrapper.get('[name="selectedWorkOrderId"]').attributes('disabled')).toBeDefined()
      expect(wrapper.get('[data-testid="trim-submit"]').attributes('disabled')).toBeDefined()
      expect(wrapper.get('[data-testid="inspection-submit"]').attributes('disabled')).toBeDefined()
      expect(wrapper.get('[data-testid="rework-submit"]').attributes('disabled')).toBeDefined()

      for (const other of (['trimming', 'inspection', 'rework'] as const).filter(
        (candidate) => candidate !== mutation,
      )) {
        await wrapper.get(mutationForm(other)).trigger('submit')
      }
      await wrapper.get('[name="salesOrderId"]').setValue('sales-2')
      await wrapper.get('[data-testid="load-quality"]').trigger('submit')
      await selectField(wrapper, 'selectedWorkOrderId').setValue('wo-2')

      expect(qualityApi.trim).toHaveBeenCalledTimes(mutation === 'trimming' ? 1 : 0)
      expect(qualityApi.inspect).toHaveBeenCalledTimes(mutation === 'inspection' ? 1 : 0)
      expect(qualityApi.completeRework).toHaveBeenCalledTimes(mutation === 'rework' ? 1 : 0)
      expect(qualityApi.aggregateOrder).toHaveBeenCalledTimes(1)
      expect(qualityApi.aggregate).toHaveBeenCalledTimes(1)

      pending.resolve({ id: `${mutation}-result` })
      await flushPromises()
    },
  )

  it.each(['trimming', 'inspection', 'rework'] as const)(
    'refreshes the immutable A source after a successful %s POST even if input changes to B',
    async (mutation) => {
      const wrapper = await loaded()
      await fillAllMutationForms(wrapper)
      const pending = deferred<unknown>()
      deferMutation(mutation, pending.promise)
      vi.mocked(qualityApi.aggregateOrder).mockRejectedValueOnce(new Error('refresh failed'))

      await wrapper.get(mutationForm(mutation)).trigger('submit')
      await wrapper.get('[name="salesOrderId"]').setValue('sales-2')
      pending.resolve({ id: `${mutation}-result` })
      await flushPromises()

      expect(qualityApi.aggregateOrder).toHaveBeenNthCalledWith(2, SALES_ORDER_ID)
      expect(wrapper.get('[data-testid="quality-sync-pending"]').text()).toContain(SALES_ORDER_ID)
      expect(wrapper.get('[data-testid="quality-sync-pending"]').text()).toContain(WORK_ORDER_ID)

      vi.mocked(qualityApi.aggregateOrder).mockResolvedValueOnce(orderAggregate)
      vi.mocked(qualityApi.aggregate).mockResolvedValueOnce(aggregate)
      await wrapper.get('[data-testid="retry-quality-refresh"]').trigger('click')
      await flushPromises()

      expect(qualityApi.aggregateOrder).toHaveBeenNthCalledWith(3, SALES_ORDER_ID)
      expect(qualityApi.aggregate).toHaveBeenNthCalledWith(2, WORK_ORDER_ID)
      expect(wrapper.find('[data-testid="quality-sync-pending"]').exists()).toBe(false)
      expect(wrapper.findAllComponents({ name: 'ElInput' })[0]?.props('modelValue')).toBe(
        SALES_ORDER_ID,
      )
      expect(mutationCallCount(mutation)).toBe(1)
    },
  )

  it.each(['trimming', 'inspection', 'rework'] as const)(
    'keeps an outcome-unknown %s flight and confirms it with the exact original request and key',
    async (mutation) => {
      const wrapper = await loaded()
      await fillAllMutationForms(wrapper)
      rejectMutation(mutation, new ApiClientError('请求超时', 'REQUEST_FAILED', undefined, true))

      await wrapper.get(mutationForm(mutation)).trigger('submit')
      await flushPromises()

      const originalCall = structuredClone(mutationCalls(mutation)[0])
      expect(wrapper.get('[data-testid="quality-sync-pending"]').text()).toContain('结果待确认')
      expect(wrapper.get('[name="salesOrderId"]').attributes('disabled')).toBeDefined()
      expect(wrapper.get('[data-testid="trim-submit"]').attributes('disabled')).toBeDefined()
      expect(wrapper.get('[data-testid="inspection-submit"]').attributes('disabled')).toBeDefined()
      expect(wrapper.get('[data-testid="rework-submit"]').attributes('disabled')).toBeDefined()

      if (mutation === 'trimming') await wrapper.get('[name="trimQuantity"]').setValue('9.000000')
      else if (mutation === 'inspection')
        await wrapper.get('[name="submittedQuantity"]').setValue('9.000000')
      else await wrapper.get('[name="reworkPassedQuantity"]').setValue('9.000000')
      resolveMutation(mutation)
      await wrapper.get('[data-testid="retry-quality-mutation"]').trigger('click')
      await flushPromises()

      expect(mutationCalls(mutation)).toHaveLength(2)
      expect(mutationCalls(mutation)[1]).toEqual(originalCall)
      expect(wrapper.find('[data-testid="quality-sync-pending"]').exists()).toBe(false)
    },
  )

  it('shares a trimming flight with a new instance mounted before the old POST resolves', async () => {
    const wrapper = await loaded()
    await fillAllMutationForms(wrapper)
    const pending = deferred<unknown>()
    vi.mocked(qualityApi.trim).mockReturnValueOnce(pending.promise as never)

    await wrapper.get('[data-testid="trim-form"]').trigger('submit')
    wrapper.unmount()
    const recovered = mount(QualityWorkspaceView)

    expect(recovered.get('[data-testid="quality-sync-pending"]').text()).toContain('请求处理中')
    expect(recovered.get('[name="salesOrderId"]').attributes('disabled')).toBeDefined()
    expect(qualityApi.trim).toHaveBeenCalledTimes(1)
    pending.resolve({ id: 'trim-result' })
    await flushPromises()

    expect(qualityApi.aggregateOrder).toHaveBeenLastCalledWith(SALES_ORDER_ID)
    expect(qualityApi.aggregate).toHaveBeenLastCalledWith(WORK_ORDER_ID)
    expect(qualityApi.trim).toHaveBeenCalledTimes(1)
    expect(recovered.find('[data-testid="quality-sync-pending"]').exists()).toBe(false)
  })

  it('returns mutation ownership to A after the newer B instance unmounts', async () => {
    const wrapperA = await loaded()
    const wrapperB = mount(QualityWorkspaceView)
    wrapperB.unmount()
    await wrapperA.get('[name="trimQuantity"]').setValue('1.000000')

    await wrapperA.get('[data-testid="trim-form"]').trigger('submit')
    await flushPromises()

    expect(qualityApi.trim).toHaveBeenCalledTimes(1)
    expect(qualityApi.trim).toHaveBeenCalledWith(
      { workOrderId: WORK_ORDER_ID, quantity: '1.000000' },
      expect.any(String),
    )
  })

  it('drops an old async POST result after logout and identity generation changes', async () => {
    const wrapper = await loaded()
    const pending = deferred<unknown>()
    vi.mocked(qualityApi.trim).mockReturnValueOnce(pending.promise as never)
    await wrapper.get('[name="trimQuantity"]').setValue('1.000000')
    await wrapper.get('[data-testid="trim-form"]').trigger('submit')
    const auth = useAuthStore()

    auth.clearSession()
    auth.profile = {
      userId: 'bea9e532-305d-49a4-91ed-918711da4455',
      username: 'other.inspector',
      displayName: '另一检验员',
      tenantId: '9f20640a-13c8-41ba-918c-58ab75f7b913',
      tenantCode: 'needle-two',
      roles: ['QUALITY_INSPECTOR'],
      permissions: ['QUALITY_INSPECT'],
    }
    auth.generation += 1
    pending.resolve({ id: 'd30b6a59-ea47-481f-87d1-e28b3b5f4917' })
    await flushPromises()

    expect(qualityApi.aggregateOrder).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="quality-sync-pending"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="order-quality-tree"]').exists()).toBe(false)
    expect(sessionStorage.getItem(qualityMutationStorageKey)).toBeNull()
  })

  it('restores an IN_FLIGHT request from session storage and confirms with its persisted key', async () => {
    const originalPayload = { workOrderId: WORK_ORDER_ID, quantity: '2.000000' }
    window.sessionStorage.setItem(
      qualityMutationStorageKey,
      JSON.stringify({
        name: 'trimming',
        scope: { tenantId: TENANT_ID, userId: USER_ID, authGeneration: 7 },
        sourceSalesOrderId: SALES_ORDER_ID,
        sourceWorkOrderId: WORK_ORDER_ID,
        generation: 1,
        payload: originalPayload,
        key: '64f39c04-cc56-43d0-889f-a00fbbe627aa',
        status: 'IN_FLIGHT',
        startedAt: '2026-08-25T00:00:00.000Z',
      }),
    )
    const wrapper = mount(QualityWorkspaceView)

    expect(wrapper.get('[data-testid="quality-sync-pending"]').text()).toContain('结果待确认')
    await wrapper.get('[data-testid="retry-quality-mutation"]').trigger('click')
    await flushPromises()

    expect(qualityApi.trim).toHaveBeenCalledWith(
      originalPayload,
      '64f39c04-cc56-43d0-889f-a00fbbe627aa',
    )
    expect(qualityApi.aggregateOrder).toHaveBeenCalledWith(SALES_ORDER_ID)
    expect(qualityApi.aggregate).toHaveBeenCalledWith(WORK_ORDER_ID)
    expect(wrapper.find('[data-testid="quality-sync-pending"]').exists()).toBe(false)
  })

  it('does not restore a mutation after browser session storage is gone', () => {
    sessionStorage.clear()

    const wrapper = mount(QualityWorkspaceView)

    expect(wrapper.find('[data-testid="quality-sync-pending"]').exists()).toBe(false)
    expect(qualityApi.trim).not.toHaveBeenCalled()
  })
})

async function loaded() {
  const wrapper = mount(QualityWorkspaceView)
  await wrapper.get('[name="salesOrderId"]').setValue(SALES_ORDER_ID)
  await wrapper.get('[data-testid="load-quality"]').trigger('submit')
  await flushPromises()
  return wrapper
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((success, failure) => {
    resolve = success
    reject = failure
  })
  return { promise, resolve, reject }
}

type MutationName = 'trimming' | 'inspection' | 'rework'

function mutationForm(name: MutationName): string {
  return `[data-testid="${name === 'trimming' ? 'trim' : name}-form"]`
}

function deferMutation(name: MutationName, promise: Promise<unknown>): void {
  if (name === 'trimming') vi.mocked(qualityApi.trim).mockReturnValueOnce(promise as never)
  else if (name === 'inspection')
    vi.mocked(qualityApi.inspect).mockReturnValueOnce(promise as never)
  else vi.mocked(qualityApi.completeRework).mockReturnValueOnce(promise as never)
}

function mutationCallCount(name: MutationName): number {
  if (name === 'trimming') return vi.mocked(qualityApi.trim).mock.calls.length
  if (name === 'inspection') return vi.mocked(qualityApi.inspect).mock.calls.length
  return vi.mocked(qualityApi.completeRework).mock.calls.length
}

function mutationCalls(name: MutationName): unknown[][] {
  if (name === 'trimming') return vi.mocked(qualityApi.trim).mock.calls
  if (name === 'inspection') return vi.mocked(qualityApi.inspect).mock.calls
  return vi.mocked(qualityApi.completeRework).mock.calls
}

function rejectMutation(name: MutationName, error: Error): void {
  if (name === 'trimming') vi.mocked(qualityApi.trim).mockRejectedValueOnce(error)
  else if (name === 'inspection') vi.mocked(qualityApi.inspect).mockRejectedValueOnce(error)
  else vi.mocked(qualityApi.completeRework).mockRejectedValueOnce(error)
}

function resolveMutation(name: MutationName): void {
  if (name === 'trimming')
    vi.mocked(qualityApi.trim).mockResolvedValueOnce({ id: 'trim-result' } as never)
  else if (name === 'inspection')
    vi.mocked(qualityApi.inspect).mockResolvedValueOnce({ id: 'inspection-result' } as never)
  else vi.mocked(qualityApi.completeRework).mockResolvedValueOnce({ id: 'rework-result' } as never)
}

async function fillAllMutationForms(wrapper: Awaited<ReturnType<typeof loaded>>): Promise<void> {
  for (const [name, value] of Object.entries({
    trimQuantity: '2.000000',
    submittedQuantity: '2.000000',
    passedQuantity: '2.000000',
    failedQuantity: '0.000000',
    disposition: '通过',
    reworkPassedQuantity: '2.000000',
    reworkFailedQuantity: '0.000000',
    reworkDisposition: '完成',
  })) {
    await wrapper.get(`[name="${name}"]`).setValue(value)
  }
}

function orderWithSecondWorkOrder() {
  return {
    ...orderAggregate,
    items: [
      {
        ...orderAggregate.items[0]!,
        workOrders: [
          orderAggregate.items[0]!.workOrders[0]!,
          {
            ...orderAggregate.items[0]!.workOrders[0]!,
            workOrderId: 'wo-2',
            productionBatchId: 'batch-2',
          },
        ],
      },
    ],
  }
}
