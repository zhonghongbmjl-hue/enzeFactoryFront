<script setup lang="ts">
import SelectField from '@/components/form/SelectField.vue'
import { computed, onUnmounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { qualityApi } from '@/api/quality'
import { createIdempotencyAttempt } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import type {
  InspectionMethod,
  OrderQualityFacts,
  QualityAggregate,
  ReworkCompletionInput,
} from '@/types/quality'
import {
  useQualityMutationFlight,
  type QualityMutationFlight,
  type QualityMutationName,
  type QualityMutationRequest,
  type QualityMutationScope,
} from './qualityMutationFlight'

const salesOrderId = ref('')
const orderFacts = ref<OrderQualityFacts | null>(null)
const selectedWorkOrderId = ref('')
const facts = ref<QualityAggregate | null>(null)
const loading = ref(false)
const errorMessage = ref('')
let loadSequence = 0
let componentActive = true

type IdempotencyAttempt = ReturnType<typeof createIdempotencyAttempt>

const trimQuantity = ref('')
const submittedQuantity = ref('')
const passedQuantity = ref('')
const failedQuantity = ref('')
const inspectionMethod = ref<'SAMPLING' | 'FULL'>('SAMPLING')
const defectCode = ref('')
const disposition = ref('')
const selectedReworkId = ref('')
const reworkPassedQuantity = ref('')
const reworkFailedQuantity = ref('')
const reworkDisposition = ref('')
const legacyBridgeMethod = ref<'SAMPLING' | 'FULL'>('SAMPLING')

const trimBusy = ref(false)
const inspectionBusy = ref(false)
const reworkBusy = ref(false)
const legacyBridgeBusy = ref(false)
const trimAttempt = createIdempotencyAttempt()
const inspectionAttempt = createIdempotencyAttempt()
const reworkAttempt = createIdempotencyAttempt()
const legacyBridgeAttempt = createIdempotencyAttempt()
const auth = useAuthStore()
const flightStore = useQualityMutationFlight()
const componentOwner = Symbol('quality-workspace')
flightStore.activate(componentOwner)
function currentMutationScope(): QualityMutationScope | null {
  const profile = auth.profile
  return profile
    ? {
        tenantId: profile.tenantId,
        userId: profile.userId,
        authGeneration: auth.generation,
      }
    : null
}
const initialMutationScope = currentMutationScope()
flightStore.setScope(initialMutationScope)
const recoveredFlight = initialMutationScope
  ? flightStore.syncFromStorage(initialMutationScope, attemptFor)
  : null
const mutationFlight = flightStore.flight
const mutationBusy = computed(() => mutationFlight.value !== null)
const confirmationRetryBusy = ref(false)
const refreshFailure = ref(false)
const refreshInProgressKey = ref('')
if (recoveredFlight) salesOrderId.value = recoveredFlight.sourceSalesOrderId

const pendingReworks = computed(
  () => facts.value?.reworkOrders.filter((item) => item.status === 'PENDING') ?? [],
)
const selectedRework = computed(() =>
  pendingReworks.value.find((item) => item.id === selectedReworkId.value),
)
const legacyBridgeRequired = computed(
  () =>
    selectedRework.value?.inspectionMethod === 'LEGACY_UNSPECIFIED' &&
    !selectedRework.value.legacyReworkBridgeId,
)
const workOrderOptions = computed(() =>
  (orderFacts.value?.items ?? []).flatMap((item) =>
    item.workOrders.map((workOrder) => ({ ...workOrder, skuId: item.skuId })),
  ),
)

function methodLabel(method: InspectionMethod): string {
  if (method === 'SAMPLING') return '抽检'
  if (method === 'FULL') return '全检'
  return '历史未记录'
}

function attemptFor(name: QualityMutationName): IdempotencyAttempt {
  if (name === 'trimming') return trimAttempt
  if (name === 'inspection') return inspectionAttempt
  if (name === 'rework') return reworkAttempt
  return legacyBridgeAttempt
}

function pendingSourceMessage(flight: QualityMutationFlight, prefix: string): string {
  return `${prefix} · 来源订单 ${flight.sourceSalesOrderId} · 来源工单 ${flight.sourceWorkOrderId}${
    flight.resultId ? ` · 结果 ${flight.resultId}` : ''
  }`
}

function successText(name: QualityMutationName, synchronized: boolean): string {
  if (name === 'trimming') return synchronized ? '后整记录已同步' : '后整记录已入账'
  if (name === 'inspection') return synchronized ? '成品质检批次已同步' : '成品质检批次已冻结'
  if (name === 'legacyBridge') return synchronized ? '历史检验方式已同步' : '历史检验方式已补录'
  return synchronized ? '返工回检批次已同步' : '返工回检批次已生成'
}

const syncMessage = computed(() => {
  const flight = mutationFlight.value
  if (!flight) return ''
  if (flight.status === 'IN_FLIGHT') return pendingSourceMessage(flight, '请求处理中，结果待确认')
  if (flight.status === 'OUTCOME_UNKNOWN')
    return pendingSourceMessage(flight, '结果待确认，请用原请求重试确认')
  return pendingSourceMessage(
    flight,
    refreshFailure.value ? '已入账，刷新失败/待同步' : '已入账，正在读取权威质量事实',
  )
})

function beginMutation(
  request: QualityMutationRequest,
  attempt: IdempotencyAttempt,
  fingerprint: unknown,
): QualityMutationFlight | null {
  if (mutationFlight.value || !orderFacts.value || !facts.value) return null
  const flight = flightStore.begin(componentOwner, {
    sourceSalesOrderId: orderFacts.value.salesOrderId,
    sourceWorkOrderId: facts.value.workOrderId,
    generation: ++loadSequence,
    request,
    attempt,
    key: attempt.keyFor(fingerprint),
  })
  if (!flight) ElMessage.error('无法安全保存本次请求，未向服务器提交')
  return flight
}

function isCurrentFlight(flight: QualityMutationFlight): boolean {
  const current = mutationFlight.value
  return (
    componentActive &&
    current?.key === flight.key &&
    current.sourceSalesOrderId === flight.sourceSalesOrderId &&
    current.sourceWorkOrderId === flight.sourceWorkOrderId
  )
}

function recordMutationFailure(flight: QualityMutationFlight, error: unknown): void {
  if (flight.attempt.failed(error)) {
    if (mutationFlight.value?.status === 'CONFIRMED_PENDING_REFRESH') return
    flightStore.clear(flight)
    if (componentActive) ElMessage.error(error instanceof Error ? error.message : '质量操作失败')
  } else {
    flightStore.markOutcomeUnknown(flight)
    if (componentActive) ElMessage.warning('请求结果未知，请用原请求和幂等键重试确认')
  }
}

function clearReadableFacts(): void {
  orderFacts.value = null
  facts.value = null
  selectedWorkOrderId.value = ''
  selectedReworkId.value = ''
}

async function loadFacts(): Promise<boolean> {
  const requested = salesOrderId.value.trim()
  if (!requested || mutationBusy.value) return false
  return readFacts(requested)
}

async function readFacts(
  requested: string,
  preferredWorkOrderId = '',
  flight: QualityMutationFlight | null = null,
): Promise<boolean> {
  const sequence = ++loadSequence
  if (flight) salesOrderId.value = flight.sourceSalesOrderId
  clearReadableFacts()
  loading.value = true
  errorMessage.value = ''
  try {
    const response = await qualityApi.aggregateOrder(requested)
    if (!isCurrentRead(sequence, requested, flight)) return false
    orderFacts.value = response
    const available = response.items.flatMap((item) => item.workOrders)
    if (flight && !available.some((item) => item.workOrderId === flight.sourceWorkOrderId)) {
      throw new Error('待同步源工单已不在订单质量事实中')
    }
    selectedWorkOrderId.value = available.some((item) => item.workOrderId === preferredWorkOrderId)
      ? preferredWorkOrderId
      : (available[0]?.workOrderId ?? '')
    const selected = selectedWorkOrderId.value
    const detail = selected ? await qualityApi.aggregate(selected) : null
    if (!isCurrentRead(sequence, requested, flight)) return false
    if (flight) salesOrderId.value = flight.sourceSalesOrderId
    facts.value = detail
    if (!pendingReworks.value.some((item) => item.id === selectedReworkId.value)) {
      selectedReworkId.value = pendingReworks.value[0]?.id ?? ''
    }
    return true
  } catch (error) {
    if (isCurrentRead(sequence, requested, flight)) {
      facts.value = null
      errorMessage.value = error instanceof Error ? error.message : '质量事实加载失败'
    }
    return false
  } finally {
    if (isCurrentRead(sequence, requested, flight)) loading.value = false
  }
}

function isCurrentRead(
  sequence: number,
  requested: string,
  flight: QualityMutationFlight | null,
): boolean {
  if (!componentActive || sequence !== loadSequence) return false
  if (flight) return isCurrentFlight(flight) && requested === flight.sourceSalesOrderId
  return requested === salesOrderId.value.trim()
}

async function selectWorkOrder(): Promise<void> {
  const requested = salesOrderId.value.trim()
  const selected = selectedWorkOrderId.value
  if (!requested || !selected || mutationBusy.value) return
  const sequence = ++loadSequence
  facts.value = null
  selectedReworkId.value = ''
  loading.value = true
  errorMessage.value = ''
  try {
    const response = await qualityApi.aggregate(selected)
    if (
      sequence === loadSequence &&
      requested === salesOrderId.value.trim() &&
      selected === selectedWorkOrderId.value
    )
      facts.value = response
  } catch (error) {
    if (sequence === loadSequence) {
      facts.value = null
      errorMessage.value = error instanceof Error ? error.message : '工单质量事实加载失败'
    }
  } finally {
    if (sequence === loadSequence) loading.value = false
  }
}

async function loadHistoryPage(page: number): Promise<void> {
  const requested = salesOrderId.value.trim()
  const selected = selectedWorkOrderId.value
  if (!requested || !selected || mutationBusy.value || page < 0) return
  const sequence = ++loadSequence
  loading.value = true
  errorMessage.value = ''
  try {
    const response = await qualityApi.aggregate(selected, page, 50)
    if (
      sequence === loadSequence &&
      requested === salesOrderId.value.trim() &&
      selected === selectedWorkOrderId.value
    )
      facts.value = response
  } catch (error) {
    if (sequence === loadSequence) {
      facts.value = null
      errorMessage.value = error instanceof Error ? error.message : '质量历史分页加载失败'
    }
  } finally {
    if (sequence === loadSequence) loading.value = false
  }
}

async function confirmMutationRefresh(flight: QualityMutationFlight): Promise<void> {
  if (flight.status !== 'CONFIRMED_PENDING_REFRESH' || refreshInProgressKey.value === flight.key)
    return
  if (!flightStore.claimRefresh(componentOwner, flight)) return
  refreshInProgressKey.value = flight.key
  refreshFailure.value = false
  const refreshed = await readFacts(flight.sourceSalesOrderId, flight.sourceWorkOrderId, flight)
  flightStore.releaseRefresh(componentOwner)
  refreshInProgressKey.value = ''
  if (!isCurrentFlight(flight)) return
  if (!refreshed) {
    refreshFailure.value = true
    ElMessage.warning('业务已确定入账，等待质量事实同步')
    return
  }
  flight.attempt.succeeded()
  flightStore.clear(flight)
  refreshFailure.value = false
  ElMessage.success(successText(flight.request?.name ?? 'trimming', true))
}

async function retryQualityRefresh(): Promise<void> {
  const pending = mutationFlight.value
  if (!pending || pending.status !== 'CONFIRMED_PENDING_REFRESH' || loading.value) return
  await confirmMutationRefresh(pending)
}

async function executeMutation(flight: QualityMutationFlight): Promise<{ id?: string }> {
  const request = flight.request
  if (!request) throw new Error('原请求载荷不可用，禁止重放')
  if (request.name === 'trimming') return qualityApi.trim(request.payload, flight.key)
  if (request.name === 'inspection') return qualityApi.inspect(request.payload, flight.key)
  if (request.name === 'rework')
    return qualityApi.completeRework(request.reworkId, request.payload, flight.key)
  return qualityApi.bridgeLegacyRework(request.reworkId, request.payload, flight.key)
}

async function retryQualityMutation(): Promise<void> {
  const flight = mutationFlight.value
  if (
    !flight ||
    flight.status === 'CONFIRMED_PENDING_REFRESH' ||
    confirmationRetryBusy.value ||
    !flight.request
  )
    return
  confirmationRetryBusy.value = true
  try {
    const result = await executeMutation(flight)
    flightStore.markConfirmed(flight, result.id)
  } catch (error) {
    recordMutationFailure(flight, error)
  } finally {
    confirmationRetryBusy.value = false
  }
}

async function submitTrimming(): Promise<void> {
  if (trimBusy.value || mutationBusy.value || !facts.value || !orderFacts.value) return
  const payload = { workOrderId: facts.value.workOrderId, quantity: trimQuantity.value }
  const flight = beginMutation({ name: 'trimming', payload }, trimAttempt, payload)
  if (!flight) return
  trimBusy.value = true
  try {
    const result = await executeMutation(flight)
    flightStore.markConfirmed(flight, result.id)
  } catch (error) {
    recordMutationFailure(flight, error)
  } finally {
    if (componentActive) trimBusy.value = false
  }
}

async function submitInspection(): Promise<void> {
  if (inspectionBusy.value || mutationBusy.value || !facts.value || !orderFacts.value) return
  const normalizedDefectCode = defectCode.value.trim().toUpperCase()
  const payload = {
    workOrderId: facts.value.workOrderId,
    inspectionMethod: inspectionMethod.value,
    submittedQuantity: submittedQuantity.value,
    passedQuantity: passedQuantity.value,
    failedQuantity: failedQuantity.value,
    ...(normalizedDefectCode ? { defectCode: normalizedDefectCode } : {}),
    disposition: disposition.value,
  }
  const flight = beginMutation({ name: 'inspection', payload }, inspectionAttempt, payload)
  if (!flight) return
  inspectionBusy.value = true
  try {
    const result = await executeMutation(flight)
    flightStore.markConfirmed(flight, result.id)
  } catch (error) {
    recordMutationFailure(flight, error)
  } finally {
    if (componentActive) inspectionBusy.value = false
  }
}

async function completeRework(): Promise<void> {
  if (
    reworkBusy.value ||
    mutationBusy.value ||
    !selectedRework.value ||
    legacyBridgeRequired.value ||
    !facts.value ||
    !orderFacts.value
  )
    return
  const reworkId = selectedRework.value.id
  const payload: ReworkCompletionInput = {
    passedQuantity: reworkPassedQuantity.value,
    failedQuantity: reworkFailedQuantity.value,
    disposition: reworkDisposition.value,
  }
  const fingerprint = { reworkId, ...payload }
  const flight = beginMutation({ name: 'rework', reworkId, payload }, reworkAttempt, fingerprint)
  if (!flight) return
  reworkBusy.value = true
  try {
    const result = await executeMutation(flight)
    flightStore.markConfirmed(flight, result.id)
  } catch (error) {
    recordMutationFailure(flight, error)
  } finally {
    if (componentActive) reworkBusy.value = false
  }
}

async function bridgeLegacyRework(): Promise<void> {
  if (
    legacyBridgeBusy.value ||
    mutationBusy.value ||
    !selectedRework.value ||
    !legacyBridgeRequired.value ||
    !facts.value ||
    !orderFacts.value
  )
    return
  const reworkId = selectedRework.value.id
  const payload = { selectedMethod: legacyBridgeMethod.value }
  const fingerprint = { reworkId, ...payload }
  const flight = beginMutation(
    { name: 'legacyBridge', reworkId, payload },
    legacyBridgeAttempt,
    fingerprint,
  )
  if (!flight) return
  legacyBridgeBusy.value = true
  try {
    const result = await executeMutation(flight)
    flightStore.markConfirmed(flight, result.id)
  } catch (error) {
    recordMutationFailure(flight, error)
  } finally {
    if (componentActive) legacyBridgeBusy.value = false
  }
}

watch(
  mutationFlight,
  (flight) => {
    if (!flight) return
    salesOrderId.value = flight.sourceSalesOrderId
    if (flight.status === 'CONFIRMED_PENDING_REFRESH') void confirmMutationRefresh(flight)
  },
  { immediate: true },
)

watch(
  () => [auth.profile?.tenantId, auth.profile?.userId, auth.generation] as const,
  () => {
    ++loadSequence
    clearReadableFacts()
    salesOrderId.value = ''
    flightStore.setScope(currentMutationScope())
    flightStore.activate(componentOwner)
  },
  { flush: 'sync' },
)

onUnmounted(() => {
  componentActive = false
  flightStore.releaseRefresh(componentOwner)
  flightStore.deactivate(componentOwner)
  ++loadSequence
})
</script>

<template>
  <section class="quality-workspace">
    <header class="quality-head">
      <div>
        <p class="kicker">QUALITY LEDGER / 成品质量闭环</p>
        <h1>品质工作台</h1>
      </div>
      <el-form data-testid="load-quality" class="lookup" @submit.prevent="loadFacts">
        <label
          >销售订单 ID
          <el-input
            v-model="salesOrderId"
            name="salesOrderId"
            autocomplete="off"
            :disabled="mutationBusy"
          />
        </label>
        <el-button type="primary" native-type="submit" :disabled="loading || mutationBusy">
          {{ loading ? '读取中…' : '读取质量事实' }}
        </el-button>
      </el-form>
    </header>
    <el-alert
      v-if="errorMessage"
      :title="errorMessage"
      type="error"
      :closable="false"
      show-icon
      role="alert"
    />
    <el-alert
      v-if="mutationFlight"
      class="sync-alert"
      data-testid="quality-sync-pending"
      type="warning"
      :closable="false"
      show-icon
      role="status"
    >
      <b>{{ syncMessage || '已入账，正在读取权威质量事实' }}</b>
      <el-button
        v-if="mutationFlight.status !== 'CONFIRMED_PENDING_REFRESH'"
        data-testid="retry-quality-mutation"
        :disabled="confirmationRetryBusy"
        @click="retryQualityMutation"
      >
        {{ confirmationRetryBusy ? '确认中…' : '用原请求重试确认' }}
      </el-button>
      <el-button
        v-else
        data-testid="retry-quality-refresh"
        :disabled="loading"
        @click="retryQualityRefresh"
      >
        {{ loading ? '同步中…' : '重试刷新' }}
      </el-button>
    </el-alert>

    <template v-if="orderFacts">
      <div class="fact-strip">
        <article>
          <span>订单需求</span><strong>{{ orderFacts.requiredQuantity }}</strong
          ><small>{{ orderFacts.orderNo }} · 主状态 {{ orderFacts.mainStatus }}</small>
        </article>
        <article>
          <span>生产完成账本</span><strong>{{ orderFacts.completedQuantity }}</strong
          ><small>Task 14 不可变完成事实</small>
        </article>
        <article>
          <span>已后整 / 已初检</span><strong>{{ orderFacts.trimmedQuantity }}</strong
          ><small>{{ orderFacts.initialInspectedQuantity }} 已进入正式检验</small>
        </article>
        <article class="accent">
          <span>正式通过 / 待返工</span><strong>{{ orderFacts.passedQuantity }}</strong
          ><small
            >{{ orderFacts.pendingReworkQuantity }} 待返工 ·
            {{ orderFacts.pendingDispositionQuantity }} 待处置审批；不推动订单主状态</small
          >
        </article>
      </div>

      <section class="order-tree" data-testid="order-quality-tree">
        <div class="ledger-title">
          <h2>SKU / 生产批次质量层级</h2>
          <span>{{ orderFacts.status }}</span>
        </div>
        <article v-for="item in orderFacts.items" :key="item.orderItemId" class="item-facts">
          <header>
            <code>SKU {{ item.skuId }}</code
            ><b>{{ item.status }}</b
            ><span>需求 {{ item.requiredQuantity }} · 通过 {{ item.passedQuantity }}</span>
          </header>
          <div
            v-for="workOrder in item.workOrders"
            :key="workOrder.workOrderId"
            class="batch-facts"
          >
            <code>{{ workOrder.workOrderId }}</code
            ><span>批次 {{ workOrder.productionBatchId }}</span
            ><span>完成 {{ workOrder.completedQuantity }}</span
            ><span>后整 {{ workOrder.trimmedQuantity }}</span
            ><span>初检 {{ workOrder.initialInspectedQuantity }}</span
            ><span>通过 {{ workOrder.passedQuantity }}</span
            ><span>返工 {{ workOrder.pendingReworkQuantity }}</span
            ><span>待处置 {{ workOrder.pendingDispositionQuantity }}</span
            ><span
              >方式 {{ workOrder.inspectionMethods.map(methodLabel).join(' / ') || '待检' }}</span
            >
          </div>
        </article>
      </section>

      <label class="work-order-picker"
        >操作工单<SelectField
          v-model="selectedWorkOrderId"
          name="selectedWorkOrderId"
          :disabled="mutationBusy"
          :options="
            workOrderOptions.map((item) => ({
              value: item.workOrderId,
              label: `${item.workOrderId} · SKU ${item.skuId} · 批次 ${item.productionBatchId}`,
            }))
          "
          @change="selectWorkOrder"
      /></label>

      <div v-if="facts" class="work-grid">
        <el-form data-testid="trim-form" class="action-card" @submit.prevent="submitTrimming">
          <div class="card-no">01</div>
          <h2>后整入账 · 待后整</h2>
          <p>来源：生产完成账本；可用 {{ facts.trimmingAvailableQuantity }}</p>
          <label
            >后整数量
            <el-input
              v-model="trimQuantity"
              name="trimQuantity"
              inputmode="decimal"
              placeholder="0.000000"
              required
              :disabled="mutationBusy"
            />
          </label>
          <el-button
            data-testid="trim-submit"
            type="primary"
            native-type="submit"
            :disabled="trimBusy || mutationBusy"
          >
            {{ trimBusy ? '处理中…' : '确认后整' }}
          </el-button>
        </el-form>

        <el-form
          data-testid="inspection-form"
          class="action-card"
          @submit.prevent="submitInspection"
        >
          <div class="card-no">02</div>
          <h2>唯一正式成品质检</h2>
          <p>类型固定 FINISHED_PRODUCT；方式选择抽检或全检；提交 = 通过 + 失败</p>
          <label
            >检验方式<SelectField
              v-model="inspectionMethod"
              name="inspectionMethod"
              aria-required="true"
              :disabled="mutationBusy"
              :options="[
                { label: '抽检', value: 'SAMPLING' },
                { label: '全检', value: 'FULL' },
              ]"
          /></label>
          <div class="quantity-row">
            <label
              >提交
              <el-input
                v-model="submittedQuantity"
                name="submittedQuantity"
                required
                :disabled="mutationBusy"
              />
            </label>
            <label
              >通过
              <el-input
                v-model="passedQuantity"
                name="passedQuantity"
                required
                :disabled="mutationBusy"
              />
            </label>
            <label
              >失败
              <el-input
                v-model="failedQuantity"
                name="failedQuantity"
                required
                :disabled="mutationBusy"
              />
            </label>
          </div>
          <label
            >缺陷代码<el-input v-model="defectCode" name="defectCode" :disabled="mutationBusy"
          /></label>
          <label
            >处置说明<el-input v-model="disposition" name="disposition" :disabled="mutationBusy"
          /></label>
          <el-button
            data-testid="inspection-submit"
            type="primary"
            native-type="submit"
            :disabled="inspectionBusy || mutationBusy"
          >
            {{ inspectionBusy ? '处理中…' : '冻结检验批次' }}
          </el-button>
        </el-form>

        <el-form data-testid="rework-form" class="action-card" @submit.prevent="completeRework">
          <div class="card-no">03</div>
          <h2>返工回检</h2>
          <p>只回到来源正式检验类型，并生成新版本。</p>
          <label
            >返工单
            <SelectField
              v-model="selectedReworkId"
              name="reworkOrderId"
              placeholder="暂无待办"
              :disabled="mutationBusy"
              :options="
                pendingReworks.map((item) => ({
                  label: `${item.id} · ${item.quantity}`,
                  value: item.id,
                }))
              "
            />
          </label>
          <p v-if="selectedRework" class="lineage">
            来源检验 {{ selectedRework.sourceInspectionId }} ·
            {{ methodLabel(selectedRework.inspectionMethod) }} · 链深
            {{ selectedRework.chainDepth }}
          </p>
          <div v-if="legacyBridgeRequired" class="legacy-bridge" data-testid="legacy-bridge">
            <b>历史方式待补录</b>
            <span>旧记录不能推断抽检/全检，须留下独立审计事实后才能回检。</span>
            <label
              >补录方式<SelectField
                v-model="legacyBridgeMethod"
                name="legacyBridgeMethod"
                :disabled="mutationBusy"
                :options="[
                  { label: '抽检', value: 'SAMPLING' },
                  { label: '全检', value: 'FULL' },
                ]"
            /></label>
            <el-button
              data-testid="legacy-bridge-submit"
              type="primary"
              :disabled="legacyBridgeBusy || mutationBusy"
              @click="bridgeLegacyRework"
            >
              {{ legacyBridgeBusy ? '补录中…' : '确认补录并留痕' }}
            </el-button>
          </div>
          <p v-else-if="selectedRework?.legacyReworkBridgeId" class="lineage">
            已补录 {{ methodLabel(selectedRework.remediatedInspectionMethod!) }} · 审计事实
            {{ selectedRework.legacyReworkBridgeId }}
          </p>
          <div class="quantity-row">
            <label
              >回检通过
              <el-input
                v-model="reworkPassedQuantity"
                name="reworkPassedQuantity"
                required
                :disabled="mutationBusy"
              />
            </label>
            <label
              >再次失败
              <el-input
                v-model="reworkFailedQuantity"
                name="reworkFailedQuantity"
                required
                :disabled="mutationBusy"
              />
            </label>
          </div>
          <label
            >处置说明
            <el-input
              v-model="reworkDisposition"
              name="reworkDisposition"
              :disabled="mutationBusy"
            />
          </label>
          <el-button
            data-testid="rework-submit"
            type="primary"
            native-type="submit"
            :disabled="reworkBusy || !selectedRework || legacyBridgeRequired || mutationBusy"
          >
            {{ reworkBusy ? '处理中…' : '完成并生成回检批次' }}
          </el-button>
        </el-form>
      </div>

      <section v-if="facts" class="ledger">
        <div class="ledger-title">
          <h2>不可变批次账</h2>
          <span>{{ facts.status }}</span>
        </div>
        <div v-for="inspection in facts.inspections" :key="inspection.id" class="ledger-row">
          <code>{{ inspection.id }}</code
          ><span>V{{ inspection.inspectionVersion }}</span
          ><span>{{ methodLabel(inspection.inspectionMethod) }}</span
          ><span>{{ inspection.result }}</span
          ><span>{{ inspection.passedQuantity }} / {{ inspection.failedQuantity }}</span
          ><small v-if="inspection.sourceInspectionId"
            >来源 {{ inspection.sourceInspectionId }}</small
          >
        </div>
        <div v-for="rework in facts.reworkOrders" :key="rework.id" class="ledger-row rework">
          <code>{{ rework.id }}</code
          ><span>{{ rework.status }}</span
          ><span>{{ rework.quantity }}</span
          ><small>来源检验 {{ rework.sourceInspectionId }}</small>
        </div>
        <div
          v-for="pending in facts.nonconformingDispositions"
          :key="pending.id"
          class="ledger-row rework"
          data-testid="pending-disposition"
        >
          <code>{{ pending.id }}</code
          ><span>待处置审批</span><span>{{ pending.quantity }}</span
          ><small
            >返工深度 {{ pending.chainDepth }} · 策略上限 {{ pending.maxReworkAttemptsSnapshot }} ·
            来源检验 {{ pending.sourceInspectionId }}</small
          >
        </div>
        <div class="ledger-title" data-testid="quality-history-page">
          <el-button
            :disabled="mutationBusy || loading || facts.historyPage.page === 0"
            @click="loadHistoryPage(facts.historyPage.page - 1)"
          >
            上一页
          </el-button>
          <span>第 {{ facts.historyPage.page + 1 }} 页 · 每页 {{ facts.historyPage.size }}</span>
          <el-button
            :disabled="mutationBusy || loading || !facts.historyPage.hasNext"
            @click="loadHistoryPage(facts.historyPage.page + 1)"
          >
            下一页
          </el-button>
        </div>
      </section>
    </template>
  </section>
</template>

<style scoped>
.quality-workspace {
  --ink: #18201d;
  --paper: #f4f0e8;
  --signal: #e05b35;
  color: var(--ink);
  max-width: 1480px;
  margin: auto;
}
.quality-head {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 24px;
  border-bottom: 2px solid var(--ink);
  padding-bottom: 22px;
}
.kicker {
  margin: 0 0 8px;
  color: #68726d;
  font: 700 11px/1.2 ui-monospace;
  letter-spacing: 0.16em;
}
.quality-head h1 {
  margin: 0;
  font-size: clamp(32px, 5vw, 60px);
  letter-spacing: -0.055em;
}
.lookup {
  display: flex;
  align-items: end;
  gap: 10px;
}
.lookup label,
.action-card label {
  display: grid;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
}
.lookup .el-input {
  min-width: min(300px, 100%);
}
.quality-workspace button {
  border: 0;
  background: var(--ink);
  color: white;
  padding: 11px 16px;
  font-weight: 800;
  cursor: pointer;
}
.quality-workspace button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.alert {
  background: #fff0ea;
  color: #9e351c;
  padding: 12px;
}
.sync-alert {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-top: 16px;
  padding: 14px;
  border: 1px solid #b56b25;
  background: #fff4dc;
  color: #7b4415;
}
.fact-strip {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  margin: 24px 0;
  border: 1px solid #b7bbb6;
}
.fact-strip article {
  display: grid;
  gap: 4px;
  padding: 18px;
  border-right: 1px solid #b7bbb6;
  background: #faf8f3;
}
.fact-strip article:last-child {
  border: 0;
}
.fact-strip span,
.fact-strip small {
  font-size: 11px;
  color: #68726d;
}
.fact-strip strong {
  font: 800 24px/1.2 ui-monospace;
}
.fact-strip .accent {
  background: var(--signal);
  color: white;
}
.fact-strip .accent span,
.fact-strip .accent small {
  color: #ffece5;
}
.work-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
.order-tree {
  margin: 24px 0;
  border-top: 2px solid var(--ink);
}
.item-facts {
  border-top: 1px solid #c8cac5;
  padding: 12px 0;
}
.item-facts header,
.batch-facts {
  display: grid;
  grid-template-columns: 2fr 0.7fr 1.3fr;
  gap: 12px;
  align-items: center;
}
.batch-facts {
  grid-template-columns: 1.5fr 1.5fr repeat(5, 0.7fr) 1fr;
  margin-top: 8px;
  padding: 10px;
  background: #faf8f3;
  font-size: 11px;
}
.work-order-picker {
  display: grid;
  gap: 6px;
  margin-bottom: 16px;
  font-size: 12px;
  font-weight: 800;
}
.action-card {
  position: relative;
  display: grid;
  align-content: start;
  gap: 13px;
  min-height: 380px;
  padding: 24px;
  border: 1px solid #c3c5c1;
  background: var(--paper);
}
.action-card h2 {
  margin: 0;
  font-size: 22px;
}
.action-card p {
  margin: 0;
  color: #626b66;
  font-size: 13px;
}
.card-no {
  position: absolute;
  right: 18px;
  top: 12px;
  color: #c9c7c0;
  font: 900 38px/1 ui-monospace;
}
.quantity-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.action-card:last-child .quantity-row {
  grid-template-columns: 1fr 1fr;
}
.lineage {
  border-left: 3px solid var(--signal);
  padding-left: 10px !important;
  color: var(--ink) !important;
}
.ledger {
  margin-top: 24px;
  border-top: 2px solid var(--ink);
}
.ledger-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.ledger-title span {
  font: 800 12px ui-monospace;
  color: var(--signal);
}
.ledger-row {
  display: grid;
  grid-template-columns: 2fr 0.5fr 0.7fr 0.7fr 1fr 1.5fr;
  gap: 12px;
  padding: 12px 0;
  border-top: 1px solid #d4d3cd;
  font-size: 12px;
}
.ledger-row.rework {
  background: #fbf1eb;
  padding-inline: 10px;
}
@media (max-width: 980px) {
  .quality-head {
    align-items: stretch;
    flex-direction: column;
  }
  .lookup {
    align-items: stretch;
    flex-direction: column;
  }
  .lookup input {
    min-width: 0;
  }
  .fact-strip {
    grid-template-columns: 1fr 1fr;
  }
  .work-grid {
    grid-template-columns: 1fr;
  }
  .item-facts header,
  .batch-facts {
    grid-template-columns: 1fr 1fr;
  }
  .fact-strip article {
    border-bottom: 1px solid #b7bbb6;
  }
  .quantity-row {
    grid-template-columns: 1fr;
  }
  .ledger-row {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
