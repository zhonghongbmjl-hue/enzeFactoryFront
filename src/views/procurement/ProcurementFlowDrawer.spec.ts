import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { procurementApi } from '@/api/procurement'
import { masterDataApi } from '@/api/masterdata'
import type {
  GoodsReceipt,
  IncomingInspection,
  PurchaseOrder,
  PurchasePlan,
  PutAwayOrder,
} from '@/types/procurement'
import ProcurementFlowDrawer from './ProcurementFlowDrawer.vue'

vi.mock('@/api/procurement', () => ({
  procurementApi: {
    createPurchaseOrder: vi.fn(),
    getPurchaseOrder: vi.fn(),
    purchaseOrderAction: vi.fn(),
    receive: vi.fn(),
    inspect: vi.fn(),
    getInspection: vi.fn(),
    inspectionAction: vi.fn(),
    createPutAway: vi.fn(),
    completePutAway: vi.fn(),
  },
}))

vi.mock('@/api/masterdata', () => ({
  masterDataApi: { select: vi.fn() },
}))

const SelectFieldStub = {
  name: 'SelectField',
  props: ['modelValue', 'options'],
  emits: ['update:modelValue'],
  template: `<select :value="modelValue" @change="$emit('update:modelValue', $event.target.value)">
    <option value=""></option>
    <option v-for="item in options" :key="String(item.value)" :value="item.value">{{ item.label }}</option>
  </select>`,
}

const plan: PurchasePlan = {
  id: 'plan-id',
  salesOrderId: 'order-id',
  orderNo: 'PO-001',
  materialType: 'FABRIC',
  status: 'APPROVED',
  version: 2,
  items: [
    {
      id: 'plan-item-id',
      requirementId: 'requirement-id',
      orderItemId: 'order-item-id',
      bomSnapshotId: 'bom-id',
      materialId: 'material-id',
      materialType: 'FABRIC',
      materialCode: 'FAB-001',
      materialName: '精纺羊毛',
      uom: 'm',
      plannedQuantity: 10,
      orderedQuantity: 0,
      receivedQuantity: 0,
      inspectedQuantity: 0,
      passedQuantity: 0,
      rejectedQuantity: 0,
      putAwayQuantity: 0,
    },
  ],
}

const purchaseBase: PurchaseOrder = {
  id: 'purchase-id',
  orderNo: 'PO-001-FAB',
  supplierId: 'supplier-id',
  purchasePlanId: 'plan-id',
  status: 'DRAFT',
  version: 0,
  remainingQuantity: 10,
  items: [
    {
      id: 'purchase-item-id',
      purchasePlanItemId: 'plan-item-id',
      requirementId: 'requirement-id',
      orderItemId: 'order-item-id',
      bomSnapshotId: 'bom-id',
      materialId: 'material-id',
      materialType: 'FABRIC',
      orderedQuantity: 10,
      overReceiptLimit: 0,
      receivedQuantity: 0,
      remainingQuantity: 10,
    },
  ],
}

const receipt: GoodsReceipt = {
  id: 'receipt-id',
  receiptNo: 'REC-001',
  purchaseOrderId: 'purchase-id',
  status: 'PENDING_INSPECTION',
  version: 0,
  items: [
    {
      id: 'receipt-item-id',
      purchaseOrderItemId: 'purchase-item-id',
      requirementId: 'requirement-id',
      orderItemId: 'order-item-id',
      bomSnapshotId: 'bom-id',
      materialId: 'material-id',
      materialType: 'FABRIC',
      supplierBatch: 'LOT-001',
      receivedQuantity: 10,
    },
  ],
}

const inspectionBase: IncomingInspection = {
  id: 'inspection-id',
  inspectionNo: 'IQC-001',
  receiptId: 'receipt-id',
  status: 'INSPECTING',
  version: 0,
  putAwayRemainingQuantity: 0,
  resolutionRemainingQuantity: 0,
  allowedActions: ['FINISH'],
  items: [
    {
      id: 'inspection-item-id',
      receiptItemId: 'receipt-item-id',
      requirementId: 'requirement-id',
      orderItemId: 'order-item-id',
      bomSnapshotId: 'bom-id',
      materialId: 'material-id',
      materialType: 'FABRIC',
      supplierBatch: 'LOT-001',
      inspectedQuantity: 10,
      passedQuantity: 10,
      rejectedQuantity: 0,
      defectNote: '',
    },
  ],
}

const putAwayBase: PutAwayOrder = {
  id: 'put-away-id',
  putAwayNo: 'PA-001',
  warehouseId: 'warehouse-id',
  status: 'DRAFT',
  version: 0,
  items: [
    {
      id: 'put-away-item-id',
      inspectionItemId: 'inspection-item-id',
      requirementId: 'requirement-id',
      orderItemId: 'order-item-id',
      bomSnapshotId: 'bom-id',
      materialId: 'material-id',
      materialType: 'FABRIC',
      supplierBatch: 'LOT-001',
      quantity: 10,
    },
  ],
}

function action(wrapper: VueWrapper, label: string) {
  const match = wrapper.findAll('button').find((item) => item.text().includes(label))
  if (!match) throw new Error(`找不到操作按钮：${label}`)
  return match
}

describe('采购与来料办理抽屉', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    vi.mocked(masterDataApi.select).mockImplementation(async (type) =>
      type === 'suppliers'
        ? [{ id: 'supplier-id', code: 'SUP-01', name: '面料供应商' }]
        : [{ id: 'warehouse-id', code: 'WH-01', name: '原料仓' }],
    )
    vi.mocked(procurementApi.createPurchaseOrder).mockResolvedValue({ ...purchaseBase })
    vi.mocked(procurementApi.getPurchaseOrder).mockResolvedValue({
      ...purchaseBase,
      status: 'RECEIVED',
      version: 4,
      remainingQuantity: 0,
      items: [{ ...purchaseBase.items[0]!, receivedQuantity: 10, remainingQuantity: 0 }],
    })
    vi.mocked(procurementApi.purchaseOrderAction).mockImplementation(async (_id, name) => ({
      ...purchaseBase,
      status: {
        submit: 'PENDING_APPROVAL',
        approve: 'APPROVED',
        place: 'ORDERED',
        complete: 'COMPLETED',
      }[name],
      version: { submit: 1, approve: 2, place: 3, complete: 4 }[name],
    }))
    vi.mocked(procurementApi.receive).mockResolvedValue(receipt)
    vi.mocked(procurementApi.inspect).mockResolvedValue({ ...inspectionBase })
    vi.mocked(procurementApi.getInspection).mockResolvedValue({
      ...inspectionBase,
      status: 'PUT_AWAY',
      version: 2,
      allowedActions: ['COMPLETE'],
    })
    vi.mocked(procurementApi.inspectionAction).mockImplementation(async (_id, name) => ({
      ...inspectionBase,
      status: name === 'finish' ? 'PASSED' : 'COMPLETED',
      version: name === 'finish' ? 1 : 2,
      putAwayRemainingQuantity: name === 'finish' ? 10 : 0,
      allowedActions: name === 'finish' ? ['CREATE_PUT_AWAY'] : [],
    }))
    vi.mocked(procurementApi.createPutAway).mockResolvedValue({ ...putAwayBase })
    vi.mocked(procurementApi.completePutAway).mockResolvedValue({
      ...putAwayBase,
      status: 'COMPLETED',
      version: 1,
    })
  })

  it('仅在采购计划已审核且有待采购量时显示办理入口', () => {
    const wrapper = mount(ProcurementFlowDrawer, {
      props: { plan, tenantId: 'tenant-id', canManage: false, canApprove: false },
    })
    expect(wrapper.find('[data-testid="open-fabric-procurement-flow"]').exists()).toBe(false)
  })

  it('贯通采购单、到货、检验、上架和完成入库接口', async () => {
    const wrapper = mount(ProcurementFlowDrawer, {
      props: { plan, tenantId: 'tenant-id', canManage: true, canApprove: true },
      global: {
        stubs: {
          teleport: true,
          SelectField: SelectFieldStub,
          ElDrawer: {
            name: 'ElDrawer',
            props: ['modelValue', 'title'],
            emits: ['update:modelValue'],
            template:
              '<div v-if="modelValue" class="drawer-stub"><button data-testid="close-flow" @click="$emit(\'update:modelValue\', false)">关闭</button><slot /></div>',
          },
        },
      },
    })

    await wrapper.get('[data-testid="open-fabric-procurement-flow"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="purchase-fabric-supplier"]').setValue('supplier-id')
    await wrapper.get('[data-testid="create-fabric-purchase-form"]').trigger('submit')
    await flushPromises()
    expect(procurementApi.createPurchaseOrder).toHaveBeenCalledWith({
      orderNo: 'PO-001-FAB',
      supplierId: 'supplier-id',
      purchasePlanId: 'plan-id',
      items: [{ purchasePlanItemId: 'plan-item-id', orderedQuantity: 10, overReceiptLimit: 0 }],
    })

    await action(wrapper, '提交审核').trigger('click')
    await flushPromises()
    await action(wrapper, '审核采购单').trigger('click')
    await flushPromises()
    await action(wrapper, '确认下单').trigger('click')
    await flushPromises()

    await wrapper.setProps({
      plan: {
        ...plan,
        status: 'ORDERED',
        items: [{ ...plan.items[0]!, orderedQuantity: 10 }],
      },
    })
    await wrapper.get('[data-testid="close-flow"]').trigger('click')
    expect(wrapper.get('[data-testid="open-fabric-procurement-flow"]').text()).toContain(
      '继续办理采购与来料',
    )
    await wrapper.get('[data-testid="open-fabric-procurement-flow"]').trigger('click')
    expect(masterDataApi.select).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-testid="create-fabric-receipt-form"]').exists()).toBe(true)

    await wrapper.get('[data-testid="receipt-fabric-no"]').setValue('rec-001')
    await wrapper.get('[data-testid="receipt-fabric-batch"]').setValue('lot-001')
    await wrapper.get('[data-testid="create-fabric-receipt-form"]').trigger('submit')
    await flushPromises()
    expect(procurementApi.receive).toHaveBeenCalledWith({
      receiptNo: 'REC-001',
      purchaseOrderId: 'purchase-id',
      items: [{ purchaseOrderItemId: 'purchase-item-id', supplierBatch: 'LOT-001', quantity: 10 }],
    })

    await wrapper.get('[data-testid="inspection-fabric-no"]').setValue('iqc-001')
    await wrapper.get('[data-testid="create-fabric-inspection-form"]').trigger('submit')
    await flushPromises()
    expect(procurementApi.inspect).toHaveBeenCalledWith(
      expect.objectContaining({ inspectionNo: 'IQC-001', receiptId: 'receipt-id' }),
    )

    await action(wrapper, '完成检验判定').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="put-away-fabric-no"]').setValue('pa-001')
    await wrapper.get('[data-testid="put-away-fabric-warehouse"]').setValue('warehouse-id')
    await wrapper.get('[data-testid="create-fabric-put-away-form"]').trigger('submit')
    await flushPromises()
    expect(procurementApi.createPutAway).toHaveBeenCalledWith({
      putAwayNo: 'PA-001',
      inspectionId: 'inspection-id',
      warehouseId: 'warehouse-id',
      items: [{ inspectionItemId: 'inspection-item-id', quantity: 10 }],
    })

    await action(wrapper, '确认完成入库').trigger('click')
    await flushPromises()
    expect(procurementApi.completePutAway).toHaveBeenCalledWith('put-away-id', 0)

    await action(wrapper, '完成来料检验').trigger('click')
    await flushPromises()
    expect(procurementApi.inspectionAction).toHaveBeenLastCalledWith('inspection-id', 'complete', 2)
    await action(wrapper, '完成采购单').trigger('click')
    await flushPromises()
    expect(procurementApi.purchaseOrderAction).toHaveBeenLastCalledWith(
      'purchase-id',
      'complete',
      4,
    )
  })

  it('重新进入工作台后从当前登录会话恢复已下单流程', async () => {
    sessionStorage.setItem(
      'garment.tenant.procurement-flow.tenant-id.plan-id',
      JSON.stringify({
        schemaVersion: 1,
        tenantId: 'tenant-id',
        salesOrderId: 'order-id',
        planId: 'plan-id',
        purchaseOrder: { ...purchaseBase, status: 'ORDERED', version: 3 },
      }),
    )
    const orderedPlan: PurchasePlan = {
      ...plan,
      status: 'ORDERED',
      items: [{ ...plan.items[0]!, orderedQuantity: 10 }],
    }
    const wrapper = mount(ProcurementFlowDrawer, {
      props: { plan: orderedPlan, tenantId: 'tenant-id', canManage: true, canApprove: true },
      global: {
        stubs: {
          SelectField: SelectFieldStub,
          ElDrawer: {
            name: 'ElDrawer',
            props: ['modelValue', 'title'],
            emits: ['update:modelValue'],
            template: '<div v-if="modelValue" class="drawer-stub"><slot /></div>',
          },
        },
      },
    })

    expect(wrapper.get('[data-testid="open-fabric-procurement-flow"]').text()).toContain(
      '继续办理采购与来料',
    )
    await wrapper.get('[data-testid="open-fabric-procurement-flow"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="create-fabric-receipt-form"]').exists()).toBe(true)
  })

  it('历史已下单计划显示继续办理入口并可关联采购单', async () => {
    const orderedPurchase: PurchaseOrder = {
      ...purchaseBase,
      status: 'ORDERED',
      version: 3,
    }
    vi.mocked(procurementApi.getPurchaseOrder).mockResolvedValue(orderedPurchase)
    const orderedPlan: PurchasePlan = {
      ...plan,
      status: 'ORDERED',
      items: [{ ...plan.items[0]!, orderedQuantity: 10 }],
    }
    const wrapper = mount(ProcurementFlowDrawer, {
      props: { plan: orderedPlan, tenantId: 'tenant-id', canManage: true, canApprove: true },
      global: {
        stubs: {
          SelectField: SelectFieldStub,
          ElDrawer: {
            name: 'ElDrawer',
            props: ['modelValue', 'title'],
            emits: ['update:modelValue'],
            template: '<div v-if="modelValue" class="drawer-stub"><slot /></div>',
          },
        },
      },
    })

    expect(wrapper.get('[data-testid="open-fabric-procurement-flow"]').text()).toContain(
      '继续办理采购与来料',
    )
    await wrapper.get('[data-testid="open-fabric-procurement-flow"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="recover-fabric-purchase-form"]').exists()).toBe(true)

    await wrapper.get('[data-testid="recover-fabric-purchase-id"]').setValue('purchase-id')
    await wrapper.get('[data-testid="recover-fabric-purchase-form"]').trigger('submit')
    await flushPromises()

    expect(procurementApi.getPurchaseOrder).toHaveBeenCalledWith('purchase-id')
    expect(wrapper.find('[data-testid="create-fabric-receipt-form"]').exists()).toBe(true)
    expect(sessionStorage.getItem('garment.tenant.procurement-flow.tenant-id.plan-id')).toContain(
      'purchase-id',
    )
  })
})
