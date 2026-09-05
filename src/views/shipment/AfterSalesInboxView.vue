<script setup lang="ts">
import SelectField from '@/components/form/SelectField.vue'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { shipmentApi } from '@/api/shipment'
import { createIdempotencyAttempt } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import type {
  AfterSalesCase,
  DecimalString,
  ExceptionCase,
  ExceptionCategory,
  ExceptionEvidenceType,
  Page,
} from '@/types/shipment'
import {
  useShipmentMutationFlight,
  type ShipmentMutationFlight,
  type ShipmentMutationRequest,
  type ShipmentMutationScope,
} from './shipmentMutationFlight'

const auth = useAuthStore()
const afterSalesPage = ref<Page<AfterSalesCase> | null>(null)
const exceptionPage = ref<Page<ExceptionCase> | null>(null)
const page = ref(0)
const size = 100
const exceptionPageNumber = ref(0)
const exceptionSize = 20
const error = ref('')
const loading = ref(false)
const orderId = ref('')
const category = ref<ExceptionCategory>('CUSTOMER_CLAIM')
const referenceNo = ref('')
const description = ref('')
const affectedQuantity = ref('')
const evidenceRefs = ref<Record<string, string>>({})
const attempt = createIdempotencyAttempt()
const flightStore = useShipmentMutationFlight()
const flight = flightStore.flight
const owner = Symbol('after-sales-inbox')
let active = true
let sequence = 0

const decimalPattern = /^(?:0|[1-9]\d{0,11})\.\d{6}$/
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const canManage = computed(() => auth.permissions.has('AFTER_SALES_MANAGE'))

function currentScope(): ShipmentMutationScope | null {
  return auth.profile
    ? {
        tenantId: auth.profile.tenantId,
        userId: auth.profile.userId,
        authGeneration: auth.generation,
      }
    : null
}
function invalidText(value: string, max: number): boolean {
  return (
    !value.trim() ||
    value.length > max ||
    Array.from(value).some((character) => {
      const code = character.codePointAt(0)
      return code !== undefined && (code <= 31 || code === 127)
    })
  )
}
function resolution(value: ExceptionCase): {
  resolutionCode: string
  evidenceType: ExceptionEvidenceType
} {
  if (value.category === 'ORDER_CHANGE')
    return { resolutionCode: 'CHANGE_APPLIED', evidenceType: 'ORDER_HISTORY' }
  if (value.category === 'REPLENISHMENT')
    return { resolutionCode: 'REPLENISHED', evidenceType: 'SHIPMENT' }
  if (value.category === 'CUSTOMER_EXCHANGE')
    return { resolutionCode: 'EXCHANGED', evidenceType: 'AFTER_SALES' }
  if (value.category === 'INVENTORY_ANOMALY')
    return { resolutionCode: 'INVENTORY_RECONCILED', evidenceType: 'INVENTORY_LEDGER' }
  return { resolutionCode: 'CLAIM_SETTLED', evidenceType: 'SETTLEMENT_REFERENCE' }
}

async function load(expected: ShipmentMutationFlight | null = null): Promise<boolean> {
  const token = ++sequence
  loading.value = true
  error.value = ''
  try {
    const [cases, exceptions] = await Promise.all([
      shipmentApi.listAfterSales({ page: page.value, size }),
      shipmentApi.listExceptionCases({
        status: 'OPEN',
        page: exceptionPageNumber.value,
        size: exceptionSize,
      }),
    ])
    if (!active || token !== sequence) return false
    afterSalesPage.value = cases
    exceptionPage.value = exceptions
    if (expected && flightStore.claimRefresh(owner, expected)) {
      expected.attempt.succeeded()
      flightStore.clear(expected)
      flightStore.releaseRefresh(owner)
    }
    return true
  } catch (reason) {
    if (active && token === sequence)
      error.value = reason instanceof Error ? reason.message : '读取售后待办失败'
    return false
  } finally {
    if (active && token === sequence) loading.value = false
  }
}

async function execute(value: ShipmentMutationFlight): Promise<void> {
  if (value.request.name === 'openExceptionCase')
    await shipmentApi.openExceptionCase(value.request.payload, value.key)
  else if (value.request.name === 'resolveExceptionCase')
    await shipmentApi.resolveExceptionCase(value.request.caseId, value.request.payload, value.key)
  else throw new Error('当前售后待办不能执行该请求')
}
async function mutate(sourceId: string, request: ShipmentMutationRequest): Promise<void> {
  const value = flightStore.begin(owner, {
    sourceId,
    request,
    attempt,
    key: attempt.keyFor(request),
  })
  if (!value) {
    error.value = flight.value ? '已有售后请求处理中' : '无法安全保存请求，未向服务器提交'
    return
  }
  try {
    await execute(value)
    if (!active || flight.value?.key !== value.key) return
    flightStore.markConfirmed(value)
    await load(flight.value as ShipmentMutationFlight)
  } catch (reason) {
    if (value.attempt.failed(reason)) flightStore.clear(value)
    else flightStore.markOutcomeUnknown(value)
    if (active) error.value = reason instanceof Error ? reason.message : '售后请求失败'
  }
}
async function retry(): Promise<void> {
  const value = flight.value as ShipmentMutationFlight | null
  if (!value || value.status !== 'OUTCOME_UNKNOWN') return
  try {
    await execute(value)
    if (!active || flight.value?.key !== value.key) return
    flightStore.markConfirmed(value)
    await load(flight.value as ShipmentMutationFlight)
  } catch (reason) {
    if (value.attempt.failed(reason)) flightStore.clear(value)
    else flightStore.markOutcomeUnknown(value)
    if (active) error.value = reason instanceof Error ? reason.message : '重试确认失败'
  }
}

function openException(): void {
  if (
    !canManage.value ||
    !uuidPattern.test(orderId.value) ||
    invalidText(referenceNo.value, 80) ||
    invalidText(description.value, 500) ||
    !decimalPattern.test(affectedQuantity.value) ||
    affectedQuantity.value === '0.000000'
  ) {
    error.value = '订单、编号、说明或数量格式无效（数量须为 6 位小数）'
    return
  }
  void mutate(orderId.value, {
    name: 'openExceptionCase',
    payload: {
      salesOrderId: orderId.value,
      category: category.value,
      referenceNo: referenceNo.value.trim(),
      description: description.value.trim(),
      affectedQuantity: affectedQuantity.value as DecimalString,
    },
  })
}
function resolveException(value: ExceptionCase): void {
  const evidenceRef = evidenceRefs.value[value.id]?.trim() ?? ''
  if (!canManage.value || invalidText(evidenceRef, 120)) {
    error.value = '请填写有效的解决证据编号'
    return
  }
  void mutate(value.id, {
    name: 'resolveExceptionCase',
    caseId: value.id,
    payload: { expectedVersion: value.version, ...resolution(value), evidenceRef },
  })
}
function changePage(next: number): void {
  if (loading.value || next < 0) return
  page.value = next
  void load()
}
function changeExceptionPage(next: number): void {
  if (loading.value || next < 0) return
  exceptionPageNumber.value = next
  void load()
}

flightStore.activate(owner)
const initialScope = currentScope()
flightStore.setScope(initialScope)
const recovered = initialScope ? flightStore.syncFromStorage(initialScope, attempt) : null
onMounted(() => void load(recovered?.status === 'CONFIRMED_PENDING_REFRESH' ? recovered : null))
watch(
  () => [auth.profile?.tenantId, auth.profile?.userId, auth.generation] as const,
  () => {
    ++sequence
    afterSalesPage.value = null
    exceptionPage.value = null
    page.value = 0
    exceptionPageNumber.value = 0
    flightStore.setScope(currentScope())
    flightStore.activate(owner)
    void load()
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
  <main class="after-sales-inbox">
    <header>
      <div>
        <p class="eyebrow">AFTER-SALES CONTROL / 售后控制台</p>
        <h1>全租户售后待办</h1>
        <p>客户反馈、退货、返工、复检、重装与补发均以后台事实为准。</p>
      </div>
      <el-button type="primary" :disabled="loading" @click="load()">权威刷新</el-button>
    </header>

    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon role="alert" />
    <el-alert v-if="flight" type="warning" :closable="false" show-icon role="status">
      <span>有一笔写操作正在确认，请勿重复提交。</span>
      <el-button
        v-if="flight.status === 'OUTCOME_UNKNOWN'"
        data-testid="after-sales-retry"
        @click="retry"
      >
        使用原幂等键重试
      </el-button>
    </el-alert>

    <section class="panel">
      <div class="section-title">
        <div>
          <p class="eyebrow">RETURN & REWORK</p>
          <h2>售后任务</h2>
        </div>
        <strong>共 {{ afterSalesPage?.total ?? 0 }} 条</strong>
      </div>
      <div v-if="afterSalesPage?.items.length" class="case-grid">
        <RouterLink
          v-for="item in afterSalesPage.items"
          :key="item.id"
          class="case-card"
          :to="`/after-sales/${item.id}`"
        >
          <b>{{ item.customerFeedback }}</b>
          <span>{{ item.status }} · {{ item.quantity }}</span>
          <small>订单 {{ item.salesOrderId }} / SKU {{ item.skuId }}</small>
        </RouterLink>
      </div>
      <p v-else class="empty">当前页没有售后任务。</p>
      <nav class="pager" aria-label="售后任务分页">
        <el-button
          :disabled="!afterSalesPage?.hasPrevious || loading"
          @click="changePage(page - 1)"
        >
          上一页
        </el-button>
        <span>第 {{ page + 1 }} 页</span>
        <el-button
          data-testid="after-sales-next-page"
          :disabled="!afterSalesPage?.hasNext || loading"
          @click="changePage(page + 1)"
        >
          下一页
        </el-button>
      </nav>
    </section>

    <section class="panel exception-panel">
      <div class="section-title">
        <div>
          <p class="eyebrow">AUTHORITATIVE CASES</p>
          <h2>订单异常与结清证据</h2>
        </div>
      </div>
      <form
        data-testid="exception-open-form"
        class="exception-form"
        @submit.prevent="openException"
      >
        <label
          >订单 ID<el-input v-model.trim="orderId" data-testid="exception-order-id" maxlength="36"
        /></label>
        <label
          >异常类别
          <SelectField
            v-model="category"
            aria-label="异常类别"
            :options="[
              { label: '订单变更', value: 'ORDER_CHANGE' },
              { label: '补货', value: 'REPLENISHMENT' },
              { label: '客户退换', value: 'CUSTOMER_EXCHANGE' },
              { label: '客户索赔', value: 'CUSTOMER_CLAIM' },
              { label: '库存异常', value: 'INVENTORY_ANOMALY' },
            ]"
          />
        </label>
        <label
          >业务编号<el-input v-model="referenceNo" data-testid="exception-reference" maxlength="80"
        /></label>
        <label
          >影响数量<el-input
            v-model="affectedQuantity"
            data-testid="exception-quantity"
            inputmode="decimal"
        /></label>
        <label class="wide"
          >异常说明<el-input
            v-model="description"
            type="textarea"
            data-testid="exception-description"
            maxlength="500"
          />
        </label>
        <el-button type="primary" native-type="submit" :disabled="!!flight || !canManage"
          >登记异常</el-button
        >
      </form>
      <div v-if="exceptionPage?.items.length" class="exception-list">
        <article v-for="item in exceptionPage.items" :key="item.id">
          <div>
            <b>{{ item.referenceNo }}</b
            ><span>{{ item.category }} · {{ item.affectedQuantity }}</span>
            <p>{{ item.description }}</p>
          </div>
          <label
            >解决证据编号
            <el-input
              v-model="evidenceRefs[item.id]"
              :data-testid="`evidence-${item.id}`"
              maxlength="120"
            />
          </label>
          <el-button
            type="primary"
            :data-testid="`resolve-${item.id}`"
            :disabled="!!flight || !canManage"
            @click="resolveException(item)"
          >
            校验证据并解决
          </el-button>
        </article>
      </div>
      <p v-else class="empty">没有开放的订单异常。</p>
      <nav class="pager" aria-label="订单异常分页">
        <el-button
          :disabled="!exceptionPage?.hasPrevious || loading"
          @click="changeExceptionPage(exceptionPageNumber - 1)"
        >
          上一页
        </el-button>
        <span>第 {{ exceptionPageNumber + 1 }} 页 / 共 {{ exceptionPage?.total ?? 0 }} 条</span>
        <el-button
          data-testid="exception-next-page"
          :disabled="!exceptionPage?.hasNext || loading"
          @click="changeExceptionPage(exceptionPageNumber + 1)"
        >
          下一页
        </el-button>
      </nav>
    </section>
  </main>
</template>

<style scoped>
.after-sales-inbox {
  display: grid;
  gap: 18px;
  color: #17202a;
}
header,
.section-title,
.pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
h1,
h2,
p {
  margin: 0;
}
.eyebrow {
  color: #8a5a24;
  font-size: 12px;
  letter-spacing: 0.12em;
}
.panel {
  border: 1px solid #c9b99f;
  background: #f8f4eb;
  padding: 18px;
}
.case-grid {
  display: grid;
  gap: 8px;
  margin: 14px 0;
}
.case-card {
  display: grid;
  gap: 5px;
  border-left: 4px solid #c56a18;
  background: #fff;
  color: inherit;
  padding: 12px;
  text-decoration: none;
}
.case-card span,
.case-card small,
article span {
  color: #675b4d;
}
.pager {
  justify-content: center;
}
.exception-form {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin: 14px 0;
}
label {
  display: grid;
  gap: 5px;
  font-size: 13px;
}
.wide {
  grid-column: 1 / -1;
}
.exception-list {
  display: grid;
  gap: 10px;
}
.exception-list article {
  display: grid;
  grid-template-columns: 1fr minmax(230px, 0.8fr) auto;
  align-items: end;
  gap: 12px;
  border-top: 1px solid #cabca6;
  padding-top: 12px;
}
.exception-list article div {
  display: grid;
  gap: 5px;
}
.alert,
.sync-alert {
  border-left: 4px solid #a63c2f;
  background: #fff1ed;
  padding: 12px;
}
.sync-alert {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.empty {
  padding: 24px;
  text-align: center;
  color: #675b4d;
}
@media (max-width: 900px) {
  header,
  .section-title,
  .exception-list article {
    align-items: stretch;
    flex-direction: column;
    grid-template-columns: 1fr;
  }
  .exception-form {
    grid-template-columns: 1fr;
  }
  .wide {
    grid-column: auto;
  }
}
</style>
