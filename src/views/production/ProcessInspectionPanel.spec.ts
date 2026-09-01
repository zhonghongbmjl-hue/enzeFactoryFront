import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProcessInspectionPanel from './ProcessInspectionPanel.vue'
import { ApiClientError } from '@/api/http'

const { latest, submit, upload, createCorrection, completeCorrection } = vi.hoisted(() => ({
  latest: vi.fn(),
  submit: vi.fn(),
  upload: vi.fn(),
  createCorrection: vi.fn(),
  completeCorrection: vi.fn(),
}))

vi.mock('@/api/production', () => ({
  productionEvidenceApi: { latest, submit, upload, createCorrection, completeCorrection },
}))

describe('ProcessInspectionPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    latest.mockResolvedValue(null)
  })

  it('requires uploaded evidence and keeps submission single-flight', async () => {
    let resolveSubmit!: (value: unknown) => void
    submit.mockReturnValue(new Promise((resolve) => (resolveSubmit = resolve)))
    const wrapper = mount(ProcessInspectionPanel, {
      props: { workOrderId: 'wo-1', workOrderStatus: 'IN_PRODUCTION' },
    })
    await flushPromises()

    expect(wrapper.get('[data-testid="inspection-submit"]').attributes('disabled')).toBeDefined()
    const uploader = wrapper.findComponent({ name: 'EvidenceUploader' })
    const exposed = (uploader.vm as unknown as { $: { exposed: { clear: () => void } } }).$.exposed
    const clearUploader = vi.spyOn(exposed, 'clear')
    uploader.vm.$emit('update:uploads', [
      { tempObjectKey: 'tenant/user/wo/file.png', sha256: 'a'.repeat(64) },
    ])
    uploader.vm.$emit('update:state', {
      selectedCount: 1,
      readyCount: 1,
      pendingCount: 0,
      hasError: false,
    })
    await wrapper.get('[name="inspector"]').setValue('巡检员')
    await wrapper.get('[data-testid="inspection-submit"]').trigger('click')
    await wrapper.get('[data-testid="inspection-submit"]').trigger('click')
    expect(submit).toHaveBeenCalledTimes(1)
    resolveSubmit({ id: 'inspection-1', manifest: { objects: [] } })
    await flushPromises()
    expect(clearUploader).toHaveBeenCalledOnce()
  })

  it('does not show a stale latest response after a newer refresh', async () => {
    let resolveOld!: (value: unknown) => void
    latest
      .mockReturnValueOnce(new Promise((resolve) => (resolveOld = resolve)))
      .mockResolvedValueOnce({
        id: 'new',
        result: 'PASSED',
        inspectionVersion: 2,
        inspector: 'new',
        remarks: null,
        correction: null,
        manifest: { objects: [], aggregateSha256: 'a'.repeat(64) },
      })
    const wrapper = mount(ProcessInspectionPanel, {
      props: { workOrderId: 'wo-1', workOrderStatus: 'IN_PRODUCTION' },
    })
    await (wrapper.vm as unknown as { refresh: () => Promise<void> }).refresh()
    resolveOld({ id: 'old', result: 'FAILED', manifest: { objects: [] } })
    await flushPromises()
    expect(wrapper.text()).toContain('已通过')
    expect(wrapper.text()).not.toContain('未通过')
  })

  it('blocks submission while any selected upload is pending or failed', async () => {
    const wrapper = mount(ProcessInspectionPanel, {
      props: { workOrderId: 'wo-1', workOrderStatus: 'IN_PRODUCTION' },
    })
    await flushPromises()
    const uploader = wrapper.findComponent({ name: 'EvidenceUploader' })
    uploader.vm.$emit('update:uploads', [
      { tempObjectKey: 'tenant/user/wo/first.png', sha256: 'a'.repeat(64) },
    ])
    uploader.vm.$emit('update:state', {
      selectedCount: 2,
      readyCount: 1,
      pendingCount: 1,
      hasError: false,
    })
    await wrapper.get('[name="inspector"]').setValue('巡检员')
    expect(wrapper.get('[data-testid="inspection-submit"]').attributes('disabled')).toBeDefined()

    uploader.vm.$emit('update:state', {
      selectedCount: 2,
      readyCount: 1,
      pendingCount: 0,
      hasError: true,
    })
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[data-testid="inspection-submit"]').attributes('disabled')).toBeDefined()

    uploader.vm.$emit('update:uploads', [
      { tempObjectKey: 'tenant/user/wo/first.png', sha256: 'a'.repeat(64) },
      { tempObjectKey: 'tenant/user/wo/second.png', sha256: 'b'.repeat(64) },
    ])
    uploader.vm.$emit('update:state', {
      selectedCount: 2,
      readyCount: 2,
      pendingCount: 0,
      hasError: false,
    })
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[data-testid="inspection-submit"]').attributes('disabled')).toBeUndefined()
  })

  it('reuses the same idempotency key while the backend outcome is still in progress', async () => {
    submit
      .mockRejectedValueOnce(
        new ApiClientError('仍在处理', 'IDEMPOTENCY_IN_PROGRESS', 'trace', true, 409),
      )
      .mockResolvedValueOnce({ id: 'inspection-1', manifest: { objects: [] } })
    const wrapper = mount(ProcessInspectionPanel, {
      props: { workOrderId: 'wo-1', workOrderStatus: 'IN_PRODUCTION' },
    })
    await flushPromises()
    const uploader = wrapper.findComponent({ name: 'EvidenceUploader' })
    uploader.vm.$emit('update:uploads', [
      { tempObjectKey: 'tenant/user/wo/file.png', sha256: 'a'.repeat(64) },
    ])
    uploader.vm.$emit('update:state', {
      selectedCount: 1,
      readyCount: 1,
      pendingCount: 0,
      hasError: false,
    })
    await wrapper.get('[name="inspector"]').setValue('巡检员')

    await wrapper.get('[data-testid="inspection-submit"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="inspection-submit"]').trigger('click')
    await flushPromises()

    expect(submit).toHaveBeenCalledTimes(2)
    expect(submit.mock.calls[1]?.[2]).toBe(submit.mock.calls[0]?.[2])
  })
})
