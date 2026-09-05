<script setup lang="ts">
import SelectField from '@/components/form/SelectField.vue'
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { shipmentApi } from '@/api/shipment'
import { createIdempotencyAttempt } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import type { DecimalString, Shipment, ShipmentOrderWorkspace } from '@/types/shipment'
import {
  useShipmentMutationFlight,
  type ShipmentMutationFlight,
  type ShipmentMutationRequest,
  type ShipmentMutationScope,
} from './shipmentMutationFlight'

const route = useRoute()
const auth = useAuthStore()
const workspace = ref<ShipmentOrderWorkspace | null>(null)
const loading = ref(false)
const error = ref('')
const boxNo = ref('')
const qualityInspectionId = ref('')
const packingQuantity = ref('')
const selectedPackingItems = ref<Record<string, boolean>>({})
const shipmentQuantity = ref<Record<string, string>>({})
const progressQuantity = ref<Record<string, string>>({})
const afterSalesSourceId = ref('')
const afterSalesQuantity = ref('')
const afterSalesReason = ref('')
const customerFeedback = ref('')
const attempt = createIdempotencyAttempt()
const flightStore = useShipmentMutationFlight()
const owner = Symbol('shipment-workspace')
const flight = flightStore.flight
let sequence = 0
let active = true

flightStore.activate(owner)
function currentScope(): ShipmentMutationScope | null {
  return auth.profile
    ? {
        tenantId: auth.profile.tenantId,
        userId: auth.profile.userId,
        authGeneration: auth.generation,
      }
    : null
}
const initialScope = currentScope()
flightStore.setScope(initialScope)
const recoveredFlight = initialScope ? flightStore.syncFromStorage(initialScope, attempt) : null

const orderId = computed(() => String(route.params.orderId ?? ''))
const canManage = computed(() => auth.permissions.has('SHIPMENT_MANAGE'))
const canApprove = computed(() => auth.permissions.has('SHIPMENT_APPROVE'))
const canAfterSales = computed(() => auth.permissions.has('AFTER_SALES_MANAGE'))
const eligibleAfterSalesLines = computed(() =>
  (workspace.value?.shipments ?? [])
    .filter((item) => item.status === 'SIGNED' && (item.source ?? 'NORMAL') === 'NORMAL')
    .flatMap((item) => item.lines.map((line) => ({ shipment: item, line }))),
)
const decimalPattern = /^(?:0|[1-9]\d{0,11})\.\d{6}$/

async function load(expectedFlight: ShipmentMutationFlight | null = null): Promise<boolean> {
  const requested = orderId.value
  const token = ++sequence
  loading.value = true
  error.value = ''
  try {
    const value = await shipmentApi.orderWorkspace(requested)
    if (!active || token !== sequence || requested !== orderId.value) return false
    workspace.value = value
    if (expectedFlight && flightStore.claimRefresh(owner, expectedFlight)) {
      expectedFlight.attempt.succeeded()
      flightStore.clear(expectedFlight)
      flightStore.releaseRefresh(owner)
    }
    return true
  } catch (reason) {
    if (active && token === sequence)
      error.value = reason instanceof Error ? reason.message : '读取发运事实失败'
    return false
  } finally {
    if (active && token === sequence) loading.value = false
  }
}

async function execute(value: ShipmentMutationFlight): Promise<void> {
  const request = value.request
  if (request.name === 'pack') await shipmentApi.pack(request.payload, value.key)
  else if (request.name === 'createShipment')
    await shipmentApi.createShipment(request.payload, value.key)
  else if (request.name === 'createAfterSales')
    await shipmentApi.receiveAfterSales(request.payload, value.key)
  else if (request.name === 'approve')
    await shipmentApi.approve(request.shipmentId, request.expectedVersion, value.key)
  else if (request.name === 'requestApproval')
    await shipmentApi.requestApproval(request.shipmentId, request.expectedVersion, value.key)
  else if (request.name === 'dispatch')
    await shipmentApi.dispatch(
      request.shipmentId,
      request.payload.expectedVersion,
      request.payload.lines,
      value.key,
    )
  else if (request.name === 'sign')
    await shipmentApi.sign(
      request.shipmentId,
      request.payload.expectedVersion,
      request.payload.lines,
      value.key,
    )
  else throw new Error('当前工作台不能执行该请求')
}

async function mutate(request: ShipmentMutationRequest): Promise<void> {
  const value = flightStore.begin(owner, {
    sourceId: orderId.value,
    request,
    attempt,
    key: attempt.keyFor(request),
  })
  if (!value) {
    error.value = flight.value ? '已有发运请求处理中' : '无法安全保存请求，未向服务器提交'
    return
  }
  try {
    await execute(value)
    if (!active || flight.value?.key !== value.key) return
    flightStore.markConfirmed(value)
    await load(flight.value)
  } catch (reason) {
    if (value.attempt.failed(reason)) flightStore.clear(value)
    else flightStore.markOutcomeUnknown(value)
    if (active) error.value = reason instanceof Error ? reason.message : '发运操作失败'
  }
}

async function retryOutcomeUnknown(): Promise<void> {
  const readonlyValue = flight.value
  if (!readonlyValue || readonlyValue.status !== 'OUTCOME_UNKNOWN') return
  const value = readonlyValue as ShipmentMutationFlight
  try {
    await execute(value)
    if (!active || flight.value?.key !== value.key) return
    flightStore.markConfirmed(value)
    await load(flight.value as ShipmentMutationFlight)
  } catch (reason) {
    if (value.attempt.failed(reason)) flightStore.clear(value)
    else flightStore.markOutcomeUnknown(value)
    if (active) error.value = reason instanceof Error ? reason.message : '发运重试确认失败'
  }
}

function pack(): void {
  if (
    !canManage.value ||
    !decimalPattern.test(packingQuantity.value) ||
    packingQuantity.value === '0.000000' ||
    !boxNo.value.trim() ||
    boxNo.value.length > 80 ||
    !qualityInspectionId.value.trim()
  ) {
    error.value = '箱号、质检批次和数量格式无效（数量须为 6 位小数）'
    return
  }
  void mutate({
    name: 'pack',
    payload: {
      salesOrderId: orderId.value,
      boxNo: boxNo.value.trim(),
      lines: [
        {
          qualityInspectionId: qualityInspectionId.value.trim(),
          quantity: packingQuantity.value as DecimalString,
        },
      ],
    },
  })
}
function createShipment(): void {
  const lines = (workspace.value?.boxes ?? []).flatMap((box) =>
    (box.lines ?? [])
      .filter((line) => selectedPackingItems.value[line.id])
      .map((line) => ({
        packingOrderId: box.id,
        packingItemId: line.id,
        quantity: shipmentQuantity.value[line.id] ?? '',
      })),
  )
  if (
    !canManage.value ||
    lines.length === 0 ||
    lines.some((line) => !decimalPattern.test(line.quantity) || line.quantity === '0.000000')
  ) {
    error.value = '请逐行选择包装明细并输入大于零的 6 位小数'
    return
  }
  void mutate({
    name: 'createShipment',
    payload: {
      salesOrderId: orderId.value,
      lines: lines.map((line) => ({ ...line, quantity: line.quantity as DecimalString })),
    },
  })
}
function approval(item: Shipment, name: 'approve' | 'requestApproval'): void {
  void mutate({ name, shipmentId: item.id, expectedVersion: item.version })
}
function progress(item: Shipment, name: 'dispatch' | 'sign'): void {
  const lines = item.lines.map((line) => ({
    shipmentLineId: line.id,
    quantity: progressQuantity.value[line.id] ?? '',
  }))
  if (lines.length === 0 || lines.some((line) => !decimalPattern.test(line.quantity))) {
    error.value = '请为每条发运明细输入 6 位小数（未处理行填 0.000000）'
    return
  }
  void mutate({
    name,
    shipmentId: item.id,
    payload: {
      expectedVersion: item.version,
      lines: lines.map((line) => ({ ...line, quantity: line.quantity as DecimalString })),
    },
  })
}

function createAfterSales(): void {
  const source = eligibleAfterSalesLines.value.find(
    (item) => item.line.id === afterSalesSourceId.value,
  )
  const reason = afterSalesReason.value.trim().toUpperCase()
  const feedback = customerFeedback.value.trim()
  if (
    !canAfterSales.value ||
    !source ||
    !decimalPattern.test(afterSalesQuantity.value) ||
    afterSalesQuantity.value === '0.000000' ||
    !/^[A-Z0-9][A-Z0-9._:-]{0,119}$/.test(reason) ||
    feedback.length < 1 ||
    feedback.length > 500
  ) {
    error.value = '请选择已签收原明细，并填写合法数量、原因代码和客户反馈'
    return
  }
  void mutate({
    name: 'createAfterSales',
    payload: {
      originalShipmentId: source.shipment.id,
      originalPackingOrderId: source.line.packingOrderId,
      originalPackingItemId: source.line.packingItemId,
      quantity: afterSalesQuantity.value as DecimalString,
      reasonCode: reason,
      customerFeedback: feedback,
    },
  })
}

watch(
  () => [auth.profile?.tenantId, auth.profile?.userId, auth.generation] as const,
  () => {
    ++sequence
    workspace.value = null
    flightStore.setScope(currentScope())
    flightStore.activate(owner)
  },
  { flush: 'sync' },
)
watch(
  orderId,
  () => {
    void load(
      recoveredFlight?.sourceId === orderId.value &&
        recoveredFlight.status === 'CONFIRMED_PENDING_REFRESH'
        ? recoveredFlight
        : null,
    )
  },
  { immediate: true },
)
onUnmounted(() => {
  active = false
  ++sequence
  flightStore.releaseRefresh(owner)
  flightStore.deactivate(owner)
})
</script>

<template>
  <main class="shipment-workspace">
    <header>
      <div>
        <p>SHIPMENT CONTROL / 包装发运控制</p>
        <h1>包装与发运工作台</h1>
      </div>
      <span class="order-chip">订单 {{ orderId }}</span>
    </header>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon role="alert" />
    <el-alert v-if="flight" type="warning" :closable="false" show-icon role="status">
      <span>{{
        flight.status === 'OUTCOME_UNKNOWN'
          ? '请求结果待确认，请保留原幂等请求'
          : '发运请求处理中，正在同步权威事实'
      }}</span>
      <el-button v-if="flight.status === 'OUTCOME_UNKNOWN'" @click="retryOutcomeUnknown">
        用原请求重试确认
      </el-button>
    </el-alert>
    <section v-if="workspace" class="facts" aria-label="包装数量守恒">
      <strong>质量合格 {{ workspace.qualityPassedQuantity }}</strong
      ><strong>已装箱 {{ workspace.packedQuantity }}</strong
      ><strong>可包装 {{ workspace.packableQuantity }}</strong>
    </section>
    <section v-if="workspace" class="observation">
      <span>观察期基准：{{ workspace.observationBaseline?.slice(0, 10) || '待全部签收' }}</span
      ><span
        >观察期截止：{{
          workspace.observationDeadline?.slice(0, 10) || '租户策略缺失/待重新计时'
        }}</span
      >
    </section>
    <section v-if="canManage && workspace" class="forms">
      <el-form @submit.prevent="pack">
        <h2>质量合格品装箱</h2>
        <label>箱号<el-input v-model="boxNo" maxlength="80" /></label>
        <label>质检批次 ID<el-input v-model="qualityInspectionId" maxlength="64" /></label>
        <label
          >装箱数量
          <el-input v-model="packingQuantity" inputmode="decimal" placeholder="0.000000" />
        </label>
        <el-button type="primary" native-type="submit" :disabled="!!flight">确认装箱</el-button>
      </el-form>
      <el-form data-testid="create-shipment-form" @submit.prevent="createShipment">
        <h2>创建发运单</h2>
        <fieldset v-for="box in workspace.boxes" :key="box.id">
          <legend>{{ box.boxNo }}</legend>
          <label v-for="line in box.lines ?? []" :key="line.id" class="line-input">
            <el-checkbox
              :model-value="selectedPackingItems[line.id] ?? false"
              :data-testid="`shipment-select-${line.id}`"
              :aria-label="`选择 SKU ${line.skuId}`"
              @update:model-value="selectedPackingItems[line.id] = Boolean($event)"
            />
            <span>SKU {{ line.skuId }} / 可选 {{ line.quantity }}</span>
            <el-input
              v-model="shipmentQuantity[line.id]"
              :disabled="!selectedPackingItems[line.id]"
              inputmode="decimal"
              placeholder="0.000000"
              :data-testid="`shipment-quantity-${line.id}`"
            />
          </label>
        </fieldset>
        <el-button
          data-testid="create-shipment"
          type="primary"
          native-type="submit"
          :disabled="!!flight"
        >
          创建发运单
        </el-button>
      </el-form>
    </section>
    <section v-if="canAfterSales && workspace" class="after-sales-panel">
      <el-form data-testid="after-sales-create-form" @submit.prevent="createAfterSales">
        <h2>登记客户反馈与退货</h2>
        <label
          >已签收原发运明细<SelectField
            v-model="afterSalesSourceId"
            data-testid="after-sales-source"
            placeholder="请选择"
            :options="
              eligibleAfterSalesLines.map((source) => ({
                value: source.line.id,
                label: `SKU ${source.line.skuId} / 已签收 ${source.line.signedQuantity}`,
              }))
            "
        /></label>
        <label
          >退货数量
          <el-input
            v-model="afterSalesQuantity"
            data-testid="after-sales-quantity"
            inputmode="decimal"
            placeholder="0.000000"
          />
        </label>
        <label
          >原因代码
          <el-input v-model="afterSalesReason" data-testid="after-sales-reason" maxlength="120" />
        </label>
        <label
          >客户反馈
          <el-input
            v-model="customerFeedback"
            type="textarea"
            data-testid="after-sales-feedback"
            maxlength="500"
          />
        </label>
        <el-button
          data-testid="create-after-sales"
          type="primary"
          native-type="submit"
          :disabled="!!flight"
        >
          创建售后任务
        </el-button>
      </el-form>
    </section>
    <section v-if="workspace" class="after-sales-list">
      <h2>待处理售后</h2>
      <p v-if="workspace.afterSalesCasesHasNext" class="bounded-note">
        共 {{ workspace.afterSalesCasesTotal }} 条，仅显示按创建时间排序的前 100 条
      </p>
      <p v-if="!(workspace.afterSalesCases ?? []).length">暂无待处理售后</p>
      <RouterLink
        v-for="item in (workspace.afterSalesCases ?? []).filter(
          (value) => value.status !== 'COMPLETED',
        )"
        :key="item.id"
        :to="`/after-sales/${item.id}`"
      >
        {{ item.reasonCode }} · {{ item.status }} · {{ item.quantity }}
      </RouterLink>
    </section>
    <section v-if="workspace" class="grid">
      <p v-if="workspace.boxesHasNext" class="bounded-note">
        共 {{ workspace.boxesTotal }} 个包装箱，仅显示前 100 个
      </p>
      <article v-for="box in workspace.boxes" :key="box.id">
        <small>包装箱</small>
        <h2>{{ box.boxNo }}</h2>
        <p>装箱数量 {{ box.totalQuantity }}</p>
      </article>
    </section>
    <section v-if="workspace?.shipments.length" class="shipments">
      <p v-if="workspace.shipmentsHasNext" class="bounded-note">
        共 {{ workspace.shipmentsTotal }} 张发运单，仅显示前 100 张
      </p>
      <article v-for="item in workspace.shipments" :key="item.id">
        <div>
          <small>{{ item.status }}</small>
          <h2>发运单 {{ item.id }}</h2>
          <p>申请人 {{ item.requesterId }}</p>
          <p>审批人 {{ item.approverId || '待审批' }}</p>
        </div>
        <div v-for="line in item.lines" :key="line.id" class="progress">
          <span>发运 {{ line.dispatchedQuantity }} / {{ line.plannedQuantity }}</span
          ><span>签收 {{ line.signedQuantity }} / {{ line.plannedQuantity }}</span>
          <label
            v-if="
              canManage &&
              ['APPROVED', 'PARTIALLY_DISPATCHED', 'DISPATCHED', 'PARTIALLY_SIGNED'].includes(
                item.status,
              )
            "
            >本次数量
            <el-input
              v-model="progressQuantity[line.id]"
              inputmode="decimal"
              placeholder="0.000000"
              :data-testid="`progress-${line.id}`"
            />
          </label>
        </div>
        <div class="actions">
          <el-button
            v-if="canManage && item.status === 'DRAFT'"
            type="primary"
            :disabled="!!flight"
            :data-testid="`request-shipment-${item.id}`"
            @click="approval(item, 'requestApproval')"
          >
            申请发运审批
          </el-button>
          <el-button
            v-if="
              canApprove &&
              item.status === 'PENDING_APPROVAL' &&
              item.requesterId !== auth.profile?.userId
            "
            type="primary"
            :disabled="!!flight"
            :data-testid="`approve-${item.id}`"
            @click="approval(item, 'approve')"
          >
            审批通过
          </el-button>
          <p
            v-else-if="
              canApprove &&
              item.status === 'PENDING_APPROVAL' &&
              item.requesterId === auth.profile?.userId
            "
            :data-testid="`self-approval-blocked-${item.id}`"
            class="duty-note"
          >
            申请人与审批人必须分离，请由其他审批人处理。
          </p>
          <template
            v-if="
              canManage &&
              ['APPROVED', 'PARTIALLY_DISPATCHED', 'DISPATCHED', 'PARTIALLY_SIGNED'].includes(
                item.status,
              )
            "
          >
            <el-button
              v-if="['APPROVED', 'PARTIALLY_DISPATCHED'].includes(item.status)"
              type="primary"
              :disabled="!!flight"
              :data-testid="`dispatch-${item.id}`"
              @click="progress(item, 'dispatch')"
            >
              登记发运
            </el-button>
            <el-button
              v-if="['DISPATCHED', 'PARTIALLY_SIGNED'].includes(item.status)"
              type="primary"
              :disabled="!!flight"
              :data-testid="`sign-${item.id}`"
              @click="progress(item, 'sign')"
            >
              登记签收
            </el-button>
          </template>
        </div>
      </article>
    </section>
    <p v-else-if="!loading" class="empty">暂无包装或发运事实</p>
  </main>
</template>

<style scoped>
.shipment-workspace {
  padding: 28px;
  color: #17202a;
  background: #f4f1e8;
  min-height: 100%;
}
header {
  display: flex;
  justify-content: space-between;
  align-items: end;
  border-bottom: 3px solid #17202a;
  padding-bottom: 16px;
}
header p,
small {
  font: 700 12px monospace;
  letter-spacing: 0.08em;
  color: #6d5d45;
}
h1 {
  margin: 4px 0;
  font-size: 30px;
}
.order-chip,
.pending,
.alert {
  padding: 10px 14px;
  border: 1px solid #17202a;
  background: #fff;
}
.alert {
  border-color: #a4312f;
  color: #8b2422;
}
.facts,
.observation,
.forms,
.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-top: 18px;
}
.facts strong,
.observation span,
article,
form {
  background: #fff;
  border: 1px solid #b8ae9a;
  padding: 16px;
}
.forms {
  grid-template-columns: 1fr 1fr;
}
form label,
.actions label {
  display: grid;
  gap: 4px;
  margin: 8px 0;
}
.shipments article {
  display: grid;
  grid-template-columns: 1.3fr 1fr 1fr;
  gap: 16px;
  margin-top: 14px;
}
.progress {
  display: grid;
  align-content: center;
  gap: 10px;
}
.actions {
  display: grid;
  align-content: center;
  gap: 8px;
}
.empty {
  padding: 40px;
  text-align: center;
  color: #6d5d45;
}
@media (max-width: 850px) {
  .facts,
  .observation,
  .forms,
  .grid,
  .shipments article {
    grid-template-columns: 1fr;
  }
  header {
    align-items: start;
    gap: 12px;
    flex-direction: column;
  }
}
</style>
