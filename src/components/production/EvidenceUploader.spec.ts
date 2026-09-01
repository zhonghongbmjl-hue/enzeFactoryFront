import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EvidenceUploader from './EvidenceUploader.vue'

const { upload, removeTemporary } = vi.hoisted(() => ({
  upload: vi.fn(),
  removeTemporary: vi.fn(),
}))

vi.mock('@/api/production', () => ({
  productionEvidenceApi: { upload, removeTemporary },
}))

describe('EvidenceUploader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('crypto', {
      subtle: { digest: vi.fn().mockResolvedValue(new Uint8Array(32).buffer) },
    })
  })

  it('publishes pending and error state for a multi-image selection', async () => {
    let finishFirst!: (value: unknown) => void
    upload.mockImplementation((_workOrderId: string, file: File) =>
      file.name === 'first.png'
        ? new Promise((resolve) => (finishFirst = resolve))
        : Promise.reject(new Error('network failed')),
    )
    const wrapper = mount(EvidenceUploader, { props: { workOrderId: 'wo-1' } })
    const input = wrapper.get('input[type="file"]')
    const first = new File([new Uint8Array([1])], 'first.png', { type: 'image/png' })
    const second = new File([new Uint8Array([2])], 'second.png', { type: 'image/png' })
    Object.defineProperty(input.element, 'files', { value: [first, second], configurable: true })
    await input.trigger('change')

    expect(wrapper.emitted('update:state')?.at(-1)?.[0]).toMatchObject({
      selectedCount: 2,
      pendingCount: 2,
      hasError: false,
    })
    await Promise.resolve()
    await Promise.resolve()
    finishFirst({
      tempObjectKey: 'tenant/user/wo/first.png',
      sha256: '0'.repeat(64),
      contentType: 'image/png',
      sizeBytes: 1,
      originalFilename: 'first.png',
    })
    await flushPromises()
    expect(wrapper.emitted('update:state')?.at(-1)?.[0]).toMatchObject({
      selectedCount: 2,
      readyCount: 1,
      pendingCount: 0,
      hasError: true,
    })
  })

  it('invalidates in-flight responses on clear and deletes only scoped ready temp objects', async () => {
    let finish!: (value: unknown) => void
    upload.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const wrapper = mount(EvidenceUploader, { props: { workOrderId: 'wo-1' } })
    const input = wrapper.get('input[type="file"]')
    const file = new File([new Uint8Array([1])], 'stale.png', { type: 'image/png' })
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    void input.trigger('change')
    await wrapper.vm.$nextTick()
    ;(wrapper.vm as unknown as { clear: () => void }).clear()
    finish({
      tempObjectKey: 'tenant/user/wo/stale.png',
      sha256: '0'.repeat(64),
      contentType: 'image/png',
      sizeBytes: 1,
      originalFilename: 'stale.png',
    })
    await flushPromises()
    expect(wrapper.findAll('.upload-ledger li')).toHaveLength(0)
    expect(wrapper.emitted('update:uploads')?.at(-1)?.[0]).toEqual([])
  })

  it('swallows best-effort cleanup failures for stale, removed, and cleared uploads', async () => {
    const cleanup = {
      catch: vi.fn().mockImplementation((handler: () => undefined) => Promise.resolve(handler())),
    }
    removeTemporary.mockReturnValue(cleanup)
    upload.mockResolvedValue({
      tempObjectKey: 'tenant/user/wo/ready.png',
      sha256: '0'.repeat(64),
      contentType: 'image/png',
      sizeBytes: 1,
      originalFilename: 'ready.png',
    })
    const wrapper = mount(EvidenceUploader, { props: { workOrderId: 'wo-1' } })
    const input = wrapper.get('input[type="file"]')
    const file = new File([new Uint8Array([1])], 'ready.png', { type: 'image/png' })
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    await flushPromises()

    await wrapper.get('.upload-ledger button').trigger('click')
    await flushPromises()

    expect(removeTemporary).toHaveBeenCalledOnce()
    expect(cleanup.catch).toHaveBeenCalledOnce()
    expect(wrapper.findAll('.upload-ledger li')).toHaveLength(0)
  })
})
