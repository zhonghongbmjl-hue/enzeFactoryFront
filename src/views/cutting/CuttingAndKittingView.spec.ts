import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cuttingApi } from '@/api/cutting'
import { kittingApi } from '@/api/kitting'
import CuttingAndKittingView from './CuttingAndKittingView.vue'

vi.mock('@/api/cutting', () => ({
  cuttingApi: {
    get: vi.fn(),
    create: vi.fn(),
    complete: vi.fn(),
    release: vi.fn(),
    start: vi.fn(),
  },
}))
vi.mock('@/api/kitting', () => ({
  kittingApi: {
    get: vi.fn(),
    releases: vi.fn(),
    release: vi.fn(),
    schedule: vi.fn(),
    check: vi.fn(),
  },
}))

describe('裁剪与齐套工作台', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(cuttingApi.get).mockResolvedValue({
      id: 'cut-id',
      cuttingNo: 'CUT-001',
      materialIssueId: 'issue-id',
      orderItemId: 'order-item',
      skuId: 'sku-id',
      productionBatch: 'PB-001',
      sourceFabricLot: 'LOT-001',
      inputQuantity: '100.000000',
      outputQuantity: '80.000000',
      lossQuantity: '5.000000',
      excessReturnQuantity: '15.000000',
      status: 'COMPLETED',
      version: 3,
      bundles: [
        {
          id: 'bundle-id',
          cuttingOrderId: 'cut-id',
          orderItemId: 'order-item',
          skuId: 'sku-id',
          productionBatch: 'PB-001',
          sourceFabricLot: 'LOT-001',
          bundleNo: 'B01',
          quantity: '80.000000',
          createdAt: '2026-08-24T00:00:00Z',
        },
      ],
    })
    vi.mocked(kittingApi.get).mockResolvedValue({
      id: 'check-id',
      orderItemId: 'order-item',
      skuId: 'sku-id',
      requiredQuantity: '100.000000',
      fabricReadyQuantity: '80.000000',
      accessoryReadyQuantity: '60.000000',
      overallReadyQuantity: '60.000000',
      releasedQuantity: '20.000000',
      remainingQuantity: '40.000000',
      status: 'PARTIALLY_READY',
      version: 1,
    })
    vi.mocked(kittingApi.releases).mockResolvedValue([])
  })

  it('并列显示裁剪来源链、数量守恒和齐套最小值', async () => {
    const wrapper = mount(CuttingAndKittingView)
    await wrapper.get('[data-testid="cutting-query"]').setValue('cut-id')
    await wrapper.get('[data-testid="load-cutting"]').trigger('click')
    await wrapper.get('[data-testid="kitting-query"]').setValue('check-id')
    await wrapper.get('[data-testid="load-kitting"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('领布投入 = 裁片产出 + 损耗 + 余料回库')
    expect(wrapper.text()).toContain('LOT-001')
    expect(wrapper.text()).toContain('PB-001')
    expect(wrapper.text()).toContain('整体齐套 = min(裁片齐套, 辅料齐套)')
    expect(wrapper.get('[data-testid="overall-ready"]').text()).toContain('60')
    expect(wrapper.get('[data-testid="release-remainder"]').text()).toContain('40')
  })

  it('提供创建裁剪、完成裁剪和服务端齐套检查入口', async () => {
    const wrapper = mount(CuttingAndKittingView)

    expect(wrapper.find('[data-testid="create-cutting-form"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="create-kitting-form"]').exists()).toBe(true)
    await wrapper.get('[data-testid="cutting-query"]').setValue('cut-id')
    await wrapper.get('[data-testid="load-cutting"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="complete-cutting-form"]').exists()).toBe(true)
  })

  it('排产动作要求稳定业务引用并按字符串数量提交', async () => {
    vi.mocked(kittingApi.releases).mockResolvedValue([
      {
        id: 'release-id',
        kittingCheckId: 'check-id',
        quantity: '50.000000',
        scheduledQuantity: '0.000000',
        remainingForScheduling: '50.000000',
        idempotencyKey: 'release-key',
        version: 0,
      },
    ])
    vi.mocked(kittingApi.schedule).mockResolvedValue({
      id: 'release-id',
      kittingCheckId: 'check-id',
      quantity: '50.000000',
      scheduledQuantity: '20.000000',
      remainingForScheduling: '30.000000',
      idempotencyKey: 'release-key',
      version: 1,
    })
    const wrapper = mount(CuttingAndKittingView)
    await wrapper.get('[data-testid="kitting-query"]').setValue('check-id')
    await wrapper.get('[data-testid="load-kitting"]').trigger('click')
    await flushPromises()

    await wrapper.get('[data-testid="schedule-reference-release-id"]').setValue('PB-001')
    await wrapper.get('[data-testid="schedule-quantity-release-id"]').setValue('20.000000')
    await wrapper.get('[data-testid="schedule-form-release-id"]').trigger('submit')
    await flushPromises()

    expect(kittingApi.schedule).toHaveBeenCalledWith(
      'release-id',
      '20.000000',
      'PB-001',
      expect.any(String),
    )
  })

  it('齐套释放在响应未知后以同一幂等键重试，业务输入变化后轮换键', async () => {
    vi.mocked(kittingApi.release)
      .mockRejectedValueOnce({ message: '网络中断', outcomeUnknown: true })
      .mockRejectedValueOnce({ message: '网络中断', outcomeUnknown: true })
      .mockResolvedValue({
        id: 'release-new',
        kittingCheckId: 'check-id',
        quantity: '10.000000',
        scheduledQuantity: '0.000000',
        remainingForScheduling: '10.000000',
        idempotencyKey: 'server-key',
        version: 0,
      })
    const wrapper = mount(CuttingAndKittingView)
    await wrapper.get('[data-testid="kitting-query"]').setValue('check-id')
    await wrapper.get('[data-testid="load-kitting"]').trigger('click')
    await flushPromises()

    const releaseInput = wrapper.get('.release-form input')
    await releaseInput.setValue('10.000000')
    await wrapper.get('.release-form').trigger('submit')
    await flushPromises()
    await wrapper.get('.release-form').trigger('submit')
    await flushPromises()

    const firstKey = vi.mocked(kittingApi.release).mock.calls[0]?.[2]
    expect(firstKey).toEqual(expect.any(String))
    expect(vi.mocked(kittingApi.release).mock.calls[1]?.[2]).toBe(firstKey)

    await releaseInput.setValue('11.000000')
    await wrapper.get('.release-form').trigger('submit')
    await flushPromises()
    expect(vi.mocked(kittingApi.release).mock.calls[2]?.[2]).not.toBe(firstKey)
  })
})
