<script setup lang="ts">
import SelectField from '@/components/form/SelectField.vue'
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { inventoryApi } from '@/api/inventory'
import { masterDataApi } from '@/api/masterdata'
import { salesOrderApi } from '@/api/orders'
import { createIdempotencyAttempt } from '@/api/http'
import type { InventoryBalance, InventoryLedger, MaterialType } from '@/types/inventory'
import type { MasterDataOption, MasterDataRecord } from '@/types/masterdata'
import type { SalesOrder } from '@/types/order'
import { compareDecimal } from '@/utils/decimal'

const CLOSED_ORDER_STATUSES = new Set(['DRAFT', 'CANCELLED', 'COMPLETED'])

const materialQuery = ref('')
const fabrics = ref<MasterDataRecord[]>([])
const warehouses = ref<MasterDataOption[]>([])
const orders = ref<SalesOrder[]>([])
const balances = ref<InventoryBalance[]>([])
const ledgers = ref<InventoryLedger[]>([])
const loading = ref(false)
const pending = ref(false)
const failure = ref('')
const traceId = ref('')
const issue = ref({
  issueNo: '',
  orderItemId: '',
  warehouseId: '',
  materialId: '',
  materialType: 'FABRIC' as MaterialType,
  batchNo: '',
  quantity: '0',
})
const fabricOptions = computed(() =>
  fabrics.value.map((item) => ({
    label: item.name,
    value: item.id,
  })),
)
const warehouseOptions = computed(() =>
  warehouses.value.map((item) => ({
    label: `${item.code} · ${item.name}`,
    value: item.id,
  })),
)
const orderItemOptions = computed(() =>
  orders.value.flatMap((order) =>
    order.items.map((item) => ({
      label: `${order.orderNo} · ${item.color} / ${item.size} / ${item.fit}`,
      value: item.id,
    })),
  ),
)
const returned = ref({ returnNo: '', materialIssueId: '', quantity: '0' })
const issueAttempt = createIdempotencyAttempt()
const returnAttempt = createIdempotencyAttempt()

function report(error: unknown, fallback: string): void {
  const candidate = error as { message?: string; traceId?: string }
  failure.value = candidate.message || fallback
  traceId.value = candidate.traceId || ''
}

function applyMaterialSelection(materialId: string): void {
  issue.value.materialId = materialId
  const fabric = fabrics.value.find((item) => item.id === materialId)
  if (fabric?.materialType === 'FABRIC' || fabric?.materialType === 'ACCESSORY') {
    issue.value.materialType = fabric.materialType
  }
}

async function loadIssueOptions(): Promise<void> {
  try {
    const [materialPage, warehouseRows, orderPage] = await Promise.all([
      masterDataApi.list('materials', {
        page: 0,
        size: 100,
        active: true,
        sort: 'name,asc',
      }),
      masterDataApi.select('warehouses', '', 50),
      salesOrderApi.list({ page: 0, size: 50 }),
    ])
    fabrics.value = materialPage.content.filter((item) => item.materialType === 'FABRIC')
    warehouses.value = warehouseRows
    orders.value = orderPage.content.filter((order) => !CLOSED_ORDER_STATUSES.has(order.status))
  } catch (error) {
    report(error, '领料选项加载失败')
  }
}

async function load(): Promise<void> {
  if (!materialQuery.value.trim()) return
  loading.value = true
  failure.value = ''
  try {
    ;[balances.value, ledgers.value] = await Promise.all([
      inventoryApi.balances(materialQuery.value.trim()),
      inventoryApi.ledgers(materialQuery.value.trim()),
    ])
    applyMaterialSelection(materialQuery.value.trim())
    const warehouseIds = [...new Set(balances.value.map((balance) => balance.warehouseId))]
    if (warehouseIds.length === 1) issue.value.warehouseId = warehouseIds[0]
    if (balances.value.length === 1) {
      issue.value.warehouseId = balances.value[0].warehouseId
      issue.value.batchNo = balances.value[0].batchNo
    }
  } catch (error) {
    report(error, '库存数据加载失败')
  } finally {
    loading.value = false
  }
}

async function submitIssue(): Promise<void> {
  if (pending.value) return
  pending.value = true
  failure.value = ''
  const payload = { ...issue.value }
  try {
    const result = await inventoryApi.issue(payload, issueAttempt.keyFor(payload))
    issueAttempt.succeeded()
    returned.value.materialIssueId = result.issue.id
    materialQuery.value = result.issue.materialId
    ElMessage.success('领料已记账，库存流水同步写入')
    await load()
  } catch (error) {
    issueAttempt.failed(error)
    report(error, '领料失败')
  } finally {
    pending.value = false
  }
}

async function submitReturn(): Promise<void> {
  if (pending.value) return
  pending.value = true
  failure.value = ''
  const payload = { ...returned.value }
  try {
    const result = await inventoryApi.returnMaterial(payload, returnAttempt.keyFor(payload))
    returnAttempt.succeeded()
    materialQuery.value = result.issue.materialId
    ElMessage.success('退料已回到来源批次')
    await load()
  } catch (error) {
    returnAttempt.failed(error)
    report(error, '退料失败')
  } finally {
    pending.value = false
  }
}

watch(materialQuery, (materialId) => {
  applyMaterialSelection(materialId.trim())
  issue.value.batchNo = ''
})

onMounted(loadIssueOptions)
</script>

<template>
  <section class="inventory-console" :aria-busy="loading">
    <header class="inventory-head">
      <div>
        <p class="eyebrow">STOCK CONTROL / MATERIAL DESK</p>
        <h1>库存与领退料</h1>
        <p>余额锁定、流水双写；每一次出入库都回到明确的仓库、物料和批次。</p>
      </div>
      <div class="equation-ribbon">
        <small>库存守恒公式</small>
        <b>可用量 = 现存量 − 预占量</b>
      </div>
    </header>

    <el-form class="query-strip" @submit.prevent="load">
      <label>
        <span>面料名称</span>
        <SelectField
          v-model="materialQuery"
          data-testid="material-query"
          aria-label="面料名称"
          placeholder="选择面料"
          filterable
          :options="fabricOptions"
        />
      </label>
      <el-button data-testid="load-inventory" type="primary" :disabled="loading" @click="load">
        {{ loading ? '校验中…' : '读取批次库存' }}
      </el-button>
    </el-form>

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

    <div class="balance-grid">
      <article v-for="balance in balances" :key="balance.id" class="balance-ticket">
        <header>
          <span>LOT</span><code>{{ balance.batchNo || '无批次' }}</code>
        </header>
        <dl>
          <div>
            <dt>现存</dt>
            <dd>{{ balance.onHand }}</dd>
          </div>
          <div>
            <dt>预占</dt>
            <dd>{{ balance.reserved }}</dd>
          </div>
          <div class="available">
            <dt>可用</dt>
            <dd data-testid="available-quantity">{{ balance.available }}</dd>
          </div>
        </dl>
        <footer>
          <code>{{ balance.warehouseId.slice(0, 8) }}</code
          ><span>v{{ balance.version }}</span>
        </footer>
      </article>
      <p v-if="!balances.length && !loading" class="empty-note">
        选择面料名称，查看跨仓库、跨批次的实时可用量。
      </p>
    </div>

    <div class="movement-grid">
      <el-form class="movement-card issue" @submit.prevent="submitIssue">
        <header>
          <span>OUT</span>
          <div>
            <h2>领料出库</h2>
            <p>扣减前锁定余额行，禁止负库存。</p>
          </div>
        </header>
        <div class="field-grid">
          <label><span>领料单号</span><el-input v-model="issue.issueNo" required /></label>
          <label>
            <span>订单项</span>
            <SelectField
              v-model="issue.orderItemId"
              data-testid="issue-order-item"
              aria-label="订单项"
              placeholder="选择订单项"
              filterable
              :options="orderItemOptions"
            />
          </label>
          <label>
            <span>仓库</span>
            <SelectField
              v-model="issue.warehouseId"
              data-testid="issue-warehouse"
              aria-label="仓库"
              placeholder="选择仓库"
              filterable
              :options="warehouseOptions"
            />
          </label>
          <label>
            <span>面料名称</span>
            <SelectField
              v-model="materialQuery"
              data-testid="issue-material"
              aria-label="领料面料"
              placeholder="选择面料"
              filterable
              :options="fabricOptions"
            />
          </label>
          <label
            ><span>物料类型</span>
            <SelectField
              v-model="issue.materialType"
              aria-label="物料类型"
              :options="[
                { label: '面料（FABRIC）', value: 'FABRIC' },
                { label: '辅料（ACCESSORY）', value: 'ACCESSORY' },
              ]"
            />
          </label>
          <label>
            <span>来源批次</span>
            <el-input
              v-model="issue.batchNo"
              data-testid="issue-batch"
              aria-label="来源批次"
              placeholder="输入批次号"
            />
          </label>
          <label
            ><span>数量</span>
            <el-input
              v-model="issue.quantity"
              inputmode="decimal"
              min="0.000001"
              step="0.000001"
              required
            />
          </label>
        </div>
        <el-button type="primary" native-type="submit" :disabled="pending">确认领料</el-button>
      </el-form>

      <el-form class="movement-card return" @submit.prevent="submitReturn">
        <header>
          <span>IN</span>
          <div>
            <h2>余料退库</h2>
            <p>回到原领料单与原批次，累计不得超过领料量。</p>
          </div>
        </header>
        <div class="field-grid single">
          <label><span>退料单号</span><el-input v-model="returned.returnNo" required /></label>
          <label
            ><span>原领料 ID</span><el-input v-model="returned.materialIssueId" required
          /></label>
          <label
            ><span>数量</span>
            <el-input
              v-model="returned.quantity"
              inputmode="decimal"
              min="0.000001"
              step="0.000001"
              required
            />
          </label>
        </div>
        <el-button native-type="submit" :disabled="pending">确认退料</el-button>
      </el-form>
    </div>

    <article class="ledger-panel">
      <header>
        <div>
          <p class="eyebrow">APPEND-ONLY JOURNAL</p>
          <h2>不可变库存流水</h2>
        </div>
        <b>{{ ledgers.length }} 笔</b>
      </header>
      <ol>
        <li v-for="entry in ledgers" :key="entry.id">
          <time>{{ new Date(entry.occurredAt).toLocaleString('zh-CN') }}</time>
          <strong>{{ entry.eventType }}</strong
          ><code>{{ entry.batchNo || '无批次' }}</code>
          <span
            >现存 {{ compareDecimal(entry.deltaOnHand, '0') > 0 ? '+' : ''
            }}{{ entry.deltaOnHand }}</span
          >
          <span
            >预占 {{ compareDecimal(entry.deltaReserved, '0') > 0 ? '+' : ''
            }}{{ entry.deltaReserved }}</span
          >
          <small>{{ entry.businessReference }}</small>
        </li>
      </ol>
    </article>
  </section>
</template>

<style scoped>
.inventory-console {
  display: grid;
  gap: 24px;
  color: #18201c;
}
.inventory-head {
  display: flex;
  justify-content: space-between;
  gap: 28px;
  padding: 28px;
  border: 1px solid #1f2c25;
  background: linear-gradient(120deg, #f4efe2 0 65%, #dce7d5 65%);
}
.inventory-head h1 {
  font:
    700 clamp(2rem, 4vw, 4rem)/0.95 Georgia,
    serif;
  margin: 8px 0;
}
.inventory-head p {
  max-width: 650px;
}
.equation-ribbon {
  align-self: center;
  background: #17241d;
  color: #f4efe2;
  padding: 18px 22px;
  transform: rotate(-1deg);
  box-shadow: 6px 6px 0 #d9673f;
}
.equation-ribbon small,
.equation-ribbon b {
  display: block;
}
.query-strip {
  display: flex;
  gap: 12px;
  align-items: end;
}
.query-strip label {
  flex: 1;
}
.query-strip span,
.field-grid span {
  display: block;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  margin-bottom: 6px;
}
.query-strip .el-input,
.query-strip .el-select,
.field-grid .el-input,
.field-grid .el-select {
  width: 100%;
}
.ink-button,
.paper-button {
  border: 1px solid #17241d;
  padding: 12px 18px;
  font-weight: 800;
  cursor: pointer;
}
.ink-button {
  background: #17241d;
  color: #fff;
}
.paper-button {
  background: #f4efe2;
  color: #17241d;
}
.balance-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
}
.balance-ticket {
  border: 1px solid #768179;
  background: #fffdf7;
  padding: 18px;
  box-shadow: 4px 4px 0 #d6d0c1;
}
.balance-ticket header,
.balance-ticket footer {
  display: flex;
  justify-content: space-between;
}
.balance-ticket dl {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.balance-ticket dl div {
  border-top: 3px solid #a7b0a8;
  padding-top: 10px;
}
.balance-ticket .available {
  border-color: #d9673f;
}
.balance-ticket dt {
  font-size: 12px;
}
.balance-ticket dd {
  margin: 4px 0;
  font:
    700 1.5rem Georgia,
    serif;
}
.movement-grid {
  display: grid;
  grid-template-columns: 1.35fr 0.9fr;
  gap: 18px;
}
.movement-card {
  border: 1px solid #28342d;
  padding: 22px;
  background: #eef2e9;
}
.movement-card.return {
  background: #f4efe2;
}
.movement-card header {
  display: flex;
  gap: 14px;
}
.movement-card header > span {
  font:
    700 2rem Georgia,
    serif;
  color: #d9673f;
}
.movement-card h2 {
  margin: 0;
}
.movement-card p {
  margin: 4px 0 18px;
}
.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}
.field-grid.single {
  grid-template-columns: 1fr;
}
.ledger-panel {
  border-top: 4px solid #18201c;
}
.ledger-panel > header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.ledger-panel ol {
  padding: 0;
  list-style: none;
}
.ledger-panel li {
  display: grid;
  grid-template-columns: 150px 170px 100px 100px 100px 1fr;
  gap: 10px;
  padding: 12px 0;
  border-top: 1px dashed #8b958e;
  font-size: 13px;
}
.error-ticket {
  padding: 14px;
  border-left: 5px solid #b6422c;
  background: #fff1eb;
}
.error-ticket small {
  display: block;
}
.empty-note {
  color: #66736b;
}
.eyebrow {
  font-size: 11px !important;
  letter-spacing: 0.16em;
  font-weight: 900;
  margin: 0;
}
@media (max-width: 850px) {
  .inventory-head,
  .movement-grid {
    display: grid;
    grid-template-columns: 1fr;
  }
  .equation-ribbon {
    transform: none;
  }
  .field-grid {
    grid-template-columns: 1fr;
  }
  .ledger-panel li {
    grid-template-columns: 1fr 1fr;
  }
  .query-strip {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
