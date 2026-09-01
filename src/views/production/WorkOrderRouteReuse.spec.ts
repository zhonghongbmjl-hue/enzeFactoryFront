import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'
import { productionApi } from '@/api/production'
import WorkOrderDetailView from './WorkOrderDetailView.vue'

vi.mock('@/api/production', () => ({
  productionApi: {
    get: vi.fn(),
    reports: vi.fn(),
    report: vi.fn(),
    submit: vi.fn(),
    approve: vi.fn(),
    release: vi.fn(),
    complete: vi.fn(),
  },
  productionEvidenceApi: {
    latest: vi.fn().mockResolvedValue(null),
    upload: vi.fn(),
    removeTemporary: vi.fn(),
    submit: vi.fn(),
    createCorrection: vi.fn(),
    completeCorrection: vi.fn(),
  },
}))

const order = (id: string) =>
  ({
    id,
    workOrderNo: `WO-${id}`,
    status: 'IN_PRODUCTION',
    plannedQuantity: '1.000000',
    totalInputQuantity: '1.000000',
    totalGoodQuantity: '1.000000',
    totalDefectQuantity: '0.000000',
    totalReworkQuantity: '0.000000',
    workInProgressQuantity: '0.000000',
    reworkPendingQuantity: '0.000000',
    approvedScrapQuantity: '0.000000',
    unstartedQuantity: '0.000000',
    productionLineId: 'line',
    productionBatch: { plannedBatchCode: `PB-${id}` },
    version: 1,
  }) as never

describe('WorkOrderDetailView route reuse', () => {
  it('invalidates deferred A loads and renders B after a real router push from A to B', async () => {
    const coreA = deferred<ReturnType<typeof order>>()
    const reportsA = deferred<Awaited<ReturnType<typeof productionApi.reports>>>()
    vi.mocked(productionApi.get)
      .mockReturnValueOnce(coreA.promise)
      .mockResolvedValueOnce(order('B'))
    vi.mocked(productionApi.reports)
      .mockReturnValueOnce(reportsA.promise)
      .mockResolvedValueOnce({ content: [], totalElements: 0, totalPages: 0, page: 0, size: 20 })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/work-orders/:id', component: WorkOrderDetailView }],
    })
    await router.push('/work-orders/A')
    await router.isReady()
    const wrapper = mount({ template: '<router-view />' }, { global: { plugins: [router] } })
    await flushPromises()

    await router.push('/work-orders/B')
    await flushPromises()
    coreA.resolve(order('A'))
    reportsA.resolve({ content: [], totalElements: 0, totalPages: 0, page: 0, size: 20 })
    await flushPromises()

    expect(productionApi.get).toHaveBeenNthCalledWith(2, 'B')
    expect(wrapper.text()).toContain('WO-B')
    expect(wrapper.text()).not.toContain('WO-A')
  })

  it('does not let a deferred completion from A emit a reload after routing to B', async () => {
    const completion = deferred<{ outcome: 'READY_TO_COMPLETE' }>()
    vi.mocked(productionApi.get).mockResolvedValueOnce(order('A')).mockResolvedValueOnce(order('B'))
    vi.mocked(productionApi.reports).mockResolvedValue({
      content: [],
      totalElements: 0,
      totalPages: 0,
      page: 0,
      size: 20,
    })
    vi.mocked(productionApi.complete).mockReturnValue(completion.promise as never)
    const inspection = {
      id: 'inspection-a',
      inspectionVersion: 1,
      result: 'PASSED',
      coverageVerified: true,
      passedQuantity: '1.000000',
      failedQuantity: '0.000000',
      inspector: 'Inspector',
      manifest: {
        id: 'manifest-a',
        aggregateSha256: 'a'.repeat(64),
        totalBytes: 8,
        objects: [{ id: 'object-a' }],
      },
    }
    const { productionEvidenceApi } = await import('@/api/production')
    vi.mocked(productionEvidenceApi.latest)
      .mockResolvedValueOnce(inspection as never)
      .mockResolvedValueOnce(null)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/work-orders/:id', component: WorkOrderDetailView }],
    })
    await router.push('/work-orders/A')
    await router.isReady()
    const wrapper = mount({ template: '<router-view />' }, { global: { plugins: [router] } })
    await flushPromises()
    await wrapper.get('[data-testid="completion-form"]').trigger('submit')

    await router.push('/work-orders/B')
    await flushPromises()
    completion.resolve({ outcome: 'READY_TO_COMPLETE' })
    await flushPromises()

    expect(productionApi.get).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('WO-B')
    expect(wrapper.text()).not.toContain('工单进入待完工')
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
