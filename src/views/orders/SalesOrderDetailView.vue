<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { salesOrderApi } from '@/api/orders'
import { ApiClientError, createIdempotencyAttempt } from '@/api/http'
import OrderTimeline from '@/components/order/OrderTimeline.vue'
import { useAuthStore } from '@/stores/auth'
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

async function act(action: OrderAction): Promise<void> {
  if (!order.value || pendingAction.value) return
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
  } catch (error) {
    report(error, '订单状态更新失败')
  } finally {
    pendingAction.value = ''
  }
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
        <p class="eyebrow">PURCHASE ORDER / {{ order.orderNo }}</p>
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
          采购与来料
        </RouterLink>
        <RouterLink
          v-if="canViewShipment"
          data-testid="open-shipment"
          class="outline-action"
          :to="`/shipments/${order.id}`"
        >
          包装与发运
        </RouterLink>
        <button
          v-if="canManage && order.status === 'DRAFT'"
          data-testid="submit-order"
          class="outline-action"
          type="button"
          :disabled="!!pendingAction"
          @click="act('submit')"
        >
          提交审核
        </button>
        <button
          v-if="canApprove && order.status === 'PENDING_APPROVAL'"
          data-testid="approve-order"
          class="primary-action compact"
          type="button"
          :disabled="!!pendingAction"
          @click="act('approve')"
        >
          <span>审核并冻结BOM</span><b>✓</b>
        </button>
        <button
          v-if="canCancel"
          data-testid="cancel-order"
          class="outline-action danger-action"
          type="button"
          :disabled="!!pendingAction"
          @click="act('cancel')"
        >
          取消订单
        </button>
        <button
          v-if="canApprove && order.status === 'AFTER_SALES_OBSERVATION'"
          data-testid="close-order"
          class="primary-action compact"
          type="button"
          :disabled="!!pendingAction"
          @click="act('close')"
        >
          <span>关闭订单</span><b>✓</b>
        </button>
      </div>
    </header>

    <div v-if="failure" class="master-error" role="alert" aria-live="polite">
      <b>{{ failure }}</b
      ><span v-if="traceId">追踪号 {{ traceId }}</span>
    </div>

    <OrderTimeline :status="order.status" :progress="order.progress" />

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
            data-testid="manual-delivery-time"
            type="datetime-local"
            :disabled="manualDeliveryPending"
          />
        </label>
        <label class="manual-delivery-reason">
          <span>授权原因</span>
          <textarea
            v-model="manualDeliveryReason"
            data-testid="manual-delivery-reason"
            maxlength="500"
            rows="3"
            :disabled="manualDeliveryPending"
          />
        </label>
      </div>
      <button
        class="primary-action compact"
        data-testid="confirm-manual-delivery"
        type="button"
        :disabled="manualDeliveryPending || !manualDeliveryFile"
        @click="confirmManualDelivery"
      >
        <span>{{ manualDeliveryPending ? '正在冻结凭证并确认…' : '冻结凭证并确认送达' }}</span
        ><b>✓</b>
      </button>
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
          <table class="order-data-table">
            <thead>
              <tr>
                <th>颜色 / 尺码 / 版型</th>
                <th>数量</th>
                <th>生产完成</th>
                <th>交期</th>
                <th>单价</th>
                <th>特殊工艺</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in order.items" :key="item.id">
                <td>{{ item.color }} / {{ item.size }} / {{ item.fit }}</td>
                <td>{{ item.quantity }}</td>
                <td>
                  {{ item.productionCompletedQuantity }} / {{ item.quantity }} ·
                  {{
                    item.productionStatus === 'READY'
                      ? '已齐套完成'
                      : item.productionStatus === 'PARTIAL'
                        ? '部分完成'
                        : '待生产'
                  }}
                </td>
                <td>{{ item.deliveryDate }}</td>
                <td>{{ item.unitPrice == null ? '—' : '¥' + item.unitPrice.toFixed(2) }}</td>
                <td>{{ item.specialProcess || '—' }}</td>
              </tr>
            </tbody>
          </table>
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
            <p class="eyebrow">MATERIAL GAP</p>
            <h2>物料需求</h2>
          </div>
        </header>
        <div v-if="order.requirements.length === 0" class="panel-empty">
          审核后自动计算库存占用与采购缺口。
        </div>
        <ul class="requirement-list">
          <li v-for="item in order.requirements" :key="item.id">
            <header>
              <span
                ><code>{{ item.materialCode }}</code> {{ item.materialName }}</span
              ><b>净缺口 {{ item.netRequirementQuantity }} {{ item.uom }}</b>
            </header>
            <div>
              <span>毛需求 {{ item.grossQuantity }}</span>
              <span>可用 {{ item.availableQuantity }}</span>
              <span>已占用 {{ item.reservedQuantity }}</span>
            </div>
          </li>
        </ul>
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
              ><small>{{ entry.action }}</small></span
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
    <div v-else class="master-error" role="alert">
      <b>{{ failure }}</b
      ><span v-if="traceId">追踪号 {{ traceId }}</span>
    </div>
  </section>
</template>

<style scoped>
.manual-delivery-panel {
  margin-bottom: 1.25rem;
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
