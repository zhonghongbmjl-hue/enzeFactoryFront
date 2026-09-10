<script setup lang="ts">
import SelectField from '@/components/form/SelectField.vue'
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { cuttingApi } from '@/api/cutting'
import { kittingApi } from '@/api/kitting'
import { inventoryApi } from '@/api/inventory'
import { salesOrderApi } from '@/api/orders'
import { createIdempotencyAttempt } from '@/api/http'
import type { CuttingOrder, KittingCheck, KittingRelease } from '@/types/cutting'
import type { InventoryLedger } from '@/types/inventory'
import type { SalesOrder, SalesOrderItem } from '@/types/order'
import { addDecimal, compareDecimal, decimalPercent, isPositiveDecimal } from '@/utils/decimal'

const CLOSED_ORDER_STATUSES = new Set(['DRAFT', 'CANCELLED', 'COMPLETED'])

const cuttingQuery = ref('')
const kittingQuery = ref('')
const cutting = ref<CuttingOrder>()
const kitting = ref<KittingCheck>()
const releases = ref<KittingRelease[]>([])
const releaseQuantity = ref('0')
const scheduleQuantities = ref<Record<string, string>>({})
const scheduleReferences = ref<Record<string, string>>({})
const pending = ref(false)
const failure = ref('')
const traceId = ref('')
const orders = ref<SalesOrder[]>([])
const issues = ref<Array<{ id: string; issueNo: string; batchNo: string }>>([])
const conservationOk = computed(
  () =>
    !cutting.value ||
    compareDecimal(
      cutting.value.inputQuantity,
      addDecimal(
        cutting.value.outputQuantity,
        cutting.value.lossQuantity,
        cutting.value.excessReturnQuantity,
      ),
    ) === 0,
)
const createForm = ref({
  cuttingNo: '',
  materialIssueId: '',
  orderItemId: '',
  skuId: '',
  productionBatch: '',
  sourceFabricLot: '',
  inputQuantity: '0',
})
const completeForm = ref({
  outputQuantity: '0',
  lossQuantity: '0',
  excessReturnQuantity: '0',
  returnNo: '',
})
const bundleLines = ref([{ bundleNo: '', quantity: '0' }])
const checkForm = ref({ orderItemId: '', skuId: '' })
const createAttempt = createIdempotencyAttempt()
const completeAttempt = createIdempotencyAttempt()
const releaseAttempt = createIdempotencyAttempt()
const scheduleAttempt = createIdempotencyAttempt()
const orderItems = computed(() => orders.value.flatMap((order) => order.items ?? []))
const orderItemOptions = computed(() =>
  orders.value.flatMap((order) =>
    (order.items ?? []).map((item) => ({
      label: orderItemLabel(order, item),
      value: item.id,
    })),
  ),
)
const skuOptions = computed(() => skuChoices(createForm.value.orderItemId))
const checkSkuOptions = computed(() => skuChoices(checkForm.value.orderItemId))
const issueOptions = computed(() =>
  issues.value.map((issue) => ({
    label: `${issue.issueNo} · ${issue.batchNo || '无批次'}`,
    value: issue.id,
  })),
)

function orderItemLabel(order: SalesOrder, item: SalesOrderItem): string {
  return `${order.orderNo} · ${item.color} / ${item.size} / ${item.fit}`
}

function skuLabel(item: SalesOrderItem): string {
  return `${item.color} / ${item.size} / ${item.fit}`
}

function skuChoices(orderItemId: string) {
  const scoped = orderItemId
    ? orderItems.value.filter((item) => item.id === orderItemId)
    : orderItems.value
  const seen = new Set<string>()
  return scoped
    .filter((item) => {
      if (seen.has(item.skuId)) return false
      seen.add(item.skuId)
      return true
    })
    .map((item) => ({
      label: skuLabel(item),
      value: item.skuId,
    }))
}

function findOrderItemMatch(
  orderItemId: string,
): { order: SalesOrder; item: SalesOrderItem } | undefined {
  for (const order of orders.value) {
    const item = (order.items ?? []).find((row) => row.id === orderItemId)
    if (item) return { order, item }
  }
  return undefined
}

function formatOrderItemId(orderItemId: string): string {
  const match = findOrderItemMatch(orderItemId)
  return match ? orderItemLabel(match.order, match.item) : orderItemId
}

function formatSkuId(skuId: string): string {
  const item = orderItems.value.find((row) => row.skuId === skuId)
  return item ? skuLabel(item) : skuId
}

function findOrderItem(orderItemId: string): SalesOrderItem | undefined {
  return findOrderItemMatch(orderItemId)?.item
}

function applyOrderItem(orderItemId: string): void {
  const item = findOrderItem(orderItemId)
  if (item) createForm.value.skuId = item.skuId
}

function onCheckOrderItemChange(orderItemId: string): void {
  const item = findOrderItem(orderItemId)
  checkForm.value.skuId = item?.skuId ?? ''
}

function fabricMaterialIds(order: SalesOrder, orderItemId: string): string[] {
  const fromRequirements = (order.requirements ?? [])
    .filter((row) => row.orderItemId === orderItemId && row.materialType === 'FABRIC')
    .map((row) => row.materialId)
  const fromBom = (order.bomSnapshots ?? [])
    .filter((row) => row.orderItemId === orderItemId)
    .flatMap((row) =>
      row.items.filter((item) => item.materialType === 'FABRIC').map((item) => item.materialId),
    )
  return [...new Set([...fromRequirements, ...fromBom])]
}

function issueChoicesFromLedgers(ledgers: InventoryLedger[]): Array<{
  id: string
  issueNo: string
  batchNo: string
}> {
  const unique = new Map<string, { id: string; issueNo: string; batchNo: string }>()
  for (const ledger of ledgers) {
    if (ledger.eventType !== 'MATERIAL_ISSUED' || !ledger.materialIssueId) continue
    if (unique.has(ledger.materialIssueId)) continue
    unique.set(ledger.materialIssueId, {
      id: ledger.materialIssueId,
      issueNo: ledger.businessReference || ledger.materialIssueId,
      batchNo: ledger.batchNo,
    })
  }
  return [...unique.values()]
}

async function loadIssues(orderItemId: string): Promise<void> {
  if (!orderItemId) {
    issues.value = []
    return
  }
  try {
    const match = findOrderItemMatch(orderItemId)
    if (!match) {
      issues.value = []
      return
    }
    let order = match.order
    if (!(order.requirements?.length || order.bomSnapshots?.length)) {
      order = await salesOrderApi.get(order.id)
    }
    const materialIds = fabricMaterialIds(order, orderItemId)
    if (!materialIds.length) {
      issues.value = []
      return
    }
    const ledgers = (await Promise.all(materialIds.map((id) => inventoryApi.ledgers(id)))).flat()
    issues.value = issueChoicesFromLedgers(ledgers)
  } catch (error) {
    issues.value = []
    report(error, '领料选项加载失败')
  }
}

async function onOrderItemChange(orderItemId: string): Promise<void> {
  applyOrderItem(orderItemId)
  createForm.value.materialIssueId = ''
  await loadIssues(orderItemId)
}

function onIssueChange(issueId: string): void {
  const issue = issues.value.find((item) => item.id === issueId)
  if (!issue) return
  if (issue.batchNo) createForm.value.sourceFabricLot = issue.batchNo
}

async function loadCuttingOptions(): Promise<void> {
  try {
    const orderPage = await salesOrderApi.list({ page: 0, size: 50 })
    orders.value = orderPage.content.filter((order) => !CLOSED_ORDER_STATUSES.has(order.status))
  } catch (error) {
    report(error, '裁剪选项加载失败')
  }
}

async function createCutting(): Promise<void> {
  if (pending.value || !isPositiveDecimal(createForm.value.inputQuantity)) return
  pending.value = true
  failure.value = ''
  const payload = { ...createForm.value }
  try {
    cutting.value = await cuttingApi.create(payload, createAttempt.keyFor(payload))
    createAttempt.succeeded()
    cuttingQuery.value = cutting.value.id
    ElMessage.success('裁剪任务已创建并锁定领布投入')
  } catch (error) {
    createAttempt.failed(error)
    report(error, '裁剪任务创建失败')
  } finally {
    pending.value = false
  }
}

async function completeCutting(): Promise<void> {
  if (!cutting.value || pending.value) return
  pending.value = true
  failure.value = ''
  const payload = {
    ...completeForm.value,
    ...(isPositiveDecimal(completeForm.value.excessReturnQuantity)
      ? { returnNo: completeForm.value.returnNo }
      : {}),
    bundles: bundleLines.value,
    version: cutting.value.version,
  }
  try {
    cutting.value = await cuttingApi.complete(
      cutting.value.id,
      payload,
      completeAttempt.keyFor({ id: cutting.value.id, ...payload }),
    )
    completeAttempt.succeeded()
    ElMessage.success('裁剪已完工，裁片包与余料来源链已落账')
  } catch (error) {
    completeAttempt.failed(error)
    report(error, '裁剪完工失败')
  } finally {
    pending.value = false
  }
}

async function createKitting(): Promise<void> {
  if (pending.value || !checkForm.value.orderItemId || !checkForm.value.skuId) return
  pending.value = true
  failure.value = ''
  try {
    kitting.value = await kittingApi.check(checkForm.value)
    kittingQuery.value = kitting.value.id
    releases.value = await kittingApi.releases(kitting.value.id)
    ElMessage.success('已按裁片实绩与冻结辅料需求重算齐套')
  } catch (error) {
    report(error, '齐套检查失败')
  } finally {
    pending.value = false
  }
}

function report(error: unknown, fallback: string): void {
  const candidate = error as { message?: string; traceId?: string }
  failure.value = candidate.message || fallback
  traceId.value = candidate.traceId || ''
}

async function loadCutting(): Promise<void> {
  if (!cuttingQuery.value.trim()) return
  failure.value = ''
  try {
    cutting.value = await cuttingApi.get(cuttingQuery.value.trim())
  } catch (error) {
    report(error, '裁剪任务加载失败')
  }
}

async function loadKitting(): Promise<void> {
  if (!kittingQuery.value.trim()) return
  failure.value = ''
  try {
    ;[kitting.value, releases.value] = await Promise.all([
      kittingApi.get(kittingQuery.value.trim()),
      kittingApi.releases(kittingQuery.value.trim()),
    ])
  } catch (error) {
    report(error, '齐套检查加载失败')
  }
}

async function transition(action: 'release' | 'start'): Promise<void> {
  if (!cutting.value || pending.value) return
  pending.value = true
  try {
    cutting.value = await cuttingApi[action](cutting.value.id, cutting.value.version)
    ElMessage.success(action === 'release' ? '裁剪任务已下达' : '裁剪已开工')
  } catch (error) {
    report(error, '裁剪状态更新失败')
  } finally {
    pending.value = false
  }
}

async function releaseKitting(): Promise<void> {
  if (!kitting.value || !isPositiveDecimal(releaseQuantity.value) || pending.value) return
  pending.value = true
  const payload = { id: kitting.value.id, quantity: releaseQuantity.value }
  try {
    await kittingApi.release(
      kitting.value.id,
      releaseQuantity.value,
      releaseAttempt.keyFor(payload),
    )
    releaseAttempt.succeeded()
    ElMessage.success('齐套数量已释放，可进入排产')
    await loadKitting()
  } catch (error) {
    releaseAttempt.failed(error)
    report(error, '齐套释放失败')
  } finally {
    pending.value = false
  }
}

async function scheduleKitting(item: KittingRelease): Promise<void> {
  const quantity = scheduleQuantities.value[item.id] || '0'
  const reference = scheduleReferences.value[item.id]?.trim() || ''
  if (!isPositiveDecimal(quantity) || !reference || pending.value) return
  pending.value = true
  const payload = { id: item.id, quantity, reference }
  try {
    await kittingApi.schedule(item.id, quantity, reference, scheduleAttempt.keyFor(payload))
    scheduleAttempt.succeeded()
    ElMessage.success('排产引用已占用对应齐套释放量')
    await loadKitting()
  } catch (error) {
    scheduleAttempt.failed(error)
    report(error, '齐套排产失败')
  } finally {
    pending.value = false
  }
}

onMounted(loadCuttingOptions)
</script>

<template>
  <section class="cutting-kitting-console">
    <header class="console-head">
      <div>
        <p class="eyebrow">CUT ROOM / KIT RELEASE</p>
        <h1>裁剪与齐套</h1>
        <p>同一条来源链，串起领布、裁片包、生产批次与可排产数量。</p>
      </div>
      <div class="chain-mark" aria-label="业务链路">
        <span>领布</span><b>→</b><span>裁剪</span><b>→</b><span>齐套</span><b>→</b><span>排产</span>
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

    <div class="dual-workbench">
      <article class="work-panel cutting-panel">
        <header>
          <div>
            <p class="eyebrow">FABRIC CONVERSION</p>
            <h2>裁剪任务</h2>
          </div>
          <span class="panel-number">01</span>
        </header>
        <el-form
          data-testid="create-cutting-form"
          class="mutation-form"
          @submit.prevent="createCutting"
        >
          <h3>创建裁剪任务</h3>
          <div class="compact-fields">
            <label>裁剪单号<el-input v-model="createForm.cuttingNo" required /></label>
            <label>
              订单项
              <SelectField
                v-model="createForm.orderItemId"
                data-testid="cutting-order-item"
                aria-label="订单项"
                placeholder="选择订单项"
                filterable
                :options="orderItemOptions"
                @change="onOrderItemChange(String($event ?? ''))"
              />
            </label>
            <label>
              SKU
              <SelectField
                v-model="createForm.skuId"
                data-testid="cutting-sku"
                aria-label="SKU"
                placeholder="选择SKU"
                filterable
                :options="skuOptions"
              />
            </label>
            <label>
              领料单
              <SelectField
                v-model="createForm.materialIssueId"
                data-testid="cutting-material-issue"
                aria-label="领料单"
                placeholder="请先选择订单项"
                filterable
                :options="issueOptions"
                @change="onIssueChange(String($event ?? ''))"
              />
            </label>
            <label>生产批次<el-input v-model="createForm.productionBatch" required /></label>
            <label>来源布批<el-input v-model="createForm.sourceFabricLot" required /></label>
            <label
              >投入数量<el-input
                v-model="createForm.inputQuantity"
                required
                inputmode="decimal"
                placeholder="0.000000"
            /></label>
          </div>
          <el-button
            type="primary"
            native-type="submit"
            :disabled="pending || !isPositiveDecimal(createForm.inputQuantity)"
          >
            创建并占用领布
          </el-button>
        </el-form>
        <el-form class="query-strip" @submit.prevent="loadCutting">
          <label
            >裁剪任务 ID<el-input
              v-model="cuttingQuery"
              data-testid="cutting-query"
              placeholder="输入 UUID"
          /></label>
          <el-button data-testid="load-cutting" @click="loadCutting">读取</el-button>
        </el-form>

        <template v-if="cutting">
          <div class="state-line">
            <code>{{ cutting.cuttingNo }}</code
            ><b :class="cutting.status.toLowerCase()">{{ cutting.status }}</b
            ><span>v{{ cutting.version }}</span>
          </div>
          <div class="equation-card" :class="{ invalid: !conservationOk }">
            <small>数量守恒</small><strong>领布投入 = 裁片产出 + 损耗 + 余料回库</strong>
            <div>
              <b>{{ cutting.inputQuantity }}</b
              ><span>=</span><b>{{ cutting.outputQuantity }}</b
              ><span>+</span><b>{{ cutting.lossQuantity }}</b
              ><span>+</span><b>{{ cutting.excessReturnQuantity }}</b>
            </div>
          </div>
          <dl class="trace-grid">
            <div>
              <dt>订单项</dt>
              <dd>{{ formatOrderItemId(cutting.orderItemId) }}</dd>
            </div>
            <div>
              <dt>SKU</dt>
              <dd>{{ formatSkuId(cutting.skuId) }}</dd>
            </div>
            <div>
              <dt>生产批次</dt>
              <dd>{{ cutting.productionBatch }}</dd>
            </div>
            <div>
              <dt>来源布批</dt>
              <dd>{{ cutting.sourceFabricLot }}</dd>
            </div>
          </dl>
          <div class="state-actions">
            <el-button
              v-if="cutting.status === 'DRAFT'"
              :disabled="pending"
              @click="transition('release')"
            >
              下达裁剪
            </el-button>
            <el-button
              v-if="cutting.status === 'RELEASED'"
              :disabled="pending"
              @click="transition('start')"
            >
              开始裁剪
            </el-button>
          </div>
          <el-form
            data-testid="complete-cutting-form"
            class="mutation-form"
            @submit.prevent="completeCutting"
          >
            <h3>完工与裁片包</h3>
            <div class="compact-fields">
              <label
                >裁片产出<el-input
                  v-model="completeForm.outputQuantity"
                  required
                  inputmode="decimal"
                  placeholder="0.000000"
              /></label>
              <label
                >损耗<el-input
                  v-model="completeForm.lossQuantity"
                  required
                  inputmode="decimal"
                  placeholder="0.000000"
              /></label>
              <label
                >余料回库<el-input
                  v-model="completeForm.excessReturnQuantity"
                  required
                  inputmode="decimal"
                  placeholder="0.000000"
              /></label>
              <label v-if="isPositiveDecimal(completeForm.excessReturnQuantity)"
                >退料单号<el-input v-model="completeForm.returnNo" required
              /></label>
            </div>
            <div v-for="(line, index) in bundleLines" :key="index" class="bundle-entry">
              <label>裁片包号<el-input v-model="line.bundleNo" required /></label>
              <label
                >包数量<el-input
                  v-model="line.quantity"
                  required
                  inputmode="decimal"
                  placeholder="0.000000"
              /></label>
              <el-button
                v-if="bundleLines.length > 1"
                link
                type="primary"
                @click="bundleLines.splice(index, 1)"
              >
                移除
              </el-button>
            </div>
            <el-button @click="bundleLines.push({ bundleNo: '', quantity: '0' })">
              增加裁片包
            </el-button>
            <el-button
              type="primary"
              native-type="submit"
              :disabled="pending || cutting.status !== 'CUTTING'"
            >
              确认完工
            </el-button>
          </el-form>
          <section class="bundle-stack">
            <header>
              <h3>裁片包</h3>
              <b>{{ cutting.bundles.length }} 包 / {{ cutting.outputQuantity }}</b>
            </header>
            <ol>
              <li v-for="bundle in cutting.bundles" :key="bundle.id">
                <span>{{ bundle.bundleNo }}</span
                ><b>{{ bundle.quantity }}</b
                ><code>{{ bundle.productionBatch }} · {{ bundle.sourceFabricLot }}</code>
              </li>
            </ol>
          </section>
        </template>
        <p v-else class="empty-note">读取裁剪任务，核验投入、产出、损耗与余料回库是否平衡。</p>
      </article>

      <article class="work-panel kitting-panel">
        <header>
          <div>
            <p class="eyebrow">MINIMUM READINESS</p>
            <h2>齐套释放</h2>
          </div>
          <span class="panel-number">02</span>
        </header>
        <el-form
          data-testid="create-kitting-form"
          class="mutation-form"
          @submit.prevent="createKitting"
        >
          <h3>按实绩检查齐套</h3>
          <div class="compact-fields">
            <label>
              订单项
              <SelectField
                v-model="checkForm.orderItemId"
                data-testid="kitting-order-item"
                aria-label="订单项"
                placeholder="选择订单项"
                filterable
                :options="orderItemOptions"
                @change="onCheckOrderItemChange(String($event ?? ''))"
              />
            </label>
            <label>
              SKU
              <SelectField
                v-model="checkForm.skuId"
                data-testid="kitting-sku"
                aria-label="SKU"
                placeholder="选择SKU"
                filterable
                :options="checkSkuOptions"
              />
            </label>
          </div>
          <el-button
            type="primary"
            native-type="submit"
            :disabled="pending || !checkForm.orderItemId || !checkForm.skuId"
          >
            重算齐套
          </el-button>
        </el-form>
        <el-form class="query-strip" @submit.prevent="loadKitting">
          <label
            >齐套检查 ID<el-input
              v-model="kittingQuery"
              data-testid="kitting-query"
              placeholder="输入 UUID"
          /></label>
          <el-button data-testid="load-kitting" @click="loadKitting">读取</el-button>
        </el-form>

        <template v-if="kitting">
          <div class="minimum-card">
            <small>齐套口径</small><strong>整体齐套 = min(裁片齐套, 辅料齐套)</strong>
            <div class="ready-bars">
              <span
                ><i
                  :style="{
                    width: decimalPercent(kitting.fabricReadyQuantity, kitting.requiredQuantity),
                  }"
                />裁片 {{ kitting.fabricReadyQuantity }}</span
              ><span
                ><i
                  :style="{
                    width: decimalPercent(kitting.accessoryReadyQuantity, kitting.requiredQuantity),
                  }"
                />辅料 {{ kitting.accessoryReadyQuantity }}</span
              >
            </div>
          </div>
          <div class="release-meter">
            <div>
              <small>整体可齐套</small
              ><b data-testid="overall-ready">{{ kitting.overallReadyQuantity }}</b>
            </div>
            <div>
              <small>累计已释放</small><b>{{ kitting.releasedQuantity }}</b>
            </div>
            <div class="remainder">
              <small>剩余可释放</small
              ><b data-testid="release-remainder">{{ kitting.remainingQuantity }}</b>
            </div>
          </div>
          <el-form class="release-form" @submit.prevent="releaseKitting">
            <label
              ><span>本次释放数量</span>
              <el-input
                v-model="releaseQuantity"
                inputmode="decimal"
                min="0"
                :max="kitting.remainingQuantity"
                step="any"
              />
            </label>
            <el-button
              type="primary"
              native-type="submit"
              :disabled="
                pending ||
                !isPositiveDecimal(releaseQuantity) ||
                compareDecimal(releaseQuantity, kitting.remainingQuantity) > 0
              "
            >
              释放至排产池
            </el-button>
          </el-form>
          <section class="release-history">
            <header>
              <h3>释放记录</h3>
              <b>{{ releases.length }} 次</b>
            </header>
            <ol>
              <li v-for="item in releases" :key="item.id">
                <code>{{ item.id.slice(0, 8) }}</code
                ><b>释放 {{ item.quantity }}</b
                ><span>已排产 {{ item.scheduledQuantity }}</span
                ><small>余 {{ item.remainingForScheduling }}</small>
                <el-form
                  class="schedule-form"
                  :data-testid="`schedule-form-${item.id}`"
                  @submit.prevent="scheduleKitting(item)"
                >
                  <label
                    >排产引用 / 批次号<el-input
                      v-model="scheduleReferences[item.id]"
                      :data-testid="`schedule-reference-${item.id}`"
                      required
                      maxlength="64"
                  /></label>
                  <label
                    >排产数量<el-input
                      v-model="scheduleQuantities[item.id]"
                      :data-testid="`schedule-quantity-${item.id}`"
                      required
                      inputmode="decimal"
                      placeholder="0.000000"
                  /></label>
                  <el-button
                    :data-testid="`schedule-${item.id}`"
                    type="primary"
                    native-type="submit"
                    :disabled="
                      pending ||
                      !scheduleReferences[item.id]?.trim() ||
                      !isPositiveDecimal(scheduleQuantities[item.id] || '0') ||
                      compareDecimal(
                        scheduleQuantities[item.id] || '0',
                        item.remainingForScheduling,
                      ) > 0
                    "
                  >
                    占用排产
                  </el-button>
                </el-form>
              </li>
            </ol>
          </section>
        </template>
        <p v-else class="empty-note">读取齐套检查，只允许释放裁片与辅料共同满足的最小数量。</p>
      </article>
    </div>
  </section>
</template>

<style scoped>
.cutting-kitting-console {
  display: grid;
  gap: 22px;
  color: #162019;
}
.console-head {
  display: flex;
  justify-content: space-between;
  align-items: end;
  padding: 28px;
  border-bottom: 5px solid #17231c;
  background: linear-gradient(135deg, #f3eddf, #e5eadf);
}
.console-head h1 {
  font:
    700 clamp(2.2rem, 5vw, 4.8rem)/0.9 Georgia,
    serif;
  margin: 10px 0;
}
.chain-mark {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-wrap: wrap;
}
.chain-mark span {
  border: 1px solid #17231c;
  padding: 8px 10px;
  background: #fffdf7;
}
.chain-mark b {
  color: #d75f38;
}
.dual-workbench {
  display: grid;
  grid-template-columns: 1.08fr 0.92fr;
  gap: 18px;
}
.work-panel {
  border: 1px solid #26342c;
  padding: 22px;
  background: #fffdf7;
  box-shadow: 6px 6px 0 #cfd5ca;
}
.work-panel.kitting-panel {
  background: #eef2e9;
  box-shadow: 6px 6px 0 #d75f38;
}
.work-panel > header,
.bundle-stack header,
.release-history header {
  display: flex;
  justify-content: space-between;
  align-items: start;
}
.work-panel h2 {
  font:
    700 2rem Georgia,
    serif;
  margin: 5px 0 16px;
}
.panel-number {
  font:
    700 3.5rem/0.8 Georgia,
    serif;
  color: #b8c0b8;
}
.query-strip {
  display: flex;
  margin-bottom: 18px;
}
.mutation-form {
  display: grid;
  gap: 10px;
  margin-bottom: 16px;
  padding: 14px;
  border: 1px dashed #78837b;
  background: #f5f1e6;
}
.mutation-form h3 {
  margin: 0;
}
.compact-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.compact-fields .el-input,
.compact-fields .el-select,
.bundle-entry .el-input {
  min-width: 0;
  width: 100%;
}
.bundle-entry {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 8px;
}
.mutation-form button {
  justify-self: start;
  border: 1px solid #17231c;
  background: #fffdf7;
  padding: 9px 12px;
  font-weight: 800;
}
.query-strip .el-input {
  flex: 1;
  min-width: 0;
}
.query-strip button,
.state-actions button,
.release-form button {
  border: 0;
  background: #17231c;
  color: #fff;
  padding: 11px 15px;
  font-weight: 800;
}
.state-line {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-top: 1px dashed #778179;
  border-bottom: 1px dashed #778179;
}
.state-line b {
  margin-left: auto;
  color: #d75f38;
}
.equation-card,
.minimum-card {
  margin: 18px 0;
  padding: 18px;
  background: #17231c;
  color: #f9f5ea;
}
.equation-card small,
.equation-card strong,
.minimum-card small,
.minimum-card strong {
  display: block;
}
.equation-card strong,
.minimum-card strong {
  font-family: Georgia, serif;
  font-size: 1.15rem;
  margin: 5px 0 14px;
}
.equation-card > div {
  display: grid;
  grid-template-columns: 1fr auto 1fr auto 1fr auto 1fr;
  align-items: center;
  text-align: center;
}
.equation-card > div b {
  font:
    700 1.6rem Georgia,
    serif;
  color: #f4c16c;
}
.trace-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.trace-grid div {
  border-left: 3px solid #d75f38;
  padding-left: 10px;
}
.trace-grid dt {
  font-size: 11px;
  font-weight: 900;
}
.trace-grid dd {
  margin: 4px 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.state-actions {
  margin: 14px 0;
}
.bundle-stack,
.release-history {
  border-top: 2px solid #17231c;
  margin-top: 18px;
}
.bundle-stack ol,
.release-history ol {
  list-style: none;
  padding: 0;
}
.bundle-stack li {
  display: grid;
  grid-template-columns: 70px 70px 1fr;
  gap: 8px;
  border-top: 1px dashed #8b948e;
  padding: 10px 0;
}
.ready-bars {
  display: grid;
  gap: 8px;
}
.ready-bars span {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  padding: 7px;
  border: 1px solid #718078;
}
.ready-bars i {
  position: absolute;
  z-index: -1;
  inset: 0 auto 0 0;
  background: #d75f38;
}
.release-meter {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.release-meter div {
  padding: 13px;
  border: 1px solid #7a867d;
}
.release-meter small,
.release-meter b {
  display: block;
}
.release-meter b {
  font:
    700 1.8rem Georgia,
    serif;
}
.release-meter .remainder {
  background: #f4c16c;
}
.release-form {
  display: flex;
  gap: 10px;
  align-items: end;
  margin: 16px 0;
}
.release-form label {
  flex: 1;
}
.release-form span {
  display: block;
  font-size: 12px;
  font-weight: 900;
}
.release-form .el-input {
  width: 100%;
}
.release-history li {
  display: grid;
  grid-template-columns: 75px 1fr 1fr auto;
  gap: 8px;
  padding: 10px 0;
  border-top: 1px dashed #849087;
}
.empty-note {
  color: #68746c;
  padding: 30px 0;
}
.error-ticket {
  padding: 14px;
  border-left: 5px solid #b6422c;
  background: #fff1eb;
}
.error-ticket small {
  display: block;
}
.eyebrow {
  font-size: 11px !important;
  letter-spacing: 0.16em;
  font-weight: 900;
  margin: 0;
}
@media (max-width: 960px) {
  .console-head,
  .dual-workbench {
    display: grid;
    grid-template-columns: 1fr;
    gap: 20px;
  }
  .release-meter {
    grid-template-columns: 1fr;
  }
  .release-form {
    align-items: stretch;
    flex-direction: column;
  }
  .trace-grid {
    grid-template-columns: 1fr;
  }
}
</style>
