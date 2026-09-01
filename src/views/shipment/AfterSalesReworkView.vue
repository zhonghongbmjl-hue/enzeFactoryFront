<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { shipmentApi } from '@/api/shipment'
import { createIdempotencyAttempt } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import type {
  AfterSalesAction,
  AfterSalesCase,
  AfterSalesStatus,
  EffectiveAfterSalesAction,
  AfterSalesTransitionInput,
} from '@/types/shipment'
import {
  useShipmentMutationFlight,
  type ShipmentMutationFlight,
  type ShipmentMutationScope,
} from './shipmentMutationFlight'

const route = useRoute()
const auth = useAuthStore()
const record = ref<AfterSalesCase | null>(null)
const error = ref('')
const loading = ref(false)
const carrier = ref('')
const trackingNo = ref('')
const reworkQuantity = ref('')
const workNote = ref('')
const inspectionMethod = ref<'SAMPLING' | 'FULL'>('FULL')
const submittedQuantity = ref('')
const passedQuantity = ref('')
const failedQuantity = ref('0.000000')
const defectCode = ref('')
const disposition = ref('')
const boxNo = ref('')
const dispositionType = ref<
  'SCRAP' | 'DOWNGRADE' | 'CONCESSION' | 'OTHER_AUTHORIZED' | 'REWORK_OVERRIDE'
>('SCRAP')
const dispositionOutcome = ref<'RELEASE' | 'DISPOSE' | 'REWORK'>('DISPOSE')
const dispositionQuantity = ref('0.000000')
const additionalAttempts = ref(0)
const decisionReason = ref('')
const evidenceRef = ref('')
const attempt = createIdempotencyAttempt()
const flightStore = useShipmentMutationFlight()
const flight = flightStore.flight
const owner = Symbol('after-sales-rework')
let sequence = 0
let active = true

const statuses: Array<{ status: AfterSalesStatus; label: string }> = [
  { status: 'CREATED', label: '创建' },
  { status: 'RETURN_IN_TRANSIT', label: '退货在途' },
  { status: 'RECEIVED_AND_QUARANTINED', label: '收货并隔离' },
  { status: 'REWORKING', label: '返工中' },
  { status: 'QUALITY_INSPECTION', label: '质量复检' },
  { status: 'REPACKING', label: '重新装箱' },
  { status: 'RESHIPPED', label: '重新发运' },
  { status: 'SIGNED', label: '签收' },
  { status: 'COMPLETED', label: '完成' },
]
type NextAction = { action: AfterSalesAction; label: string; permission: string }
const caseId = computed(() => String(route.params.caseId ?? ''))
const effectiveActions: Partial<
  Record<EffectiveAfterSalesAction, { action: AfterSalesAction; label: string }>
> = {
  RETURN_TRANSIT: { action: 'return-transit', label: '登记退货在途' },
  RECEIVE_QUARANTINE: { action: 'receive-quarantine', label: '确认收货并隔离' },
  START_REWORK: { action: 'rework/start', label: '开始下一轮返工' },
  COMPLETE_REWORK: { action: 'rework/complete', label: '完成当前轮返工' },
  INSPECT: { action: 'inspect', label: '提交独立复检' },
  PACK: { action: 'pack', label: '创建重新装箱' },
  CREATE_RESHIPMENT: { action: 'shipment', label: '创建补发发运单' },
  COMPLETE: { action: 'complete', label: '确认售后结清' },
  WAIT_DISPOSITION: { action: 'disposition/approve', label: '审批不合格处置' },
}
const nextAction = computed<NextAction | undefined>(() => {
  const value = record.value
  if (!value || !value.effectiveNextPermission) return undefined
  const mapped = effectiveActions[value.effectiveNextAction]
  return mapped ? { ...mapped, permission: value.effectiveNextPermission } : undefined
})
const canAct = computed(() => {
  if (!nextAction.value || !auth.permissions.has(nextAction.value.permission)) return false
  return (
    nextAction.value.action !== 'disposition/approve' || !!record.value?.dispositionApprovalAllowed
  )
})
const currentIndex = computed(() =>
  statuses.findIndex((item) => item.status === record.value?.status),
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
flightStore.activate(owner)
const initialScope = currentScope()
flightStore.setScope(initialScope)
const recoveredFlight = initialScope ? flightStore.syncFromStorage(initialScope, attempt) : null

function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.codePointAt(0)
    return code !== undefined && (code <= 31 || code === 127)
  })
}

async function load(expected: ShipmentMutationFlight | null = null): Promise<boolean> {
  const requested = caseId.value
  const token = ++sequence
  loading.value = true
  error.value = ''
  try {
    const value = await shipmentApi.getAfterSales(requested)
    if (!active || token !== sequence || requested !== caseId.value) return false
    record.value = value
    if (expected && flightStore.claimRefresh(owner, expected)) {
      expected.attempt.succeeded()
      flightStore.clear(expected)
      flightStore.releaseRefresh(owner)
    }
    return true
  } catch (reason) {
    if (active && token === sequence)
      error.value = reason instanceof Error ? reason.message : '读取售后事实失败'
    return false
  } finally {
    if (active && token === sequence) loading.value = false
  }
}

function transition(): void {
  const current = record.value
  const target = nextAction.value
  if (!current || !target || !canAct.value) return
  const payload: AfterSalesTransitionInput = { expectedVersion: current.version }
  if (target.action === 'return-transit') {
    if (
      !carrier.value.trim() ||
      carrier.value.length > 80 ||
      !trackingNo.value.trim() ||
      trackingNo.value.length > 120
    ) {
      error.value = '承运商和退货运单号不能为空且不能超过长度限制'
      return
    }
    payload.carrier = carrier.value.trim()
    payload.trackingNo = trackingNo.value.trim()
  }
  if (target.action === 'rework/start') {
    if (
      !/^(?:0|[1-9]\d{0,11})\.\d{6}$/.test(reworkQuantity.value) ||
      reworkQuantity.value === '0.000000' ||
      !workNote.value.trim() ||
      workNote.value.length > 500
    ) {
      error.value = '返工数量须为大于零的 6 位小数，并填写返工说明'
      return
    }
    payload.quantity = reworkQuantity.value as `${number}.${number}`
    payload.workNote = workNote.value.trim()
  }
  if (target.action === 'inspect') {
    if (
      !/^(?:0|[1-9]\d{0,11})\.\d{6}$/.test(submittedQuantity.value) ||
      !/^(?:0|[1-9]\d{0,11})\.\d{6}$/.test(passedQuantity.value) ||
      !/^(?:0|[1-9]\d{0,11})\.\d{6}$/.test(failedQuantity.value) ||
      submittedQuantity.value === '0.000000' ||
      defectCode.value.length > 120 ||
      !disposition.value.trim() ||
      disposition.value.length > 500
    ) {
      error.value = '复检数量须为 6 位小数，并填写处置结论'
      return
    }
    payload.method = inspectionMethod.value
    payload.submittedQuantity = submittedQuantity.value as `${number}.${number}`
    payload.passedQuantity = passedQuantity.value as `${number}.${number}`
    payload.failedQuantity = failedQuantity.value as `${number}.${number}`
    payload.defectCode = defectCode.value.trim().toUpperCase()
    payload.disposition = disposition.value.trim()
  }
  if (target.action === 'pack') {
    if (!boxNo.value.trim() || boxNo.value.length > 80 || containsControlCharacter(boxNo.value)) {
      error.value = '箱号长度须为 1—80 个可见字符'
      return
    }
    payload.boxNo = boxNo.value.trim()
  }
  if (target.action === 'disposition/approve') {
    if (
      !current.currentDisposition ||
      !/^(?:0|[1-9]\d{0,11})\.\d{6}$/.test(dispositionQuantity.value) ||
      !decisionReason.value.trim() ||
      decisionReason.value.length > 500 ||
      !evidenceRef.value.trim() ||
      evidenceRef.value.length > 120 ||
      !Number.isInteger(additionalAttempts.value) ||
      additionalAttempts.value < 0 ||
      additionalAttempts.value > 5
    ) {
      error.value = '处置数量、原因、证据及额外返工次数不合法'
      return
    }
    payload.dispositionId = current.currentDisposition.id
    payload.dispositionType = dispositionType.value
    payload.dispositionOutcome = dispositionOutcome.value
    payload.dispositionQuantity = dispositionQuantity.value as `${number}.${number}`
    payload.additionalAttempts = additionalAttempts.value
    payload.decisionReason = decisionReason.value.trim()
    payload.evidenceRef = evidenceRef.value.trim()
  }
  const request = {
    name: 'afterSales' as const,
    caseId: current.id,
    action: target.action,
    payload,
  }
  const value = flightStore.begin(owner, {
    sourceId: current.id,
    request,
    attempt,
    key: attempt.keyFor(request),
  })
  if (!value) {
    error.value = flight.value ? '已有售后请求处理中' : '无法安全保存请求，未向服务器提交'
    return
  }
  void (async () => {
    try {
      await shipmentApi.transitionAfterSales(current.id, target.action, payload, value.key)
      if (!active || flight.value?.key !== value.key) return
      flightStore.markConfirmed(value)
      await load(flight.value)
    } catch (reason) {
      if (value.attempt.failed(reason)) flightStore.clear(value)
      else flightStore.markOutcomeUnknown(value)
      if (active) error.value = reason instanceof Error ? reason.message : '售后操作失败'
    }
  })()
}

async function retryOutcomeUnknown(): Promise<void> {
  const readonlyValue = flight.value
  if (!readonlyValue || readonlyValue.status !== 'OUTCOME_UNKNOWN') return
  const request = readonlyValue.request
  if (request.name !== 'afterSales') return
  const value = readonlyValue as ShipmentMutationFlight
  try {
    await shipmentApi.transitionAfterSales(
      request.caseId,
      request.action,
      request.payload,
      value.key,
    )
    if (!active || flight.value?.key !== value.key) return
    flightStore.markConfirmed(value)
    await load(flight.value as ShipmentMutationFlight)
  } catch (reason) {
    if (value.attempt.failed(reason)) flightStore.clear(value)
    else flightStore.markOutcomeUnknown(value)
    if (active) error.value = reason instanceof Error ? reason.message : '售后重试确认失败'
  }
}

watch(
  caseId,
  () => {
    void load(
      recoveredFlight?.sourceId === caseId.value &&
        recoveredFlight.status === 'CONFIRMED_PENDING_REFRESH'
        ? recoveredFlight
        : null,
    )
  },
  { immediate: true },
)
watch(
  () => [auth.profile?.tenantId, auth.profile?.userId, auth.generation] as const,
  () => {
    ++sequence
    record.value = null
    flightStore.setScope(currentScope())
    flightStore.activate(owner)
  },
  { flush: 'sync' },
)
onUnmounted(() => {
  active = false
  ++sequence
  flightStore.releaseRefresh(owner)
  flightStore.deactivate(owner)
})
</script>

<template>
  <main class="after-sales">
    <header>
      <p>AFTER-SALES TRACE / 售后返工血缘</p>
      <h1>售后返工闭环</h1>
    </header>
    <p v-if="error" role="alert" class="alert">{{ error }}</p>
    <div v-if="flight" class="pending">
      <span>{{
        flight.status === 'OUTCOME_UNKNOWN'
          ? '请求结果待确认，请保留原幂等请求'
          : '售后请求处理中，正在刷新权威状态'
      }}</span>
      <button v-if="flight.status === 'OUTCOME_UNKNOWN'" type="button" @click="retryOutcomeUnknown">
        用原请求重试确认
      </button>
    </div>
    <section
      v-if="record"
      data-testid="immutable-lineage"
      class="lineage"
      aria-label="不可变原始血缘"
    >
      <h2>原始事实（不可编辑）</h2>
      <dl>
        <div>
          <dt>原订单</dt>
          <dd>{{ record.salesOrderId }}</dd>
        </div>
        <div>
          <dt>订单明细</dt>
          <dd>{{ record.orderItemId }}</dd>
        </div>
        <div>
          <dt>SKU</dt>
          <dd>{{ record.skuId }}</dd>
        </div>
        <div>
          <dt>生产批次</dt>
          <dd>{{ record.productionBatchId }}</dd>
        </div>
        <div>
          <dt>生产工单</dt>
          <dd>{{ record.workOrderId }}</dd>
        </div>
        <div>
          <dt>原箱</dt>
          <dd>{{ record.originalPackingOrderId }}</dd>
        </div>
        <div>
          <dt>原发运</dt>
          <dd>{{ record.originalShipmentId }}</dd>
        </div>
        <div>
          <dt>售后数量</dt>
          <dd>{{ record.quantity }}</dd>
        </div>
        <div>
          <dt>客户反馈</dt>
          <dd>{{ record.customerFeedback }}</dd>
        </div>
        <div>
          <dt>退货运单</dt>
          <dd>{{ record.returnCarrier || '待登记' }} / {{ record.returnTrackingNo || '—' }}</dd>
        </div>
      </dl>
    </section>
    <section v-if="record" class="action-card" data-testid="authoritative-progress">
      <h2>权威数量进度</h2>
      <p>
        当前返工 {{ record.currentReworkStatus || '尚未开始' }} / 已检 {{ record.attemptCount }} 轮
      </p>
      <p>累计合格 {{ record.cumulativePassed }}</p>
      <p>批准放行 {{ record.releasedQuantity }} / 授权处置 {{ record.disposedQuantity }}</p>
      <p>剩余待处理 {{ record.remainingQuantity }}</p>
      <p v-if="record.currentDisposition">
        当前处置 {{ record.currentDisposition.status }} /
        {{ record.currentDisposition.type || '待审批' }} / {{ record.currentDisposition.quantity }}
      </p>
    </section>
    <ol v-if="record" class="track" aria-label="售后状态轨道">
      <li
        v-for="(item, index) in statuses"
        :key="item.status"
        :class="{ done: index <= currentIndex }"
      >
        <span>{{ index + 1 }}</span
        ><b>{{ item.label }}</b
        ><small>{{ item.status }}</small>
      </li>
    </ol>
    <section v-if="record && nextAction" class="action-card">
      <template v-if="nextAction.action === 'return-transit'">
        <label>承运商<input v-model="carrier" maxlength="80" /></label>
        <label>退货运单号<input v-model="trackingNo" maxlength="120" /></label>
      </template>
      <template v-if="nextAction.action === 'rework/start'">
        <label
          >返工数量<input v-model="reworkQuantity" inputmode="decimal" placeholder="0.000000"
        /></label>
        <label>返工说明<textarea v-model="workNote" maxlength="500" /></label>
      </template>
      <template v-if="nextAction.action === 'inspect'">
        <label
          >检验方法<select v-model="inspectionMethod">
            <option value="FULL">全检</option>
            <option value="SAMPLING">抽检</option>
          </select></label
        >
        <label
          >送检数量<input v-model="submittedQuantity" inputmode="decimal" placeholder="0.000000"
        /></label>
        <label
          >合格数量<input v-model="passedQuantity" inputmode="decimal" placeholder="0.000000"
        /></label>
        <label
          >不合格数量<input v-model="failedQuantity" inputmode="decimal" placeholder="0.000000"
        /></label>
        <label>缺陷代码<input v-model="defectCode" maxlength="120" /></label>
        <label>处置结论<textarea v-model="disposition" maxlength="500" /></label>
      </template>
      <label v-if="nextAction.action === 'pack'"
        >新箱号<input v-model="boxNo" maxlength="80"
      /></label>
      <template v-if="nextAction.action === 'disposition/approve'">
        <label
          >处置类型<select v-model="dispositionType">
            <option value="SCRAP">报废</option>
            <option value="DOWNGRADE">降级放行</option>
            <option value="CONCESSION">让步接收</option>
            <option value="OTHER_AUTHORIZED">其他授权</option>
            <option value="REWORK_OVERRIDE">额外返工</option>
          </select></label
        >
        <label
          >数量结果<select v-model="dispositionOutcome">
            <option value="DISPOSE">处置不返发</option>
            <option value="RELEASE">批准放行</option>
            <option value="REWORK">追加返工</option>
          </select></label
        >
        <label>处置数量<input v-model="dispositionQuantity" inputmode="decimal" /></label>
        <label
          >额外返工次数<input v-model.number="additionalAttempts" type="number" min="0" max="5"
        /></label>
        <label>审批原因<textarea v-model="decisionReason" maxlength="500" /></label>
        <label>证据引用<input v-model="evidenceRef" maxlength="120" /></label>
      </template>
      <button
        v-if="canAct"
        data-testid="after-sales-next-action"
        :disabled="!!flight"
        @click="transition"
      >
        {{ nextAction.label }}
      </button>
      <p v-else class="permission-note">
        {{
          nextAction.action === 'disposition/approve' && !record.dispositionApprovalAllowed
            ? '处置产生人或源检验人不得审批自己的处置。'
            : `当前环节需要 ${nextAction.permission} 权限。`
        }}
      </p>
    </section>
    <section
      v-if="record?.effectiveNextAction === 'WAIT_DISPOSITION'"
      class="action-card"
      data-testid="pending-after-sales-disposition"
    >
      <b>不合格处置待独立审批</b>
      <p>当前返工和包装已冻结，须由 QUALITY_DISPOSITION_APPROVE 权限人员处理。</p>
    </section>
    <section v-if="record?.reshipmentId" class="action-card">
      <div>
        <b>补发发运单 {{ record.reshipmentId }}</b>
        <p>补发仍需申请、独立审批、逐行发运与签收。</p>
      </div>
      <RouterLink :to="`/shipments/${record.salesOrderId}`">进入发运审批工作台</RouterLink>
    </section>
    <p v-if="!record && !loading" class="empty">未找到售后返工事实</p>
  </main>
</template>

<style scoped>
.after-sales {
  padding: 28px;
  background: #eef0eb;
  color: #19221f;
  min-height: 100%;
}
header {
  border-bottom: 3px solid #26352e;
  padding-bottom: 14px;
}
header p {
  font: 700 12px monospace;
  letter-spacing: 0.1em;
  color: #65736b;
}
h1 {
  margin: 6px 0;
}
.alert,
.pending {
  padding: 12px;
  border: 1px solid #9a3e34;
  background: #fff;
}
.lineage,
.action-card {
  margin-top: 20px;
  padding: 20px;
  background: #fff;
  border: 1px solid #9ba49f;
}
.lineage dl {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1px;
  background: #cbd0cc;
}
.lineage dl div {
  background: #fff;
  padding: 12px;
}
.lineage dt {
  font-size: 12px;
  color: #66716b;
}
.lineage dd {
  margin: 5px 0 0;
  font-family: monospace;
  word-break: break-all;
}
.track {
  display: grid;
  grid-template-columns: repeat(9, 1fr);
  gap: 8px;
  list-style: none;
  padding: 0;
  margin: 24px 0;
}
.track li {
  display: grid;
  gap: 5px;
  padding: 14px;
  border: 1px solid #aeb7b2;
  background: #dfe3e0;
  color: #69736e;
}
.track li.done {
  background: #173f32;
  color: #fff;
}
.track span {
  font: 700 18px monospace;
}
.track small {
  font-size: 9px;
}
.action-card {
  display: flex;
  align-items: end;
  gap: 12px;
}
.action-card label {
  display: grid;
  gap: 5px;
}
input,
select,
textarea,
button {
  min-height: 38px;
  padding: 7px;
  border: 1px solid #68726c;
}
button {
  background: #173f32;
  color: #fff;
}
.empty {
  text-align: center;
  padding: 50px;
}
@media (max-width: 850px) {
  .lineage dl,
  .track {
    grid-template-columns: 1fr;
  }
  .action-card {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
