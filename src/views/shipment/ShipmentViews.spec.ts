import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { shipmentApi } from '@/api/shipment'
import { useAuthStore } from '@/stores/auth'
import type { AfterSalesCase, ShipmentOrderWorkspace } from '@/types/shipment'
import AfterSalesReworkView from './AfterSalesReworkView.vue'
import ShipmentWorkspaceView from './ShipmentWorkspaceView.vue'

vi.mock('@/api/shipment', () => ({
  shipmentApi: {
    orderWorkspace: vi.fn(),
    getShipment: vi.fn(),
    requestApproval: vi.fn(),
    approve: vi.fn(),
    dispatch: vi.fn(),
    sign: vi.fn(),
    pack: vi.fn(),
    createShipment: vi.fn(),
    getAfterSales: vi.fn(),
    receiveAfterSales: vi.fn(),
    transitionAfterSales: vi.fn(),
  },
}))

const ORDER = '11111111-1111-4111-8111-111111111111'
const SHIPMENT = '22222222-2222-4222-8222-222222222222'
const SHIPMENT_LINE = '33333333-3333-4333-8333-333333333333'
const SHIPMENT_LINE_2 = '77777777-7777-4777-8777-777777777777'
const AFTER_SALES = '44444444-4444-4444-8444-444444444444'
const TENANT = '55555555-5555-4555-8555-555555555555'
const USER = '66666666-6666-4666-8666-666666666666'
const BOX_1 = '88888888-8888-4888-8888-888888888888'
const PACKING_ITEM_1 = '99999999-9999-4999-8999-999999999999'
const BOX_2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PACKING_ITEM_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const workspace: ShipmentOrderWorkspace = {
  salesOrderId: ORDER,
  qualityPassedQuantity: '10.000000',
  packedQuantity: '8.000000',
  packableQuantity: '2.000000',
  plannedShipmentQuantity: '8.000000',
  dispatchedQuantity: '5.000000',
  signedQuantity: '3.000000',
  observationBaseline: '2026-08-25T03:00:00Z',
  observationDeadline: '2026-09-01T03:00:00Z',
  observationPeriodEnded: false,
  allShipmentsSigned: false,
  allExceptionsClosed: false,
  boxes: [
    {
      id: BOX_1,
      boxNo: 'BOX-001',
      totalQuantity: '8.000000',
      createdAt: '2026-08-25T01:00:00Z',
      lines: [
        {
          id: PACKING_ITEM_1,
          qualityInspectionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          workOrderId: 'work-order-1',
          productionBatchId: 'batch-1',
          orderItemId: 'item-1',
          skuId: 'sku-1',
          quantity: '8.000000',
        },
      ],
    },
    {
      id: BOX_2,
      boxNo: 'BOX-002',
      totalQuantity: '2.000000',
      createdAt: '2026-08-25T01:02:00Z',
      lines: [
        {
          id: PACKING_ITEM_2,
          qualityInspectionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          workOrderId: 'work-order-2',
          productionBatchId: 'batch-2',
          orderItemId: 'item-2',
          skuId: 'sku-2',
          quantity: '2.000000',
        },
      ],
    },
  ],
  shipments: [
    {
      id: SHIPMENT,
      salesOrderId: ORDER,
      status: 'PARTIALLY_SIGNED',
      requesterId: 'user-requester',
      approverId: 'user-approver',
      requestedAt: '2026-08-25T01:10:00Z',
      approvedAt: '2026-08-25T01:20:00Z',
      signedAt: null,
      version: 4,
      lines: [
        {
          id: SHIPMENT_LINE,
          packingOrderId: BOX_1,
          packingItemId: PACKING_ITEM_1,
          orderItemId: 'item-1',
          skuId: 'sku-1',
          plannedQuantity: '8.000000',
          dispatchedQuantity: '5.000000',
          signedQuantity: '3.000000',
        },
        {
          id: SHIPMENT_LINE_2,
          packingOrderId: BOX_2,
          packingItemId: PACKING_ITEM_2,
          orderItemId: 'item-2',
          skuId: 'sku-2',
          plannedQuantity: '2.000000',
          dispatchedQuantity: '0.000000',
          signedQuantity: '0.000000',
        },
      ],
    },
  ],
}

const afterSales: AfterSalesCase = {
  id: AFTER_SALES,
  salesOrderId: ORDER,
  orderItemId: 'item-1',
  skuId: 'sku-1',
  productionBatchId: 'batch-1',
  workOrderId: 'work-order-1',
  originalPackingOrderId: BOX_1,
  originalPackingItemId: PACKING_ITEM_1,
  originalShipmentId: SHIPMENT,
  quantity: '2.000000',
  reasonCode: 'SEAM_OPEN',
  customerFeedback: '客户反馈开线',
  returnCarrier: null,
  returnTrackingNo: null,
  status: 'CREATED',
  returnInTransitAt: null,
  receivedAt: null,
  signedAt: null,
  completedAt: null,
  reworkRecordId: null,
  afterSalesInspectionId: null,
  repackingOrderId: null,
  reshipmentId: null,
  reconciliationIssueId: null,
  version: 0,
  currentReworkStatus: null,
  attemptCount: 0,
  cumulativePassed: '0.000000',
  releasedQuantity: '0.000000',
  disposedQuantity: '0.000000',
  remainingQuantity: '2.000000',
  currentDisposition: null,
  effectiveNextAction: 'RETURN_TRANSIT',
  effectiveNextPermission: 'AFTER_SALES_MANAGE',
  dispositionApprovalAllowed: false,
}

describe('包装发运与售后返工工作台', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(shipmentApi.orderWorkspace).mockResolvedValue(structuredClone(workspace))
    vi.mocked(shipmentApi.getAfterSales).mockResolvedValue(structuredClone(afterSales))
  })

  function permissions(values: string[], userId = 'manager-1'): void {
    const auth = useAuthStore()
    auth.generation = 1
    auth.profile = {
      userId: userId === 'manager-1' ? USER : userId,
      username: 'shipment-user',
      displayName: '发运主管',
      tenantId: TENANT,
      tenantCode: 'factory-a',
      roles: ['SHIPMENT'],
      permissions: values,
    }
  }

  async function renderShipment() {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/shipments/:orderId', component: ShipmentWorkspaceView }],
    })
    await router.push(`/shipments/${ORDER}`)
    await router.isReady()
    const wrapper = mount(ShipmentWorkspaceView, { global: { plugins: [router] } })
    await flushPromises()
    return wrapper
  }

  async function renderAfterSales() {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/after-sales/:caseId', component: AfterSalesReworkView }],
    })
    await router.push(`/after-sales/${AFTER_SALES}`)
    await router.isReady()
    const wrapper = mount(AfterSalesReworkView, { global: { plugins: [router] } })
    await flushPromises()
    return wrapper
  }

  it('展示后端权威的可包装量、装箱守恒、审批身份、部分发运签收和观察截止', async () => {
    permissions(['SHIPMENT_VIEW'])
    const wrapper = await renderShipment()
    expect(wrapper.text()).toContain('质量合格 10.000000')
    expect(wrapper.text()).toContain('已装箱 8.000000')
    expect(wrapper.text()).toContain('可包装 2.000000')
    expect(wrapper.text()).toContain('BOX-001')
    expect(wrapper.text()).toContain('申请人 user-requester')
    expect(wrapper.text()).toContain('审批人 user-approver')
    expect(wrapper.text()).toContain('发运 5.000000 / 8.000000')
    expect(wrapper.text()).toContain('签收 3.000000 / 8.000000')
    expect(wrapper.text()).toContain('2026-09-01')
    expect(wrapper.find(`[data-testid="approve-${SHIPMENT}"]`).exists()).toBe(false)
  })

  it('审批携带expectedVersion并全局阻止双击，成功后读取权威工作台', async () => {
    permissions(['SHIPMENT_VIEW', 'SHIPMENT_APPROVE'])
    vi.mocked(shipmentApi.orderWorkspace).mockResolvedValue({
      ...structuredClone(workspace),
      shipments: [{ ...structuredClone(workspace.shipments[0]!), status: 'PENDING_APPROVAL' }],
    })
    let resolve!: () => void
    vi.mocked(shipmentApi.approve).mockReturnValueOnce(
      new Promise((done) => (resolve = () => done(workspace.shipments[0]!))),
    )
    const wrapper = await renderShipment()
    const button = wrapper.get(`[data-testid="approve-${SHIPMENT}"]`)
    await button.trigger('click')
    await button.trigger('click')
    expect(shipmentApi.approve).toHaveBeenCalledTimes(1)
    expect(shipmentApi.approve).toHaveBeenCalledWith(SHIPMENT, 4, expect.any(String))
    resolve()
    await flushPromises()
    expect(shipmentApi.orderWorkspace).toHaveBeenCalledTimes(2)
  })

  it('逐行收集多明细数量并提交完整的部分发运集合', async () => {
    permissions(['SHIPMENT_VIEW', 'SHIPMENT_MANAGE'])
    vi.mocked(shipmentApi.orderWorkspace).mockResolvedValue({
      ...structuredClone(workspace),
      shipments: [{ ...structuredClone(workspace.shipments[0]!), status: 'APPROVED' }],
    })
    const wrapper = await renderShipment()
    await wrapper.get(`[data-testid="progress-${SHIPMENT_LINE}"]`).setValue('1.000000')
    await wrapper.get(`[data-testid="progress-${SHIPMENT_LINE_2}"]`).setValue('0.500000')
    await wrapper.get(`[data-testid="dispatch-${SHIPMENT}"]`).trigger('click')
    expect(shipmentApi.dispatch).toHaveBeenCalledWith(
      SHIPMENT,
      4,
      [
        { shipmentLineId: SHIPMENT_LINE, quantity: '1.000000' },
        { shipmentLineId: SHIPMENT_LINE_2, quantity: '0.500000' },
      ],
      expect.any(String),
    )
  })

  it('从多个包装箱选择每条包装明细并创建完整发运计划', async () => {
    permissions(['SHIPMENT_VIEW', 'SHIPMENT_MANAGE'])
    const wrapper = await renderShipment()
    await wrapper.get(`[data-testid="shipment-select-${PACKING_ITEM_1}"]`).setValue(true)
    await wrapper.get(`[data-testid="shipment-quantity-${PACKING_ITEM_1}"]`).setValue('4.000000')
    await wrapper.get(`[data-testid="shipment-select-${PACKING_ITEM_2}"]`).setValue(true)
    await wrapper.get(`[data-testid="shipment-quantity-${PACKING_ITEM_2}"]`).setValue('2.000000')
    await wrapper.get('[data-testid="create-shipment-form"]').trigger('submit')
    expect(shipmentApi.createShipment).toHaveBeenCalledWith(
      {
        salesOrderId: ORDER,
        lines: [
          { packingOrderId: BOX_1, packingItemId: PACKING_ITEM_1, quantity: '4.000000' },
          { packingOrderId: BOX_2, packingItemId: PACKING_ITEM_2, quantity: '2.000000' },
        ],
      },
      expect.any(String),
    )
  })

  it('申请人与当前审批人相同时隐藏审批动作并解释职责分离', async () => {
    permissions(['SHIPMENT_VIEW', 'SHIPMENT_APPROVE'])
    vi.mocked(shipmentApi.orderWorkspace).mockResolvedValue({
      ...structuredClone(workspace),
      shipments: [
        {
          ...structuredClone(workspace.shipments[0]!),
          requesterId: USER,
          status: 'PENDING_APPROVAL',
        },
      ],
    })
    const wrapper = await renderShipment()
    expect(wrapper.find(`[data-testid="approve-${SHIPMENT}"]`).exists()).toBe(false)
    expect(wrapper.get(`[data-testid="self-approval-blocked-${SHIPMENT}"]`).text()).toContain(
      '申请人与审批人必须分离',
    )
  })

  it('提供从原发运明细登记客户反馈与退货的入口并显示待处理售后', async () => {
    permissions(['SHIPMENT_VIEW', 'AFTER_SALES_MANAGE'])
    const wrapper = await renderShipment()
    expect(wrapper.get('[data-testid="after-sales-create-form"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('待处理售后')
    expect(wrapper.text()).toContain('客户反馈')
  })

  it('从已签收原发运明细提交客户反馈和退货数量并刷新权威列表', async () => {
    permissions(['SHIPMENT_VIEW', 'AFTER_SALES_MANAGE'])
    vi.mocked(shipmentApi.orderWorkspace).mockResolvedValue({
      ...structuredClone(workspace),
      shipments: [{ ...structuredClone(workspace.shipments[0]!), status: 'SIGNED' }],
    })
    const wrapper = await renderShipment()
    await wrapper.get('[data-testid="after-sales-source"]').setValue(SHIPMENT_LINE)
    await wrapper.get('[data-testid="after-sales-quantity"]').setValue('1.000000')
    await wrapper.get('[data-testid="after-sales-reason"]').setValue('seam_open')
    await wrapper.get('[data-testid="after-sales-feedback"]').setValue('客户反馈开线')
    await wrapper.get('[data-testid="after-sales-create-form"]').trigger('submit')
    expect(shipmentApi.receiveAfterSales).toHaveBeenCalledWith(
      {
        originalShipmentId: SHIPMENT,
        originalPackingOrderId: BOX_1,
        originalPackingItemId: PACKING_ITEM_1,
        quantity: '1.000000',
        reasonCode: 'SEAM_OPEN',
        customerFeedback: '客户反馈开线',
      },
      expect.any(String),
    )
    await flushPromises()
    expect(shipmentApi.orderWorkspace).toHaveBeenCalledTimes(2)
  })

  it('售后视图把原始血缘只读展示并呈现完整状态轨道', async () => {
    permissions(['SHIPMENT_VIEW'])
    const wrapper = await renderAfterSales()
    for (const fact of [ORDER, 'sku-1', 'batch-1', 'work-order-1', BOX_1, SHIPMENT]) {
      expect(wrapper.text()).toContain(fact)
    }
    expect(wrapper.findAll('[data-testid="immutable-lineage"] input')).toHaveLength(0)
    for (const label of [
      '创建',
      '退货在途',
      '收货并隔离',
      '返工中',
      '质量复检',
      '重新装箱',
      '重新发运',
      '签收',
      '完成',
    ]) {
      expect(wrapper.text()).toContain(label)
    }
    expect(wrapper.find('[data-testid="after-sales-next-action"]').exists()).toBe(false)
  })

  it('售后下一动作复用原expectedVersion和幂等key且刷新失败前保持单飞', async () => {
    permissions(['SHIPMENT_VIEW', 'AFTER_SALES_MANAGE'])
    vi.mocked(shipmentApi.getAfterSales).mockResolvedValue({
      ...structuredClone(afterSales),
      status: 'RETURN_IN_TRANSIT',
      returnCarrier: 'SF',
      returnTrackingNo: 'SF-1',
      returnInTransitAt: '2026-08-25T04:00:00Z',
      effectiveNextAction: 'RECEIVE_QUARANTINE',
      effectiveNextPermission: 'AFTER_SALES_MANAGE',
    })
    let resolve!: () => void
    vi.mocked(shipmentApi.transitionAfterSales).mockReturnValueOnce(
      new Promise(
        (done) =>
          (resolve = () => done({ ...afterSales, status: 'RECEIVED_AND_QUARANTINED', version: 1 })),
      ),
    )
    const wrapper = await renderAfterSales()
    const button = wrapper.get('[data-testid="after-sales-next-action"]')
    await button.trigger('click')
    await button.trigger('click')
    expect(shipmentApi.transitionAfterSales).toHaveBeenCalledTimes(1)
    expect(shipmentApi.transitionAfterSales).toHaveBeenCalledWith(
      AFTER_SALES,
      'receive-quarantine',
      { expectedVersion: 0 },
      expect.any(String),
    )
    resolve()
    await flushPromises()
    expect(shipmentApi.getAfterSales).toHaveBeenCalledTimes(2)
  })

  it('返工、复检、重装分别按生产、质量、发运权限开放动作', async () => {
    const cases = [
      ['RECEIVED_AND_QUARANTINED', 'START_REWORK', 'PRODUCTION_MANAGE', '开始下一轮返工'],
      ['QUALITY_INSPECTION', 'INSPECT', 'QUALITY_INSPECT', '提交独立复检'],
      ['REPACKING', 'PACK', 'SHIPMENT_MANAGE', '创建重新装箱'],
    ] as const
    for (const [status, effectiveNextAction, permission, label] of cases) {
      permissions(['SHIPMENT_VIEW', permission])
      vi.mocked(shipmentApi.getAfterSales).mockResolvedValue({
        ...structuredClone(afterSales),
        status,
        effectiveNextAction,
        effectiveNextPermission: permission,
      })
      const wrapper = await renderAfterSales()
      expect(wrapper.get('[data-testid="after-sales-next-action"]').text()).toContain(label)
      wrapper.unmount()
    }

    permissions(['SHIPMENT_VIEW', 'AFTER_SALES_MANAGE'])
    vi.mocked(shipmentApi.getAfterSales).mockResolvedValue({
      ...structuredClone(afterSales),
      status: 'QUALITY_INSPECTION',
      effectiveNextAction: 'INSPECT',
      effectiveNextPermission: 'QUALITY_INSPECT',
    })
    const denied = await renderAfterSales()
    expect(denied.find('[data-testid="after-sales-next-action"]').exists()).toBe(false)
    expect(denied.text()).toContain('QUALITY_INSPECT')
  })

  it('完全依赖后端权威进度区分开始下一轮与完成当前轮', async () => {
    permissions(['SHIPMENT_VIEW', 'PRODUCTION_MANAGE'])
    vi.mocked(shipmentApi.getAfterSales).mockResolvedValue({
      ...structuredClone(afterSales),
      status: 'REWORKING',
      currentReworkStatus: 'COMPLETED',
      attemptCount: 1,
      cumulativePassed: '1.000000',
      releasedQuantity: '0.000000',
      disposedQuantity: '0.000000',
      remainingQuantity: '1.000000',
      currentDisposition: null,
      effectiveNextAction: 'START_REWORK',
      effectiveNextPermission: 'PRODUCTION_MANAGE',
    } as never)
    const betweenAttempts = await renderAfterSales()
    expect(betweenAttempts.text()).toContain('累计合格 1.000000')
    expect(betweenAttempts.text()).toContain('剩余待处理 1.000000')
    expect(betweenAttempts.get('[data-testid="after-sales-next-action"]').text()).toContain(
      '开始下一轮返工',
    )
    betweenAttempts.unmount()

    vi.mocked(shipmentApi.getAfterSales).mockResolvedValue({
      ...structuredClone(afterSales),
      status: 'REWORKING',
      currentReworkStatus: 'IN_PROGRESS',
      attemptCount: 1,
      cumulativePassed: '1.000000',
      releasedQuantity: '0.000000',
      disposedQuantity: '0.000000',
      remainingQuantity: '1.000000',
      currentDisposition: null,
      effectiveNextAction: 'COMPLETE_REWORK',
      effectiveNextPermission: 'PRODUCTION_MANAGE',
    } as never)
    const inProgress = await renderAfterSales()
    expect(inProgress.get('[data-testid="after-sales-next-action"]').text()).toContain(
      '完成当前轮返工',
    )
  })

  it('处置审批按独立权限显示且处置产生人不显示审批按钮', async () => {
    const pending = {
      ...structuredClone(afterSales),
      status: 'REWORKING' as const,
      currentReworkStatus: 'COMPLETED' as const,
      attemptCount: 1,
      cumulativePassed: '1.000000' as const,
      remainingQuantity: '1.000000' as const,
      currentDisposition: {
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        status: 'PENDING' as const,
        type: null,
        outcome: null,
        quantity: '1.000000' as const,
      },
      effectiveNextAction: 'WAIT_DISPOSITION' as const,
      effectiveNextPermission: 'QUALITY_DISPOSITION_APPROVE',
    }
    permissions(['SHIPMENT_VIEW', 'QUALITY_DISPOSITION_APPROVE'])
    vi.mocked(shipmentApi.getAfterSales).mockResolvedValue({
      ...pending,
      dispositionApprovalAllowed: false,
    })
    const self = await renderAfterSales()
    expect(self.find('[data-testid="after-sales-next-action"]').exists()).toBe(false)
    expect(self.text()).toContain('不得审批自己的处置')
    self.unmount()

    vi.mocked(shipmentApi.getAfterSales).mockResolvedValue({
      ...pending,
      dispositionApprovalAllowed: true,
    })
    const independent = await renderAfterSales()
    expect(independent.get('[data-testid="after-sales-next-action"]').text()).toContain(
      '审批不合格处置',
    )
  })
})
