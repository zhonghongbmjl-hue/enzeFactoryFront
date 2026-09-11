<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { procurementApi } from '@/api/procurement'
import { masterDataApi } from '@/api/masterdata'
import SelectField from '@/components/form/SelectField.vue'
import type { MasterDataOption } from '@/types/masterdata'
import type {
  GoodsReceipt,
  IncomingInspection,
  PurchaseOrder,
  PurchasePlan,
  PutAwayOrder,
} from '@/types/procurement'

const props = defineProps<{
  plan: PurchasePlan
  tenantId: string
  canManage: boolean
  canApprove: boolean
}>()

const emit = defineEmits<{ changed: [] }>()

interface QuantityLine {
  id: string
  code: string
  name: string
  uom: string
  quantity: number
  limit: number
}

interface InspectionLine extends QuantityLine {
  passedQuantity: number
  rejectedQuantity: number
  defectNote: string
}

interface ReceiptLine extends QuantityLine {
  supplierBatch: string
}

const drawer = ref(false)
const pending = ref('')
const formError = ref('')
const suppliers = ref<MasterDataOption[]>([])
const warehouses = ref<MasterDataOption[]>([])
const purchaseOrder = ref<PurchaseOrder>()
const receipt = ref<GoodsReceipt>()
const inspection = ref<IncomingInspection>()
const putAway = ref<PutAwayOrder>()

const purchaseForm = reactive({ orderNo: '', supplierId: '', lines: [] as QuantityLine[] })
const receiptForm = reactive({ receiptNo: '', lines: [] as ReceiptLine[] })
const inspectionForm = reactive({ inspectionNo: '', lines: [] as InspectionLine[] })
const putAwayForm = reactive({ putAwayNo: '', warehouseId: '', lines: [] as QuantityLine[] })
const recoveryForm = reactive({ purchaseOrderId: '' })

const branchKey = computed(() => props.plan.materialType.toLowerCase())
const branchLabel = computed(() => (props.plan.materialType === 'FABRIC' ? '布料' : '辅料'))
const supplierOptions = computed(() =>
  suppliers.value.map((item) => ({ label: `${item.code} · ${item.name}`, value: item.id })),
)
const warehouseOptions = computed(() =>
  warehouses.value.map((item) => ({ label: `${item.code} · ${item.name}`, value: item.id })),
)
const canStart = computed(
  () =>
    props.canManage &&
    ['APPROVED', 'PARTIALLY_ORDERED'].includes(props.plan.status) &&
    props.plan.items.some((item) => item.orderedQuantity < item.plannedQuantity),
)
const needsRecovery = computed(
  () =>
    !purchaseOrder.value && props.canManage && ['ORDERED', 'COMPLETED'].includes(props.plan.status),
)
const canOpen = computed(
  () => canStart.value || needsRecovery.value || Boolean(purchaseOrder.value),
)
const openLabel = computed(() => {
  if (props.plan.status === 'COMPLETED') return '查看采购与来料'
  if (!purchaseOrder.value) {
    return needsRecovery.value ? '继续办理采购与来料' : '办理采购与来料'
  }
  return purchaseOrder.value.status === 'COMPLETED' ? '查看采购与来料' : '继续办理采购与来料'
})

interface StoredFlow {
  schemaVersion: 1
  tenantId: string
  salesOrderId: string
  planId: string
  purchaseOrder: PurchaseOrder
  receipt?: GoodsReceipt
  inspection?: IncomingInspection
  putAway?: PutAwayOrder
}

function storageKey(): string {
  return `garment.tenant.procurement-flow.${props.tenantId}.${props.plan.id}`
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasEntityShape(value: unknown): boolean {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    typeof value.status === 'string' &&
    typeof value.version === 'number' &&
    Array.isArray(value.items)
  )
}

function persistFlow(): void {
  if (!props.tenantId || !purchaseOrder.value) return
  const stored: StoredFlow = {
    schemaVersion: 1,
    tenantId: props.tenantId,
    salesOrderId: props.plan.salesOrderId,
    planId: props.plan.id,
    purchaseOrder: purchaseOrder.value,
    ...(receipt.value ? { receipt: receipt.value } : {}),
    ...(inspection.value ? { inspection: inspection.value } : {}),
    ...(putAway.value ? { putAway: putAway.value } : {}),
  }
  sessionStorage.setItem(storageKey(), JSON.stringify(stored))
}

function restoreFlow(): void {
  if (!props.tenantId) return
  try {
    const raw = sessionStorage.getItem(storageKey())
    if (!raw) return
    const stored = JSON.parse(raw) as unknown
    if (
      !isObject(stored) ||
      stored.schemaVersion !== 1 ||
      stored.tenantId !== props.tenantId ||
      stored.salesOrderId !== props.plan.salesOrderId ||
      stored.planId !== props.plan.id ||
      !hasEntityShape(stored.purchaseOrder) ||
      (stored.receipt !== undefined && !hasEntityShape(stored.receipt)) ||
      (stored.inspection !== undefined && !hasEntityShape(stored.inspection)) ||
      (stored.putAway !== undefined && !hasEntityShape(stored.putAway))
    ) {
      sessionStorage.removeItem(storageKey())
      return
    }
    const snapshot = stored as unknown as StoredFlow
    purchaseOrder.value = snapshot.purchaseOrder
    receipt.value = snapshot.receipt
    inspection.value = snapshot.inspection
    putAway.value = snapshot.putAway
    if (!receipt.value && ['ORDERED', 'PARTIALLY_RECEIVED'].includes(purchaseOrder.value.status)) {
      resetReceiptForm()
    } else if (receipt.value && !inspection.value) {
      resetInspectionForm()
    } else if (inspection.value && inspection.value.status !== 'INSPECTING' && !putAway.value) {
      resetPutAwayForm()
    }
  } catch {
    sessionStorage.removeItem(storageKey())
  }
}

function amount(value: number): number {
  return Math.max(0, value)
}

function report(error: unknown, fallback: string): void {
  const candidate = error as { message?: string; traceId?: string }
  formError.value = candidate.message || fallback
  if (candidate.traceId) formError.value += `（追踪号 ${candidate.traceId}）`
}

function purchaseStatusLabel(status: PurchaseOrder['status']): string {
  return {
    DRAFT: '草稿',
    PENDING_APPROVAL: '待审核',
    APPROVED: '已审核',
    ORDERED: '已下单',
    PARTIALLY_RECEIVED: '部分到货',
    RECEIVED: '已到货',
    COMPLETED: '已完成',
  }[status]
}

function inspectionStatusLabel(status: IncomingInspection['status']): string {
  return {
    INSPECTING: '检验中',
    PASSED: '全部合格',
    PARTIALLY_PASSED: '部分合格',
    REJECTED: '不合格',
    PUT_AWAY: '上架中',
    RETURN_PENDING: '退补处理中',
    COMPLETED: '已完成',
  }[status]
}

async function open(): Promise<void> {
  if (!canOpen.value || pending.value) return
  if (purchaseOrder.value) {
    drawer.value = true
    if (!suppliers.value.length || !warehouses.value.length) {
      try {
        const [supplierRows, warehouseRows] = await Promise.all([
          masterDataApi.select('suppliers', '', 50),
          masterDataApi.select('warehouses', '', 50),
        ])
        suppliers.value = supplierRows
        warehouses.value = warehouseRows
      } catch (error) {
        report(error, '办理记录已恢复，但供应商或仓库选项加载失败')
      }
    }
    return
  }
  if (needsRecovery.value) {
    pending.value = 'options'
    formError.value = ''
    try {
      const [supplierRows, warehouseRows] = await Promise.all([
        masterDataApi.select('suppliers', '', 50),
        masterDataApi.select('warehouses', '', 50),
      ])
      suppliers.value = supplierRows
      warehouses.value = warehouseRows
      drawer.value = true
    } catch (error) {
      report(error, '采购流程恢复页面打开失败，请检查基础资料')
    } finally {
      pending.value = ''
    }
    return
  }
  pending.value = 'options'
  formError.value = ''
  purchaseOrder.value = undefined
  receipt.value = undefined
  inspection.value = undefined
  putAway.value = undefined
  purchaseForm.orderNo = `${props.plan.orderNo}-${props.plan.materialType === 'FABRIC' ? 'FAB' : 'ACC'}`
  purchaseForm.supplierId = ''
  purchaseForm.lines = props.plan.items
    .filter((item) => item.orderedQuantity < item.plannedQuantity)
    .map((item) => ({
      id: item.id,
      code: item.materialCode,
      name: item.materialName,
      uom: item.uom,
      quantity: amount(item.plannedQuantity - item.orderedQuantity),
      limit: amount(item.plannedQuantity - item.orderedQuantity),
    }))
  try {
    const [supplierRows, warehouseRows] = await Promise.all([
      masterDataApi.select('suppliers', '', 50),
      masterDataApi.select('warehouses', '', 50),
    ])
    suppliers.value = supplierRows
    warehouses.value = warehouseRows
    drawer.value = true
  } catch (error) {
    report(error, '供应商或仓库选项加载失败，请先检查基础资料')
  } finally {
    pending.value = ''
  }
}

async function recoverPurchase(): Promise<void> {
  const purchaseOrderId = recoveryForm.purchaseOrderId.trim()
  formError.value = ''
  if (!purchaseOrderId) {
    formError.value = '请填写采购单 ID。'
    return
  }
  pending.value = 'recover-purchase'
  try {
    const recovered = await procurementApi.getPurchaseOrder(purchaseOrderId)
    if (recovered.purchasePlanId !== props.plan.id) {
      formError.value = '该采购单不属于当前采购计划，请核对后重试。'
      return
    }
    purchaseOrder.value = recovered
    receipt.value = undefined
    inspection.value = undefined
    putAway.value = undefined
    if (['ORDERED', 'PARTIALLY_RECEIVED'].includes(recovered.status)) resetReceiptForm()
    persistFlow()
    ElMessage.success('采购流程已恢复，可继续办理')
  } catch (error) {
    report(error, '采购单加载失败，请检查采购单 ID')
  } finally {
    pending.value = ''
  }
}

function validLines(lines: QuantityLine[]): boolean {
  return lines.some((line) => Number(line.quantity) > 0)
}

async function createPurchase(): Promise<void> {
  formError.value = ''
  if (!purchaseForm.orderNo.trim() || !purchaseForm.supplierId) {
    formError.value = '请填写采购单号并选择供应商。'
    return
  }
  if (
    purchaseForm.lines.some(
      (line) =>
        !Number.isFinite(Number(line.quantity)) ||
        Number(line.quantity) < 0 ||
        Number(line.quantity) > line.limit,
    ) ||
    !validLines(purchaseForm.lines)
  ) {
    formError.value = '采购数量须大于 0，且不能超过各物料的待采购数量。'
    return
  }
  pending.value = 'create-purchase'
  try {
    purchaseOrder.value = await procurementApi.createPurchaseOrder({
      orderNo: purchaseForm.orderNo.trim().toUpperCase(),
      supplierId: purchaseForm.supplierId,
      purchasePlanId: props.plan.id,
      items: purchaseForm.lines
        .filter((line) => Number(line.quantity) > 0)
        .map((line) => ({
          purchasePlanItemId: line.id,
          orderedQuantity: Number(line.quantity),
          overReceiptLimit: 0,
        })),
    })
    persistFlow()
    ElMessage.success('采购单已创建')
    emit('changed')
  } catch (error) {
    report(error, '采购单创建失败，请检查单号、供应商和数量')
  } finally {
    pending.value = ''
  }
}

async function purchaseAction(action: 'submit' | 'approve' | 'place' | 'complete'): Promise<void> {
  if (!purchaseOrder.value || pending.value) return
  pending.value = `purchase-${action}`
  formError.value = ''
  try {
    purchaseOrder.value = await procurementApi.purchaseOrderAction(
      purchaseOrder.value.id,
      action,
      purchaseOrder.value.version,
    )
    const message = {
      submit: '采购单已提交审核',
      approve: '采购单已审核',
      place: '采购单已正式下单',
      complete: '采购单已完成',
    }[action]
    ElMessage.success(message)
    if (action === 'place') resetReceiptForm()
    persistFlow()
    emit('changed')
  } catch (error) {
    report(error, '采购单状态更新失败，请刷新后重试')
  } finally {
    pending.value = ''
  }
}

function resetReceiptForm(): void {
  const order = purchaseOrder.value
  if (!order) return
  receiptForm.receiptNo = ''
  receiptForm.lines = order.items
    .filter((item) => item.remainingQuantity > 0)
    .map((item) => {
      const source = props.plan.items.find((line) => line.id === item.purchasePlanItemId)
      return {
        id: item.id,
        code: source?.materialCode ?? item.materialId.slice(0, 8),
        name: source?.materialName ?? '采购物料',
        uom: source?.uom ?? '',
        quantity: amount(item.remainingQuantity),
        limit: amount(item.remainingQuantity + item.overReceiptLimit),
        supplierBatch: '',
      }
    })
}

async function createReceipt(): Promise<void> {
  const order = purchaseOrder.value
  formError.value = ''
  if (!order || !receiptForm.receiptNo.trim()) {
    formError.value = '请填写到货单号。'
    return
  }
  if (
    receiptForm.lines.some(
      (line) =>
        !line.supplierBatch.trim() ||
        !Number.isFinite(Number(line.quantity)) ||
        Number(line.quantity) < 0 ||
        Number(line.quantity) > line.limit,
    ) ||
    !validLines(receiptForm.lines)
  ) {
    formError.value = '请填写供应商批次；到货数量须大于 0 且不能超过可收货数量。'
    return
  }
  pending.value = 'receipt'
  try {
    receipt.value = await procurementApi.receive({
      receiptNo: receiptForm.receiptNo.trim().toUpperCase(),
      purchaseOrderId: order.id,
      items: receiptForm.lines
        .filter((line) => Number(line.quantity) > 0)
        .map((line) => ({
          purchaseOrderItemId: line.id,
          supplierBatch: line.supplierBatch.trim().toUpperCase(),
          quantity: Number(line.quantity),
        })),
    })
    resetInspectionForm()
    ElMessage.success('到货已登记，待来料检验')
    try {
      purchaseOrder.value = await procurementApi.getPurchaseOrder(order.id)
    } catch (refreshError) {
      report(refreshError, '到货已登记，但采购单最新状态加载失败')
    }
    persistFlow()
    emit('changed')
  } catch (error) {
    report(error, '到货登记失败，请检查批次和数量')
  } finally {
    pending.value = ''
  }
}

function resetInspectionForm(): void {
  if (!receipt.value) return
  inspectionForm.inspectionNo = ''
  inspectionForm.lines = receipt.value.items.map((item) => {
    const source = props.plan.items.find((line) => line.materialId === item.materialId)
    return {
      id: item.id,
      code: source?.materialCode ?? item.materialId.slice(0, 8),
      name: source?.materialName ?? '到货物料',
      uom: source?.uom ?? '',
      quantity: item.receivedQuantity,
      limit: item.receivedQuantity,
      passedQuantity: item.receivedQuantity,
      rejectedQuantity: 0,
      defectNote: '',
    }
  })
}

async function createInspection(): Promise<void> {
  const currentReceipt = receipt.value
  formError.value = ''
  if (!currentReceipt || !inspectionForm.inspectionNo.trim()) {
    formError.value = '请填写检验单号。'
    return
  }
  const invalid = inspectionForm.lines.some((line) => {
    const inspected = Number(line.quantity)
    const passed = Number(line.passedQuantity)
    const rejected = Number(line.rejectedQuantity)
    return (
      inspected <= 0 ||
      inspected > line.limit ||
      passed < 0 ||
      rejected < 0 ||
      amount(passed + rejected) !== amount(inspected) ||
      (rejected > 0 && !line.defectNote.trim())
    )
  })
  if (invalid) {
    formError.value =
      '检验数量须在到货范围内，合格与不合格数量之和须等于检验数量；有不合格品时请填写说明。'
    return
  }
  pending.value = 'inspection'
  try {
    inspection.value = await procurementApi.inspect({
      inspectionNo: inspectionForm.inspectionNo.trim().toUpperCase(),
      receiptId: currentReceipt.id,
      items: inspectionForm.lines.map((line) => ({
        receiptItemId: line.id,
        inspectedQuantity: Number(line.quantity),
        passedQuantity: Number(line.passedQuantity),
        rejectedQuantity: Number(line.rejectedQuantity),
        defectNote: line.defectNote.trim(),
      })),
    })
    persistFlow()
    ElMessage.success('来料检验单已创建')
    emit('changed')
  } catch (error) {
    report(error, '来料检验登记失败，请检查数量守恒')
  } finally {
    pending.value = ''
  }
}

async function inspectionAction(action: 'finish' | 'complete'): Promise<void> {
  if (!inspection.value || pending.value) return
  pending.value = `inspection-${action}`
  formError.value = ''
  try {
    inspection.value = await procurementApi.inspectionAction(
      inspection.value.id,
      action,
      inspection.value.version,
    )
    ElMessage.success(action === 'finish' ? '来料检验已判定' : '来料检验已完成')
    if (action === 'finish') resetPutAwayForm()
    if (action === 'complete' && purchaseOrder.value) {
      try {
        purchaseOrder.value = await procurementApi.getPurchaseOrder(purchaseOrder.value.id)
      } catch (refreshError) {
        report(refreshError, '检验已完成，但采购单最新状态加载失败')
      }
    }
    persistFlow()
    emit('changed')
  } catch (error) {
    report(error, '来料检验状态更新失败，请刷新后重试')
  } finally {
    pending.value = ''
  }
}

function resetPutAwayForm(): void {
  if (!inspection.value) return
  putAwayForm.putAwayNo = ''
  putAwayForm.warehouseId = ''
  putAwayForm.lines = inspection.value.items
    .filter((item) => item.passedQuantity > 0)
    .map((item) => {
      const source = props.plan.items.find((line) => line.materialId === item.materialId)
      return {
        id: item.id,
        code: source?.materialCode ?? item.materialId.slice(0, 8),
        name: source?.materialName ?? '合格物料',
        uom: source?.uom ?? '',
        quantity: item.passedQuantity,
        limit: item.passedQuantity,
      }
    })
}

async function createPutAway(): Promise<void> {
  const currentInspection = inspection.value
  formError.value = ''
  if (!currentInspection || !putAwayForm.putAwayNo.trim() || !putAwayForm.warehouseId) {
    formError.value = '请填写上架单号并选择入库仓库。'
    return
  }
  if (
    putAwayForm.lines.some(
      (line) =>
        !Number.isFinite(Number(line.quantity)) ||
        Number(line.quantity) < 0 ||
        Number(line.quantity) > line.limit,
    ) ||
    !validLines(putAwayForm.lines)
  ) {
    formError.value = '上架数量须大于 0，且不能超过本次检验合格数量。'
    return
  }
  pending.value = 'put-away'
  try {
    putAway.value = await procurementApi.createPutAway({
      putAwayNo: putAwayForm.putAwayNo.trim().toUpperCase(),
      inspectionId: currentInspection.id,
      warehouseId: putAwayForm.warehouseId,
      items: putAwayForm.lines
        .filter((line) => Number(line.quantity) > 0)
        .map((line) => ({ inspectionItemId: line.id, quantity: Number(line.quantity) })),
    })
    persistFlow()
    ElMessage.success('上架单已创建')
  } catch (error) {
    report(error, '上架单创建失败，请检查仓库和数量')
  } finally {
    pending.value = ''
  }
}

async function completePutAway(): Promise<void> {
  if (!putAway.value || pending.value) return
  pending.value = 'complete-put-away'
  formError.value = ''
  try {
    putAway.value = await procurementApi.completePutAway(putAway.value.id, putAway.value.version)
    ElMessage.success('合格物料已入库')
    if (inspection.value) {
      try {
        inspection.value = await procurementApi.getInspection(inspection.value.id)
      } catch (refreshError) {
        report(refreshError, '物料已入库，但检验单最新状态加载失败')
      }
    }
    persistFlow()
    emit('changed')
  } catch (error) {
    report(error, '入库失败，请刷新库存后重试')
  } finally {
    pending.value = ''
  }
}

restoreFlow()
</script>

<template>
  <el-button
    v-if="canOpen"
    :data-testid="`open-${branchKey}-procurement-flow`"
    type="primary"
    :loading="pending === 'options'"
    @click="open"
  >
    {{ openLabel }}
  </el-button>

  <el-drawer
    v-model="drawer"
    :title="`${branchLabel}采购与来料办理`"
    size="min(720px, 96vw)"
    destroy-on-close
  >
    <div class="procurement-flow" :aria-busy="!!pending">
      <el-steps
        :active="purchaseOrder ? (receipt ? (inspection ? (putAway ? 4 : 3) : 2) : 1) : 0"
        finish-status="success"
        align-center
      >
        <el-step title="采购单" />
        <el-step title="到货" />
        <el-step title="检验" />
        <el-step title="上架" />
      </el-steps>

      <el-alert
        v-if="formError"
        :title="formError"
        type="error"
        :closable="false"
        show-icon
        role="alert"
      />

      <section v-if="needsRecovery" class="flow-section recovery-section">
        <header>
          <b>恢复已有采购流程</b><small>此采购计划已下单，需要先关联对应采购单</small>
        </header>
        <el-alert
          title="这是升级前创建的历史单据。粘贴采购下单接口返回的采购单 ID，关联一次后即可继续到货、检验和上架。"
          type="info"
          :closable="false"
          show-icon
        />
        <el-form
          label-position="top"
          :data-testid="`recover-${branchKey}-purchase-form`"
          @submit.prevent="recoverPurchase"
        >
          <el-form-item label="采购单 ID" required>
            <el-input
              v-model="recoveryForm.purchaseOrderId"
              :data-testid="`recover-${branchKey}-purchase-id`"
              maxlength="64"
              placeholder="例如：xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              autocomplete="off"
            />
          </el-form-item>
          <el-button type="primary" native-type="submit" :loading="pending === 'recover-purchase'">
            关联并继续办理
          </el-button>
        </el-form>
      </section>

      <section v-else-if="!purchaseOrder" class="flow-section">
        <header><b>01 创建采购单</b><small>待采购物料已按剩余需求预填</small></header>
        <el-form
          label-position="top"
          :data-testid="`create-${branchKey}-purchase-form`"
          @submit.prevent="createPurchase"
        >
          <div class="flow-form-grid">
            <el-form-item label="采购单号" required>
              <el-input v-model="purchaseForm.orderNo" maxlength="64" autocomplete="off" />
            </el-form-item>
            <el-form-item label="供应商" required>
              <SelectField
                v-model="purchaseForm.supplierId"
                :data-testid="`purchase-${branchKey}-supplier`"
                placeholder="选择供应商"
                filterable
                :options="supplierOptions"
              />
            </el-form-item>
          </div>
          <div v-for="line in purchaseForm.lines" :key="line.id" class="flow-line">
            <span
              ><code>{{ line.code }}</code
              ><small>{{ line.name }} · 待采购 {{ line.limit }} {{ line.uom }}</small></span
            >
            <el-input
              v-model.number="line.quantity"
              type="number"
              min="0"
              :max="line.limit"
              step="any"
              aria-label="采购数量"
            />
          </div>
          <el-button type="primary" native-type="submit" :loading="pending === 'create-purchase'"
            >创建采购单</el-button
          >
        </el-form>
      </section>

      <section v-else class="flow-section flow-document">
        <header>
          <b>01 采购单 {{ purchaseOrder.orderNo }}</b
          ><el-tag>{{ purchaseStatusLabel(purchaseOrder.status) }}</el-tag>
        </header>
        <div class="flow-actions">
          <el-button
            v-if="canManage && purchaseOrder.status === 'DRAFT'"
            :disabled="!!pending"
            @click="purchaseAction('submit')"
            >提交审核</el-button
          >
          <el-button
            v-if="canApprove && purchaseOrder.status === 'PENDING_APPROVAL'"
            type="primary"
            :disabled="!!pending"
            @click="purchaseAction('approve')"
            >审核采购单</el-button
          >
          <el-button
            v-if="canManage && purchaseOrder.status === 'APPROVED'"
            type="primary"
            :disabled="!!pending"
            @click="purchaseAction('place')"
            >确认下单</el-button
          >
          <el-button
            v-if="
              canManage && purchaseOrder.status === 'RECEIVED' && inspection?.status === 'COMPLETED'
            "
            type="primary"
            :disabled="!!pending"
            @click="purchaseAction('complete')"
            >完成采购单</el-button
          >
        </div>
      </section>

      <section
        v-if="
          purchaseOrder &&
          ['ORDERED', 'PARTIALLY_RECEIVED'].includes(purchaseOrder.status) &&
          !receipt
        "
        class="flow-section"
      >
        <header><b>02 到货登记</b><small>按供应商批次登记实际到货量</small></header>
        <el-form
          label-position="top"
          :data-testid="`create-${branchKey}-receipt-form`"
          @submit.prevent="createReceipt"
        >
          <el-form-item label="到货单号" required
            ><el-input
              v-model="receiptForm.receiptNo"
              :data-testid="`receipt-${branchKey}-no`"
              maxlength="64"
          /></el-form-item>
          <div v-for="line in receiptForm.lines" :key="line.id" class="flow-line flow-line-receipt">
            <span
              ><code>{{ line.code }}</code
              ><small>最多可收 {{ line.limit }} {{ line.uom }}</small></span
            >
            <el-input
              v-model="line.supplierBatch"
              :data-testid="`receipt-${branchKey}-batch`"
              maxlength="80"
              placeholder="供应商批次"
              aria-label="供应商批次"
            />
            <el-input
              v-model.number="line.quantity"
              type="number"
              min="0"
              :max="line.limit"
              step="any"
              aria-label="到货数量"
            />
          </div>
          <el-button type="primary" native-type="submit" :loading="pending === 'receipt'"
            >确认到货</el-button
          >
        </el-form>
      </section>

      <section v-if="receipt" class="flow-section flow-document">
        <header>
          <b>02 到货单 {{ receipt.receiptNo }}</b
          ><el-tag type="warning">待检验</el-tag>
        </header>
      </section>

      <section v-if="receipt && !inspection" class="flow-section">
        <header><b>03 来料检验</b><small>合格数与不合格数必须等于检验数</small></header>
        <el-form
          label-position="top"
          :data-testid="`create-${branchKey}-inspection-form`"
          @submit.prevent="createInspection"
        >
          <el-form-item label="检验单号" required
            ><el-input
              v-model="inspectionForm.inspectionNo"
              :data-testid="`inspection-${branchKey}-no`"
              maxlength="64"
          /></el-form-item>
          <div v-for="line in inspectionForm.lines" :key="line.id" class="inspection-line">
            <span
              ><code>{{ line.code }}</code
              ><small>到货 {{ line.limit }} {{ line.uom }}</small></span
            >
            <label
              >检验数<el-input
                v-model.number="line.quantity"
                type="number"
                min="0"
                :max="line.limit"
                step="any"
            /></label>
            <label
              >合格数<el-input
                v-model.number="line.passedQuantity"
                type="number"
                min="0"
                step="any"
            /></label>
            <label
              >不合格数<el-input
                v-model.number="line.rejectedQuantity"
                type="number"
                min="0"
                step="any"
            /></label>
            <label class="inspection-note"
              >不合格说明<el-input v-model="line.defectNote" maxlength="240"
            /></label>
          </div>
          <el-button type="primary" native-type="submit" :loading="pending === 'inspection'"
            >创建检验单</el-button
          >
        </el-form>
      </section>

      <section v-if="inspection" class="flow-section flow-document">
        <header>
          <b>03 检验单 {{ inspection.inspectionNo }}</b
          ><el-tag>{{ inspectionStatusLabel(inspection.status) }}</el-tag>
        </header>
        <el-button
          v-if="canManage && inspection.status === 'INSPECTING'"
          type="primary"
          :disabled="!!pending"
          @click="inspectionAction('finish')"
          >完成检验判定</el-button
        >
      </section>

      <section
        v-if="
          inspection &&
          inspection.status !== 'INSPECTING' &&
          inspection.allowedActions.includes('CREATE_PUT_AWAY') &&
          inspection.items.some((item) => item.passedQuantity > 0) &&
          !putAway
        "
        class="flow-section"
      >
        <header><b>04 合格品上架</b><small>选择仓库并确认本次入库数量</small></header>
        <el-form
          label-position="top"
          :data-testid="`create-${branchKey}-put-away-form`"
          @submit.prevent="createPutAway"
        >
          <div class="flow-form-grid">
            <el-form-item label="上架单号" required
              ><el-input
                v-model="putAwayForm.putAwayNo"
                :data-testid="`put-away-${branchKey}-no`"
                maxlength="64"
            /></el-form-item>
            <el-form-item label="入库仓库" required
              ><SelectField
                v-model="putAwayForm.warehouseId"
                :data-testid="`put-away-${branchKey}-warehouse`"
                placeholder="选择仓库"
                filterable
                :options="warehouseOptions"
            /></el-form-item>
          </div>
          <div v-for="line in putAwayForm.lines" :key="line.id" class="flow-line">
            <span
              ><code>{{ line.code }}</code
              ><small>{{ line.name }} · 合格 {{ line.limit }} {{ line.uom }}</small></span
            >
            <el-input
              v-model.number="line.quantity"
              type="number"
              min="0"
              :max="line.limit"
              step="any"
              aria-label="上架数量"
            />
          </div>
          <el-button type="primary" native-type="submit" :loading="pending === 'put-away'"
            >创建上架单</el-button
          >
        </el-form>
      </section>

      <section v-if="putAway" class="flow-section flow-document">
        <header>
          <b>04 上架单 {{ putAway.putAwayNo }}</b
          ><el-tag :type="putAway.status === 'COMPLETED' ? 'success' : 'warning'">{{
            putAway.status === 'COMPLETED' ? '已入库' : '待入库'
          }}</el-tag>
        </header>
        <el-button
          v-if="canManage && putAway.status === 'DRAFT'"
          type="primary"
          :disabled="!!pending"
          @click="completePutAway"
          >确认完成入库</el-button
        >
        <el-button
          v-if="
            canManage &&
            putAway.status === 'COMPLETED' &&
            inspection?.allowedActions.includes('COMPLETE')
          "
          :disabled="!!pending"
          @click="inspectionAction('complete')"
          >完成来料检验</el-button
        >
      </section>
    </div>
  </el-drawer>
</template>

<style scoped>
.procurement-flow {
  display: grid;
  gap: 20px;
}
.flow-section {
  display: grid;
  gap: 16px;
  padding: 18px;
  border: 1px solid var(--el-border-color);
  background: var(--el-bg-color);
}
.flow-section > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.flow-section header small,
.flow-line small {
  display: block;
  color: var(--el-text-color-secondary);
}
.flow-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.flow-line {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(140px, 180px);
  align-items: end;
  gap: 12px;
  padding: 12px 0;
  border-top: 1px dashed var(--el-border-color);
}
.flow-line-receipt {
  grid-template-columns: minmax(160px, 1fr) minmax(140px, 180px) minmax(120px, 160px);
}
.inspection-line {
  display: grid;
  grid-template-columns: minmax(150px, 1fr) repeat(3, minmax(100px, 130px));
  gap: 12px;
  padding: 12px 0;
  border-top: 1px dashed var(--el-border-color);
}
.inspection-line label {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.inspection-note {
  grid-column: 2 / -1;
}
.flow-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
@media (max-width: 720px) {
  .flow-form-grid,
  .flow-line,
  .flow-line-receipt,
  .inspection-line {
    grid-template-columns: 1fr;
  }
  .inspection-note {
    grid-column: auto;
  }
  .flow-section > header {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
