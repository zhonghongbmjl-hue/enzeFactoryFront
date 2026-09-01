import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { ApiClientError } from '@/api/http'
import { productionApi, productionEvidenceApi } from '@/api/production'
import CompletionGateStatus from './CompletionGateStatus.vue'

vi.mock('@/api/production', () => ({
  productionApi: { complete: vi.fn() },
  productionEvidenceApi: { latest: vi.fn() },
}))

const workOrder = {
  id: 'wo-1',
  workOrderNo: 'WO-1',
  status: 'IN_PRODUCTION' as const,
  plannedQuantity: '10.000000',
  totalGoodQuantity: '10.000000',
  totalInputQuantity: '10.000000',
  totalDefectQuantity: '0.000000',
  totalReworkQuantity: '0.000000',
  workInProgressQuantity: '0.000000',
  unstartedQuantity: '0.000000',
  reworkPendingQuantity: '0.000000',
  approvedScrapQuantity: '0.000000',
  version: 7,
} as never

const inspection = {
  id: 'inspection-2',
  result: 'PASSED' as const,
  coverageVerified: true,
  passedQuantity: '10.000000',
  failedQuantity: '0.000000',
  manifest: { id: 'manifest-2', objects: [{ id: 'object-1' }] },
}

describe('CompletionGateStatus', () => {
  it('shows explicit gate facts and keeps completion single-flight', async () => {
    vi.mocked(productionEvidenceApi.latest).mockResolvedValue(inspection as never)
    let resolve!: (value: unknown) => void
    vi.mocked(productionApi.complete).mockReturnValue(
      new Promise((done) => {
        resolve = done
      }) as never,
    )
    const wrapper = mount(CompletionGateStatus, { props: { workOrder } })
    await flushPromises()

    expect(wrapper.text()).toContain('检查版本 #')
    expect(wrapper.text()).toContain('证据对象 1 个')
    await wrapper.get('[data-testid="completion-form"]').trigger('submit')
    await wrapper.get('[data-testid="completion-form"]').trigger('submit')
    expect(productionApi.complete).toHaveBeenCalledTimes(1)
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    resolve({ outcome: 'READY_TO_COMPLETE' })
    await flushPromises()
  })

  it('reuses the same key after an outcome-unknown failure and explains deterministic gates', async () => {
    vi.mocked(productionEvidenceApi.latest).mockResolvedValue(inspection as never)
    vi.mocked(productionApi.complete)
      .mockRejectedValueOnce(
        new ApiClientError('存储暂不可用', 'OBJECT_STORAGE_UNAVAILABLE', undefined, true, 503),
      )
      .mockResolvedValueOnce({ outcome: 'PARTIAL' } as never)
    const wrapper = mount(CompletionGateStatus, { props: { workOrder } })
    await flushPromises()

    await wrapper.get('[data-testid="completion-form"]').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('存储暂不可用')
    await wrapper.get('[data-testid="completion-form"]').trigger('submit')
    await flushPromises()

    const calls = vi.mocked(productionApi.complete).mock.calls
    expect(calls).toHaveLength(2)
    expect(calls[1]?.[2]).toBe(calls[0]?.[2])
  })

  it('keeps the same key while the server reports idempotency processing', async () => {
    vi.mocked(productionEvidenceApi.latest).mockResolvedValue(inspection as never)
    vi.mocked(productionApi.complete)
      .mockRejectedValueOnce(
        new ApiClientError('处理中', 'IDEMPOTENCY_IN_PROGRESS', undefined, false, 409),
      )
      .mockResolvedValueOnce({ outcome: 'PARTIAL' } as never)
    const wrapper = mount(CompletionGateStatus, { props: { workOrder } })
    await flushPromises()

    await wrapper.get('[data-testid="completion-form"]').trigger('submit')
    await flushPromises()
    await wrapper.get('[data-testid="completion-form"]').trigger('submit')
    await flushPromises()

    const calls = vi.mocked(productionApi.complete).mock.calls
    expect(calls).toHaveLength(2)
    expect(calls[1]?.[2]).toBe(calls[0]?.[2])
  })

  it('ignores a completion response after the component switches to another work order', async () => {
    vi.mocked(productionEvidenceApi.latest).mockResolvedValue(inspection as never)
    let resolve!: (value: unknown) => void
    vi.mocked(productionApi.complete).mockReturnValue(
      new Promise((done) => {
        resolve = done
      }) as never,
    )
    const wrapper = mount(CompletionGateStatus, { props: { workOrder } })
    await flushPromises()
    await wrapper.get('[data-testid="completion-form"]').trigger('submit')

    await wrapper.setProps({ workOrder: { ...workOrder, id: 'wo-2', version: 1 } })
    resolve({ outcome: 'READY_TO_COMPLETE' })
    await flushPromises()

    expect(wrapper.emitted('completed')).toBeUndefined()
    expect(wrapper.text()).not.toContain('工单进入待完工')
  })
})
