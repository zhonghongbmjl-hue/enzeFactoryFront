import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { salesOrderApi } from '@/api/orders'
import { ApiClientError } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import { clearTenantCaches } from '@/stores/tenantCache'
import type { SalesOrder } from '@/types/order'
import OrderTimeline from '@/components/order/OrderTimeline.vue'
import SalesOrderDetailView from './SalesOrderDetailView.vue'
import SalesOrderListView from './SalesOrderListView.vue'
import { shipmentMutationStorageKey } from '../shipment/shipmentMutationFlight'

vi.mock('@/api/orders', () => ({
  salesOrderApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    action: vi.fn(),
    uploadManualDeliveryEvidence: vi.fn(),
    confirmManualDelivery: vi.fn(),
  },
}))

const order: SalesOrder = {
  id: 'order-id',
  orderNo: 'PO-20260824-001',
  customerId: 'customer-id',
  customerCode: 'VIP-01',
  customerName: '华东客户',
  orderDate: '2026-08-24',
  status: 'PENDING_APPROVAL',
  version: 2,
  items: [
    {
      id: 'item-id',
      productId: 'product-id',
      skuId: 'sku-id',
      color: '藏青',
      size: 'M',
      fit: 'REGULAR',
      quantity: 100,
      deliveryDate: '2026-09-12',
      specialProcess: '锁边',
      unitPrice: 99.9,
      productionCompletedQuantity: '30.000000',
      productionStatus: 'PARTIAL',
      version: 0,
    },
  ],
  bomSnapshots: [
    {
      id: 'snapshot-id',
      orderItemId: 'item-id',
      productId: 'product-id',
      styleNo: 'STYLE-01',
      skuId: 'sku-id',
      skuCode: 'STYLE-01-NV-M',
      sourceProductVersion: 7,
      sourceSkuVersion: 11,
      sourceBomVersionId: 'bom-id',
      sourceBomVersionNo: 'BOM-V3',
      items: [
        {
          materialId: 'material-id',
          materialType: 'FABRIC',
          materialCode: 'FAB-01',
          materialName: '主面料',
          usageQuantity: 1.25,
          lossRate: 0.08,
          uom: 'm',
          specification: '150CM',
        },
      ],
    },
  ],
  requirements: [
    {
      id: 'requirement-id',
      orderItemId: 'item-id',
      materialId: 'material-id',
      materialType: 'FABRIC',
      materialCode: 'FAB-01',
      materialName: '主面料',
      uom: 'm',
      usageQuantity: 1.25,
      lossRate: 0.08,
      grossQuantity: 135,
      availableQuantity: 80,
      reservedQuantity: 80,
      netRequirementQuantity: 55,
    },
  ],
  progress: { materialPercent: 80, productionPercent: 30, qualityPercent: 0, shipmentPercent: 0 },
  history: [
    {
      id: 'history-id',
      action: 'SUBMIT',
      fromStatus: 'DRAFT',
      toStatus: 'PENDING_APPROVAL',
      actorId: 'user-id',
      actorName: '王跟单',
      occurredAt: '2026-08-24T08:30:00Z',
    },
  ],
  submittedAt: '2026-08-24T08:30:00Z',
  createdAt: '2026-08-24T08:00:00Z',
  updatedAt: '2026-08-24T08:30:00Z',
}

describe('订单页面', () => {
  beforeEach(() => {
    clearTenantCaches()
    sessionStorage.clear()
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(salesOrderApi.list).mockResolvedValue({
      content: [order],
      totalElements: 1,
      totalPages: 1,
      page: 0,
      size: 20,
    })
    vi.mocked(salesOrderApi.get).mockResolvedValue(order)
  })

  function permissions(values: string[]): void {
    const auth = useAuthStore()
    auth.profile = {
      userId: '11111111-1111-4111-8111-111111111111',
      username: 'tester',
      displayName: '测试员',
      tenantId: '22222222-2222-4222-8222-222222222222',
      tenantCode: 'test',
      roles: ['TEST'],
      permissions: values,
    }
    auth.generation = 1
  }

  it('列表将订单主状态与四维执行进度分开展示', async () => {
    permissions(['ORDER_VIEW'])
    const wrapper = mount(SalesOrderListView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
    expect(wrapper.text()).toContain('订单履约台账')
    expect(wrapper.text()).toContain('待审核')
    expect(wrapper.text()).toContain('物料 80%')
    expect(wrapper.text()).toContain('生产 30%')
    expect(wrapper.find('[data-testid="create-order"]').exists()).toBe(false)
  })

  it('时间线保留完整生命周期且独立显示当前执行进度', () => {
    const wrapper = mount(OrderTimeline, {
      props: { status: 'IN_PRODUCTION', progress: order.progress },
    })
    expect(wrapper.text()).toContain('待审核')
    expect(wrapper.text()).toContain('物料准备中')
    expect(wrapper.text()).toContain('生产中')
    expect(wrapper.text()).toContain('质检')
    expect(wrapper.text()).toContain('售后观察')
    expect(wrapper.text()).toContain('订单完成')
    expect(wrapper.get('[aria-label="订单执行进度"]').text()).toContain('30%')
  })

  it('详情展示冻结BOM、物料缺口与审计历史，并按状态权限暴露审核动作', async () => {
    permissions(['ORDER_VIEW', 'ORDER_APPROVE'])
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/orders/:id', component: SalesOrderDetailView }],
    })
    await router.push('/orders/order-id')
    await router.isReady()
    const wrapper = mount(SalesOrderDetailView, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.text()).toContain('BOM-V3')
    expect(wrapper.text()).toContain('产品 v7 · SKU v11')
    expect(wrapper.text()).toContain('FAB-01')
    expect(wrapper.text()).toContain('净缺口')
    expect(wrapper.text()).toContain('王跟单')
    expect(wrapper.text()).toContain('30.000000 / 100 · 部分完成')
    expect(wrapper.find('[data-testid="approve-order"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="cancel-order"]').exists()).toBe(false)
  })

  it('生命周期动作pending时阻止重复提交并回显服务端冲突追踪号', async () => {
    permissions(['ORDER_VIEW', 'ORDER_APPROVE'])
    let reject!: (reason: unknown) => void
    vi.mocked(salesOrderApi.action).mockReturnValueOnce(
      new Promise((_resolve, failed) => (reject = failed)),
    )
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/orders/:id', component: SalesOrderDetailView }],
    })
    await router.push('/orders/order-id')
    await router.isReady()
    const wrapper = mount(SalesOrderDetailView, { global: { plugins: [router] } })
    await flushPromises()
    const approve = wrapper.get('[data-testid="approve-order"]')
    await approve.trigger('click')
    await approve.trigger('click')
    expect(salesOrderApi.action).toHaveBeenCalledTimes(1)
    expect(approve.attributes('disabled')).toBeDefined()
    reject({ message: '订单版本冲突', traceId: 'trace-order-409' })
    await flushPromises()
    expect(wrapper.text()).toContain('订单版本冲突')
    expect(wrapper.text()).toContain('trace-order-409')
  })

  it('人工送达入口仅对高权限已发货订单可见，冻结真实图片后确认并刷新状态', async () => {
    const manualOrderId = '33333333-3333-4333-8333-333333333333'
    const evidenceId = '44444444-4444-4444-8444-444444444444'
    const shippedOrder: SalesOrder = {
      ...order,
      id: manualOrderId,
      status: 'SHIPPED',
      version: 9,
    }
    const observingOrder: SalesOrder = {
      ...shippedOrder,
      status: 'AFTER_SALES_OBSERVATION',
      version: 10,
    }
    vi.mocked(salesOrderApi.get)
      .mockResolvedValueOnce(shippedOrder)
      .mockResolvedValueOnce(observingOrder)
    vi.mocked(salesOrderApi.uploadManualDeliveryEvidence).mockResolvedValue({
      id: evidenceId,
      salesOrderId: manualOrderId,
      sha256: 'a'.repeat(64),
      sizeBytes: 8,
      contentType: 'image/png',
      originalFilename: 'delivery.png',
      frozenAt: '2026-08-25T09:00:00Z',
    })
    vi.mocked(salesOrderApi.confirmManualDelivery).mockResolvedValue({
      id: 'confirmation-id',
      salesOrderId: manualOrderId,
      evidenceManifestId: evidenceId,
      reason: '承运方无签收回传，人工核验客户已收货',
      confirmedDeliveredAt: '2026-08-25T10:00:00Z',
      confirmedBy: 'user-id',
      createdAt: '2026-08-25T10:01:00Z',
    })
    permissions(['ORDER_VIEW', 'ORDER_MANUAL_CLOSE'])
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/orders/:id', component: SalesOrderDetailView }],
    })
    await router.push(`/orders/${manualOrderId}`)
    await router.isReady()
    const wrapper = mount(SalesOrderDetailView, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.find('[data-testid="manual-delivery-panel"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('不会立即关闭订单')

    const file = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      'delivery.png',
      { type: 'image/png' },
    )
    const fileInput = wrapper.get('[data-testid="manual-delivery-file"]')
    Object.defineProperty(fileInput.element, 'files', { configurable: true, value: [file] })
    await fileInput.trigger('change')
    await wrapper.get('[data-testid="manual-delivery-time"]').setValue('2026-08-25T18:00')
    await wrapper
      .get('[data-testid="manual-delivery-reason"]')
      .setValue('承运方无签收回传，人工核验客户已收货')
    await wrapper.get('[data-testid="confirm-manual-delivery"]').trigger('click')
    await flushPromises()

    expect(salesOrderApi.uploadManualDeliveryEvidence).toHaveBeenCalledWith(
      manualOrderId,
      file,
      expect.any(String),
    )
    expect(salesOrderApi.confirmManualDelivery).toHaveBeenCalledWith(
      manualOrderId,
      expect.objectContaining({
        expectedVersion: 9,
        reason: '承运方无签收回传，人工核验客户已收货',
        evidenceManifestId: evidenceId,
      }),
      expect.any(String),
    )
    expect(salesOrderApi.get).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('售后观察')
    expect(wrapper.find('[data-testid="manual-delivery-panel"]').exists()).toBe(false)
  })

  it('人工送达确认响应丢失后刷新页面仍以原scope和原幂等key重放', async () => {
    const manualOrderId = '33333333-3333-4333-8333-333333333333'
    const evidenceId = '44444444-4444-4444-8444-444444444444'
    const shippedOrder: SalesOrder = {
      ...order,
      id: manualOrderId,
      status: 'SHIPPED',
      version: 9,
    }
    const observingOrder: SalesOrder = {
      ...shippedOrder,
      status: 'AFTER_SALES_OBSERVATION',
      version: 10,
    }
    vi.mocked(salesOrderApi.get)
      .mockResolvedValueOnce(shippedOrder)
      .mockResolvedValueOnce(shippedOrder)
      .mockResolvedValueOnce(observingOrder)
    vi.mocked(salesOrderApi.uploadManualDeliveryEvidence).mockResolvedValue({
      id: evidenceId,
      salesOrderId: manualOrderId,
      sha256: 'a'.repeat(64),
      sizeBytes: 68,
      contentType: 'image/png',
      originalFilename: 'delivery.png',
      frozenAt: '2026-08-25T09:00:00Z',
    })
    vi.mocked(salesOrderApi.confirmManualDelivery)
      .mockRejectedValueOnce(
        new ApiClientError('响应丢失', 'REQUEST_FAILED', 'trace-lost', true, 503),
      )
      .mockResolvedValueOnce({
        id: '55555555-5555-4555-8555-555555555555',
        salesOrderId: manualOrderId,
        evidenceManifestId: evidenceId,
        reason: '承运方无签收回传，人工核验客户已收货',
        confirmedDeliveredAt: '2026-08-25T10:00:00.000Z',
        confirmedBy: '11111111-1111-4111-8111-111111111111',
        createdAt: '2026-08-25T10:01:00Z',
      })
    permissions(['ORDER_VIEW', 'ORDER_MANUAL_CLOSE'])
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/orders/:id', component: SalesOrderDetailView }],
    })
    await router.push(`/orders/${manualOrderId}`)
    await router.isReady()
    const first = mount(SalesOrderDetailView, { global: { plugins: [router] } })
    await flushPromises()

    const file = new File([new Uint8Array(68)], 'delivery.png', { type: 'image/png' })
    const fileInput = first.get('[data-testid="manual-delivery-file"]')
    Object.defineProperty(fileInput.element, 'files', { configurable: true, value: [file] })
    await fileInput.trigger('change')
    await first.get('[data-testid="manual-delivery-time"]').setValue('2026-08-25T18:00')
    await first
      .get('[data-testid="manual-delivery-reason"]')
      .setValue('承运方无签收回传，人工核验客户已收货')
    await first.get('[data-testid="confirm-manual-delivery"]').trigger('click')
    await flushPromises()

    const persisted = JSON.parse(sessionStorage.getItem(shipmentMutationStorageKey)!)
    expect(persisted.scope).toEqual({
      tenantId: '22222222-2222-4222-8222-222222222222',
      userId: '11111111-1111-4111-8111-111111111111',
      authGeneration: 1,
    })
    expect(persisted.status).toBe('OUTCOME_UNKNOWN')
    expect(persisted.request.name).toBe('confirmManualDelivery')
    const originalKey = persisted.key
    first.unmount()

    const refreshedRouter = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/orders/:id', component: SalesOrderDetailView }],
    })
    await refreshedRouter.push(`/orders/${manualOrderId}`)
    await refreshedRouter.isReady()
    const second = mount(SalesOrderDetailView, { global: { plugins: [refreshedRouter] } })
    await flushPromises()
    expect(salesOrderApi.confirmManualDelivery).toHaveBeenCalledTimes(2)
    expect(vi.mocked(salesOrderApi.confirmManualDelivery).mock.calls[0]?.[2]).toBe(originalKey)
    expect(vi.mocked(salesOrderApi.confirmManualDelivery).mock.calls[1]?.[2]).toBe(originalKey)
    expect(sessionStorage.getItem(shipmentMutationStorageKey)).toBeNull()
    expect(second.text()).toContain('售后观察')
  })

  it('无人工结案高权限时不展示人工送达入口', async () => {
    vi.mocked(salesOrderApi.get).mockResolvedValue({ ...order, status: 'SHIPPED' })
    permissions(['ORDER_VIEW', 'ORDER_APPROVE'])
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/orders/:id', component: SalesOrderDetailView }],
    })
    await router.push('/orders/order-id')
    await router.isReady()
    const wrapper = mount(SalesOrderDetailView, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.find('[data-testid="manual-delivery-panel"]').exists()).toBe(false)
  })
})
