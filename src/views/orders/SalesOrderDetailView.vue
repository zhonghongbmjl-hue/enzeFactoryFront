<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { salesOrderApi } from '@/api/orders'
import { ApiClientError, createIdempotencyAttempt } from '@/api/http'
import OrderTimeline from '@/components/order/OrderTimeline.vue'
import { useAuthStore } from '@/stores/auth'
import { formatQuantity } from '@/utils/presentation'
import {
  ORDER_STATUS_LABELS,
  type OrderAction,
  type ManualDeliveryEvidence,
  type OrderStatus,
  type SalesOrder,
} from '@/types/order'
import {
  useShipmentMutationFlight,
  type ShipmentMutationFlight,
  type ShipmentMutationRequest,
  type ShipmentMutationScope,
} from '../shipment/shipmentMutationFlight'

const route = useRoute()
const auth = useAuthStore()
const order = ref<SalesOrder>()
const loading = ref(false)
const pendingAction = ref<OrderAction | ''>('')
const manualDeliveryPending = ref(false)
const manualDeliveryFile = ref<File>()
const frozenManualDeliveryEvidence = ref<ManualDeliveryEvidence>()
const manualDeliveryReason = ref('')
const confirmedDeliveredAt = ref('')
const closeDialogOpen = ref(false)
const evidenceAttempt = createIdempotencyAttempt()
const confirmationAttempt = createIdempotencyAttempt()
const flightStore = useShipmentMutationFlight()
const flightOwner = Symbol('manual-delivery-confirmation')
const flight = flightStore.flight
let active = true
const failure = ref('')
const traceId = ref('')
const orderId = computed(() => String(route.params.id))
const canManage = computed(() => auth.permissions.has('ORDER_MANAGE'))
const canApprove = computed(() => auth.permissions.has('ORDER_APPROVE'))
const canConfirmManualDelivery = computed(
  () => auth.permissions.has('ORDER_MANUAL_CLOSE') && order.value?.status === 'SHIPPED',
)
const canViewProcurement = computed(
  () => auth.permissions.has('PROCUREMENT_VIEW') && (order.value?.requirements.length ?? 0) > 0,
)
const canViewShipment = computed(
  () => auth.permissions.has('SHIPMENT_VIEW') || auth.permissions.has('AFTER_SALES_MANAGE'),
)
const canCancel = computed(
  () =>
    canManage.value &&
    order.value !== undefined &&
    ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'MATERIAL_PREPARING'].includes(order.value.status),
)
const requirementsAreHistorical = computed(
  () =>
    order.value !== undefined &&
    !['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'MATERIAL_PREPARING'].includes(order.value.status),
)
const canCloseOrder = computed(
  () => order.value?.status === 'AFTER_SALES_OBSERVATION' && order.value.closureReadiness?.canClose,
)
const closureChecks = computed(() => [
  {
    label: '全部发运已签收',
    passed: Boolean(order.value?.closureReadiness?.allShipmentsSigned),
  },
  {
    label: '售后观察期已结束',
    passed: Boolean(order.value?.closureReadiness?.observationPeriodEnded),
  },
  {
    label: '质量、生产、采购、库存及售后异常均已关闭',
    passed: Boolean(order.value?.closureReadiness?.allExceptionsClosed),
  },
])

function currentScope(): ShipmentMutationScope | null {
  return auth.profile
    ? {
        tenantId: auth.profile.tenantId,
        userId: auth.profile.userId,
        authGeneration: auth.generation,
      }
    : null
}

flightStore.activate(flightOwner)
const initialScope = currentScope()
flightStore.setScope(initialScope)
const recoveredFlight = initialScope
  ? flightStore.syncFromStorage(initialScope, confirmationAttempt)
  : null

function isManualDeliveryFlight(
  value: ShipmentMutationFlight | null | undefined,
): value is ShipmentMutationFlight & {
  request: Extract<ShipmentMutationRequest, { name: 'confirmManualDelivery' }>
} {
  return Boolean(
    value &&
    value.sourceId === orderId.value &&
    value.request.name === 'confirmManualDelivery' &&
    value.request.orderId === orderId.value,
  )
}

function report(error: unknown, fallback: string): void {
  const candidate = error as Partial<ApiClientError>
  failure.value = candidate.message || fallback
  traceId.value = candidate.traceId || ''
}

async function load(expectedFlight: ShipmentMutationFlight | null = null): Promise<boolean> {
  loading.value = true
  failure.value = ''
  traceId.value = ''
  try {
    order.value = await salesOrderApi.get(orderId.value)
    if (expectedFlight && flightStore.claimRefresh(flightOwner, expectedFlight)) {
      expectedFlight.attempt.succeeded()
      flightStore.clear(expectedFlight)
      flightStore.releaseRefresh(flightOwner)
    }
    return true
  } catch (error) {
    report(error, '订单详情加载失败')
    return false
  } finally {
    loading.value = false
  }
}

async function executeManualDeliveryFlight(value: ShipmentMutationFlight): Promise<void> {
  if (!isManualDeliveryFlight(value)) throw new Error('持久化的人工送达请求与当前订单不匹配')
  await salesOrderApi.confirmManualDelivery(value.request.orderId, value.request.payload, value.key)
}

async function submitManualDeliveryFlight(value: ShipmentMutationFlight): Promise<void> {
  try {
    await executeManualDeliveryFlight(value)
    if (!active || flight.value?.key !== value.key) return
    flightStore.markConfirmed(value)
    await load(flight.value as ShipmentMutationFlight)
    manualDeliveryFile.value = undefined
    frozenManualDeliveryEvidence.value = undefined
    manualDeliveryReason.value = ''
    confirmedDeliveredAt.value = ''
    ElMessage.success('已记录人工送达确认，订单进入售后观察期')
  } catch (error) {
    if (value.attempt.failed(error)) flightStore.clear(value)
    else flightStore.markOutcomeUnknown(value)
    if (active) report(error, '人工送达确认失败')
  }
}

async function retryRecoveredManualDelivery(value: ShipmentMutationFlight): Promise<void> {
  if (!isManualDeliveryFlight(value) || value.status !== 'OUTCOME_UNKNOWN') return
  manualDeliveryPending.value = true
  try {
    await submitManualDeliveryFlight(value)
  } finally {
    if (active) manualDeliveryPending.value = false
  }
}

async function initialize(): Promise<void> {
  const recovered = isManualDeliveryFlight(recoveredFlight) ? recoveredFlight : null
  if (recovered?.status === 'CONFIRMED_PENDING_REFRESH') {
    await load(recovered)
    return
  }
  if ((await load()) && recovered?.status === 'OUTCOME_UNKNOWN') {
    await retryRecoveredManualDelivery(recovered)
  }
}

async function act(action: OrderAction): Promise<boolean> {
  if (!order.value || pendingAction.value) return false
  pendingAction.value = action
  failure.value = ''
  traceId.value = ''
  try {
    order.value = await salesOrderApi.action(order.value.id, action, order.value.version)
    ElMessage.success(
      {
        submit: '订单已提交审核',
        approve: '订单已审核',
        cancel: '订单已取消',
        close: '订单已完成',
      }[action],
    )
    return true
  } catch (error) {
    report(error, '订单状态更新失败')
    return false
  } finally {
    pendingAction.value = ''
  }
}

async function closeOrder(): Promise<void> {
  if (!canCloseOrder.value) return
  if (await act('close')) closeDialogOpen.value = false
}

function selectManualDeliveryFile(event: Event): void {
  const input = event.target as HTMLInputElement
  manualDeliveryFile.value = input.files?.[0]
  frozenManualDeliveryEvidence.value = undefined
}

async function confirmManualDelivery(): Promise<void> {
  if (!order.value || manualDeliveryPending.value || !manualDeliveryFile.value) return
  const reason = manualDeliveryReason.value.trim()
  if (!reason || !confirmedDeliveredAt.value) {
    failure.value = '请填写人工核验原因、送达时间并上传送达图片凭证'
    return
  }
  const file = manualDeliveryFile.value
  if (
    !['image/jpeg', 'image/png'].includes(file.type) ||
    file.size === 0 ||
    file.size > 10 * 1024 * 1024
  ) {
    failure.value = '凭证仅支持 JPG、PNG 图片，且单文件不超过 10MB'
    return
  }
  const deliveredAt = new Date(confirmedDeliveredAt.value)
  if (Number.isNaN(deliveredAt.getTime())) {
    failure.value = '人工确认送达时间无效'
    return
  }
  manualDeliveryPending.value = true
  failure.value = ''
  traceId.value = ''
  try {
    const evidencePayload = {
      orderId: order.value.id,
      name: file.name,
      type: file.type,
      size: file.size,
      lastModified: file.lastModified,
    }
    const evidence =
      frozenManualDeliveryEvidence.value ??
      (await salesOrderApi.uploadManualDeliveryEvidence(
        order.value.id,
        file,
        evidenceAttempt.keyFor(evidencePayload),
      ))
    frozenManualDeliveryEvidence.value = evidence
    evidenceAttempt.succeeded()
    const confirmation = {
      expectedVersion: order.value.version,
      reason,
      evidenceManifestId: evidence.id,
      confirmedDeliveredAt: deliveredAt.toISOString(),
    }
    const request: ShipmentMutationRequest = {
      name: 'confirmManualDelivery',
      orderId: order.value.id,
      payload: confirmation,
    }
    const value = flightStore.begin(flightOwner, {
      sourceId: order.value.id,
      request,
      attempt: confirmationAttempt,
      key: confirmationAttempt.keyFor(confirmation),
    })
    if (!value) {
      failure.value = flight.value
        ? '已有发运请求处理中'
        : '无法安全保存人工送达请求，未向服务器提交'
      return
    }
    await submitManualDeliveryFlight(value)
  } catch (error) {
    evidenceAttempt.failed(error)
    report(error, '人工送达确认失败')
  } finally {
    manualDeliveryPending.value = false
  }
}

function formatMoment(value?: string): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

function statusLabel(status?: OrderStatus): string {
  return status ? ORDER_STATUS_LABELS[status] : '创建'
}

function actionLabel(action: string): string {
  return (
    {
      CREATE: '创建订单',
      SUBMIT: '提交审核',
      APPROVE: '审核通过',
      CANCEL: '取消订单',
      CLOSE: '关闭订单',
      CONFIRM_MANUAL_DELIVERY: '确认人工送达',
    }[action] ?? action
  )
}

watch(
  () => [auth.profile?.tenantId, auth.profile?.userId, auth.generation] as const,
  () => {
    flightStore.setScope(currentScope())
    flightStore.activate(flightOwner)
  },
  { flush: 'sync' },
)
onMounted(() => void initialize())
onUnmounted(() => {
  active = false
  flightStore.releaseRefresh(flightOwner)
  flightStore.deactivate(flightOwner)
})
</script>

<template>
  <section v-if="order" class="order-detail" :aria-busy="loading">
    <header class="detail-ticket order-ticket">
      <div>
        <p class="eyebrow">SALES ORDER / ORDER FULFILLMENT / {{ order.orderNo }}</p>
        <h1>{{ order.customerName }}</h1>
        <p>{{ order.customerCode }} · 下单日 {{ order.orderDate }} · 版本 {{ order.version }}</p>
      </div>
      <div class="ticket-actions">
        <span class="order-state" :class="order.status.toLowerCase()">
          {{ ORDER_STATUS_LABELS[order.status] }}
        </span>
        <RouterLink
          v-if="canViewProcurement"
          data-testid="open-procurement"
          class="outline-action procurement-entry"
          :to="`/procurement/${order.id}`"
        >
          {{ requirementsAreHistorical ? '采购与来料记录' : '采购与来料' }}
        </RouterLink>
        <RouterLink
          v-if="canViewShipment"
          data-testid="open-shipment"
          class="outline-action"
          :to="`/shipments/${order.id}`"
        >
          包装与发运
        </RouterLink>
        <el-button
          v-if="canManage && order.status === 'DRAFT'"
          data-testid="submit-order"
          :disabled="!!pendingAction"
          @click="act('submit')"
        >
          提交审核
        </el-button>
        <el-button
          v-if="canApprove && order.status === 'PENDING_APPROVAL'"
          data-testid="approve-order"
          type="primary"
          :disabled="!!pendingAction"
          @click="act('approve')"
        >
          审核并冻结BOM
        </el-button>
        <el-button
          v-if="canCancel"
          data-testid="cancel-order"
          :disabled="!!pendingAction"
          @click="act('cancel')"
        >
          取消订单
        </el-button>
        <el-button
          v-if="canApprove && order.status === 'AFTER_SALES_OBSERVATION'"
          data-testid="close-order"
          type="danger"
          :disabled="!!pendingAction || !canCloseOrder"
          @click="closeDialogOpen = true"
        >
          关闭订单
        </el-button>
      </div>
    </header>

    <el-alert
      v-if="failure"
      :title="failure"
      type="error"
      :closable="false"
      show-icon
      role="alert"
      aria-live="polite"
    >
      <span v-if="traceId">追踪号 {{ traceId }}</span>
    </el-alert>

    <OrderTimeline :status="order.status" :progress="order.progress" />

    <article
      v-if="order.status === 'AFTER_SALES_OBSERVATION'"
      class="pattern-panel closure-gate-panel"
      data-testid="closure-gate"
    >
      <header class="panel-title">
        <div>
          <p class="eyebrow">ORDER CLOSURE GATE</p>
          <h2>订单关闭检查</h2>
        </div>
        <span :class="['closure-state', { ready: canCloseOrder }]">
          {{ canCloseOrder ? '可以关闭' : '暂不可关闭' }}
        </span>
      </header>
      <ul class="closure-checks">
        <li v-for="check in closureChecks" :key="check.label" :class="{ passed: check.passed }">
          <span aria-hidden="true">{{ check.passed ? '✓' : '—' }}</span>
          {{ check.label }}
        </li>
      </ul>
      <p v-if="!canCloseOrder" class="closure-help">
        完成所有未通过项后刷新页面；服务端会在提交时再次核验，避免误关订单。
      </p>
    </article>

    <el-dialog v-model="closeDialogOpen" title="确认关闭订单" width="min(32rem, 92vw)">
      <p>关闭后订单将进入“订单完成”，该生命周期操作不可撤销。</p>
      <template #footer>
        <el-button @click="closeDialogOpen = false">返回检查</el-button>
        <el-button
          type="danger"
          data-testid="confirm-close-order"
          :loading="pendingAction === 'close'"
          @click="closeOrder"
        >
          确认关闭订单
        </el-button>
      </template>
    </el-dialog>

    <article
      v-if="canConfirmManualDelivery"
      class="pattern-panel manual-delivery-panel"
      data-testid="manual-delivery-panel"
    >
      <header class="panel-title">
        <div>
          <p class="eyebrow">HIGH AUTHORITY / DELIVERY EVIDENCE</p>
          <h2>人工确认送达</h2>
        </div>
      </header>
      <p>
        仅用于承运方确实没有签收回传、但订单已全部发运的情形。确认后进入售后观察期，不会立即关闭订单。
      </p>
      <div class="manual-delivery-fields">
        <label>
          <span>送达图片凭证（JPG / PNG，≤ 10MB）</span>
          <input
            data-testid="manual-delivery-file"
            type="file"
            accept="image/jpeg,image/png"
            :disabled="manualDeliveryPending"
            @change="selectManualDeliveryFile"
          />
        </label>
        <label>
          <span>人工确认送达时间</span>
          <input
            v-model="confirmedDeliveredAt"
            class="native-control"
            data-testid="manual-delivery-time"
            type="datetime-local"
            :disabled="manualDeliveryPending"
          />
        </label>
        <label class="manual-delivery-reason">
          <span>授权原因</span>
          <el-input
            v-model="manualDeliveryReason"
            type="textarea"
            data-testid="manual-delivery-reason"
            maxlength="500"
            :rows="3"
            :disabled="manualDeliveryPending"
          />
        </label>
      </div>
      <el-button
        type="primary"
        data-testid="confirm-manual-delivery"
        :disabled="manualDeliveryPending || !manualDeliveryFile"
        @click="confirmManualDelivery"
      >
        {{ manualDeliveryPending ? '正在冻结凭证并确认…' : '冻结凭证并确认送达' }}
      </el-button>
    </article>

    <div class="order-detail-grid">
      <article class="pattern-panel order-span-two">
        <header class="panel-title">
          <div>
            <p class="eyebrow">ORDER LINES</p>
            <h2>订单明细</h2>
          </div>
          <span>{{ order.items.reduce((sum, item) => sum + item.quantity, 0) }} 件</span>
        </header>
        <div class="responsive-table">
          <el-table class="order-data-table" :data="order.items">
            <el-table-column label="颜色 / 尺码 / 版型" min-width="180">
              <template #default="{ row }"
                >{{ row.color }} / {{ row.size }} / {{ row.fit }}</template
              >
            </el-table-column>
            <el-table-column prop="quantity" label="数量" min-width="80" />
            <el-table-column label="生产完成" min-width="200">
              <template #default="{ row }">
                {{ formatQuantity(row.productionCompletedQuantity) }} / {{ row.quantity }} ·
                {{
                  row.productionStatus === 'READY'
                    ? '已齐套完成'
                    : row.productionStatus === 'PARTIAL'
                      ? '部分完成'
                      : '待生产'
                }}
              </template>
            </el-table-column>
            <el-table-column prop="deliveryDate" label="交期" min-width="120" />
            <el-table-column label="单价" min-width="100">
              <template #default="{ row }">
                {{ row.unitPrice == null ? '—' : '¥' + row.unitPrice.toFixed(2) }}
              </template>
            </el-table-column>
            <el-table-column label="特殊工艺" min-width="120">
              <template #default="{ row }">{{ row.specialProcess || '—' }}</template>
            </el-table-column>
          </el-table>
        </div>
      </article>

      <article class="pattern-panel">
        <header class="panel-title">
          <div>
            <p class="eyebrow">FROZEN BASELINE</p>
            <h2>冻结BOM快照</h2>
          </div>
        </header>
        <div v-if="order.bomSnapshots.length === 0" class="panel-empty">
          审核后生成不可变BOM快照。
        </div>
        <section v-for="snapshot in order.bomSnapshots" :key="snapshot.id" class="snapshot-card">
          <header>
            <span
              ><b>{{ snapshot.styleNo }} · {{ snapshot.skuCode }}</b
              ><small
                >产品 v{{ snapshot.sourceProductVersion }} · SKU v{{
                  snapshot.sourceSkuVersion
                }}</small
              ></span
            ><code>{{ snapshot.sourceBomVersionNo }}</code>
          </header>
          <ul>
            <li v-for="item in snapshot.items" :key="item.materialId">
              <span
                ><code>{{ item.materialCode }}</code
                ><small>{{ item.materialName }}</small></span
              >
              <b
                >{{ item.usageQuantity }} {{ item.uom }} +
                {{ (item.lossRate * 100).toFixed(2) }}%</b
              >
            </li>
          </ul>
        </section>
      </article>

      <article class="pattern-panel">
        <header class="panel-title">
          <div>
            <p class="eyebrow">MATERIAL REQUIREMENT SNAPSHOT</p>
            <h2>审批时物料需求快照</h2>
          </div>
        </header>
        <div v-if="order.requirements.length === 0" class="panel-empty">
          审核后自动计算库存占用与采购缺口。
        </div>
        <details v-else class="requirement-snapshot" :open="!requirementsAreHistorical">
          <summary v-if="requirementsAreHistorical">
            查看审批时快照（{{ order.requirements.length }} 项）
          </summary>
          <p class="snapshot-notice">
            以下数值冻结于订单审批时，仅用于追溯，不代表当前库存或待采购缺口。
          </p>
          <ul class="requirement-list">
            <li v-for="item in order.requirements" :key="item.id">
              <header>
                <span
                  ><code>{{ item.materialCode }}</code> {{ item.materialName }}</span
                ><b
                  >审批时净缺口 {{ formatQuantity(item.netRequirementQuantity) }} {{ item.uom }}</b
                >
              </header>
              <div>
                <span>审批时毛需求 {{ formatQuantity(item.grossQuantity) }}</span>
                <span>审批时可用 {{ formatQuantity(item.availableQuantity) }}</span>
                <span>审批时已占用 {{ formatQuantity(item.reservedQuantity) }}</span>
              </div>
            </li>
          </ul>
        </details>
      </article>

      <article class="pattern-panel order-span-two">
        <header class="panel-title">
          <div>
            <p class="eyebrow">AUDIT TRAIL</p>
            <h2>操作历史</h2>
          </div>
        </header>
        <ol class="order-history">
          <li v-for="entry in order.history" :key="entry.id">
            <time :datetime="entry.occurredAt">{{ formatMoment(entry.occurredAt) }}</time>
            <span
              ><b>{{ entry.actorName }}</b
              ><small>{{ actionLabel(entry.action) }}</small></span
            >
            <span
              >{{ statusLabel(entry.fromStatus) }} → <b>{{ statusLabel(entry.toStatus) }}</b></span
            >
          </li>
        </ol>
      </article>
    </div>
  </section>
  <section v-else class="pattern-panel" :aria-busy="loading">
    <p v-if="!failure">正在装载订单履约档案…</p>
    <el-alert v-else :title="failure" type="error" :closable="false" show-icon role="alert">
      <span v-if="traceId">追踪号 {{ traceId }}</span>
    </el-alert>
  </section>
</template>

<style scoped>
.manual-delivery-panel {
  margin-bottom: 1.25rem;
}

.closure-gate-panel {
  margin-bottom: 1.25rem;
}

.closure-state {
  color: var(--danger-color, #a23b24);
  font-weight: 800;
}

.closure-state.ready,
.closure-checks li.passed {
  color: var(--success-color, #287a61);
}

.closure-checks {
  display: grid;
  gap: 0.65rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.closure-checks li {
  display: flex;
  gap: 0.65rem;
  align-items: flex-start;
  color: var(--muted-color, #6f6b63);
}

.closure-checks li span {
  width: 1.25rem;
  flex: 0 0 1.25rem;
  font-weight: 900;
}

.closure-help,
.snapshot-notice {
  color: var(--muted-color, #6f6b63);
  line-height: 1.6;
}

.requirement-snapshot summary {
  min-height: 2.75rem;
  cursor: pointer;
  font-weight: 800;
}

.manual-delivery-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(15rem, 0.7fr);
  gap: 1rem;
  margin: 1rem 0;
}

.manual-delivery-fields label {
  display: grid;
  gap: 0.45rem;
  font-weight: 700;
}

.manual-delivery-fields input,
.manual-delivery-fields textarea {
  box-sizing: border-box;
  width: 100%;
  padding: 0.7rem;
  border: 1px solid var(--line-color, #b8b1a4);
  background: var(--surface-color, #fff);
  color: inherit;
}

.manual-delivery-reason {
  grid-column: 1 / -1;
}

@media (max-width: 760px) {
  .manual-delivery-fields {
    grid-template-columns: 1fr;
  }

  .manual-delivery-reason {
    grid-column: auto;
  }
}
</style>
