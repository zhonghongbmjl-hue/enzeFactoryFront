<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { productionApi } from '@/api/production'
import { createIdempotencyAttempt } from '@/api/http'
import type { WorkOrderSummary } from '@/types/production'

const rows = ref<WorkOrderSummary[]>([])
const productionScheduleId = ref('')
const loading = ref(false)
const converting = ref(false)
const errorMessage = ref('')
const page = ref(0)
const totalPages = ref(0)
const totalElements = ref(0)
const conversion = createIdempotencyAttempt()
let loadSequence = 0

const statusLabel: Record<WorkOrderSummary['status'], string> = {
  DRAFT: '草稿',
  PENDING_APPROVAL: '待审批',
  APPROVED: '已审批',
  RELEASED: '已下达',
  IN_PRODUCTION: '生产中',
  PROCESS_INSPECTION: '过程初检',
  READY_TO_COMPLETE: '待完工',
  TRIMMING: '剪线中',
  READY_FOR_QUALITY: '待成品质检',
  COMPLETED: '已完工',
  CLOSED: '已关闭',
}

async function load(targetPage = page.value): Promise<void> {
  const sequence = ++loadSequence
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await productionApi.list(targetPage, 20)
    if (sequence !== loadSequence) return
    rows.value = result.content
    page.value = result.page
    totalPages.value = result.totalPages
    totalElements.value = result.totalElements
  } catch (error) {
    if (sequence !== loadSequence) return
    errorMessage.value = error instanceof Error ? error.message : '工单列表加载失败'
  } finally {
    if (sequence === loadSequence) loading.value = false
  }
}

async function convert(): Promise<void> {
  if (converting.value) return
  const scheduleId = productionScheduleId.value.trim()
  if (!scheduleId) return
  converting.value = true
  errorMessage.value = ''
  const payload = { productionScheduleId: scheduleId }
  try {
    await productionApi.convert(scheduleId, conversion.keyFor(payload))
    conversion.succeeded()
    productionScheduleId.value = ''
    await load(page.value)
  } catch (error) {
    conversion.failed(error)
    errorMessage.value = error instanceof Error ? error.message : '排程转换失败'
  } finally {
    converting.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="work-orders">
    <header class="hero">
      <div>
        <p class="eyebrow">PRODUCTION CONTROL / 工单控制塔</p>
        <h1>生产工单</h1>
        <p>把已审批排程固化为唯一生产批次，沿产线追踪计划、在制与良品。</p>
      </div>
      <button type="button" :disabled="loading" @click="load()">刷新工况</button>
    </header>

    <form data-testid="convert-form" class="convert-panel" @submit.prevent="convert">
      <label>
        <span>已审批排程 ID</span>
        <input
          v-model.trim="productionScheduleId"
          name="productionScheduleId"
          required
          placeholder="ProductionSchedule UUID"
        />
      </label>
      <button type="submit" :disabled="converting">
        {{ converting ? '转换中…' : '生成工单与批次' }}
      </button>
      <small>同一排程无论重试或并发提交，都只生成一张工单与一个批次。</small>
    </form>

    <p v-if="errorMessage" class="error-note">{{ errorMessage }}</p>

    <div class="table-shell">
      <table>
        <thead>
          <tr>
            <th>工单 / 状态</th>
            <th>生产批次</th>
            <th>产线</th>
            <th>计划量</th>
            <th>生产窗口</th>
            <th>进度</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td>
              <RouterLink :to="`/work-orders/${row.id}`">{{ row.workOrderNo }}</RouterLink>
              <span class="status" :data-status="row.status">{{ statusLabel[row.status] }}</span>
            </td>
            <td>
              <code>{{ row.productionBatch.plannedBatchCode }}</code>
            </td>
            <td>
              <code>{{ row.productionLineId }}</code>
            </td>
            <td class="quantity">{{ row.plannedQuantity }}</td>
            <td>{{ row.productionBatch.startDate }} → {{ row.productionBatch.endDate }}</td>
            <td>
              <b>{{ row.totalGoodQuantity }}</b>
              <small>良品 / 在制 {{ row.workInProgressQuantity }}</small>
            </td>
          </tr>
          <tr v-if="!loading && rows.length === 0">
            <td colspan="6" class="empty">暂无工单，从已审批排程开始。</td>
          </tr>
        </tbody>
      </table>
    </div>
    <nav v-if="totalPages > 1" class="pager" aria-label="工单分页">
      <button type="button" :disabled="loading || page === 0" @click="load(page - 1)">
        上一页
      </button>
      <span>第 {{ page + 1 }} / {{ totalPages }} 页，共 {{ totalElements }} 张工单</span>
      <button type="button" :disabled="loading || page + 1 >= totalPages" @click="load(page + 1)">
        下一页
      </button>
    </nav>
  </section>
</template>

<style scoped>
.work-orders {
  display: grid;
  gap: 20px;
  color: #17272b;
}
.hero {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  padding: 26px;
  color: #f4f0df;
  background: linear-gradient(125deg, #17383d, #315b58);
  border-radius: 18px;
}
.hero h1 {
  margin: 4px 0;
  font-size: clamp(28px, 4vw, 46px);
}
.hero p {
  margin: 0;
  max-width: 680px;
  color: #caddd4;
}
.eyebrow {
  color: #e4b964 !important;
  font-size: 12px;
  letter-spacing: 0.14em;
}
button {
  border: 0;
  border-radius: 10px;
  padding: 11px 16px;
  background: #e8b95d;
  color: #1f2d2c;
  font-weight: 800;
  cursor: pointer;
}
button:disabled {
  cursor: wait;
  opacity: 0.6;
}
.convert-panel {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) auto;
  align-items: end;
  gap: 12px;
  padding: 18px;
  background: #fff;
  border: 1px solid #d8e0dc;
  border-radius: 14px;
}
.convert-panel label {
  display: grid;
  gap: 7px;
  font-weight: 700;
}
.convert-panel input {
  padding: 11px 12px;
  border: 1px solid #aebeba;
  border-radius: 8px;
}
.convert-panel small {
  grid-column: 1 / -1;
  color: #677975;
}
.table-shell {
  overflow-x: auto;
  background: #fff;
  border: 1px solid #d8e0dc;
  border-radius: 14px;
}
table {
  width: 100%;
  border-collapse: collapse;
  min-width: 900px;
}
th,
td {
  padding: 15px 16px;
  text-align: left;
  border-bottom: 1px solid #edf0ee;
}
th {
  color: #647571;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
td:first-child {
  display: grid;
  gap: 6px;
}
a {
  color: #173f43;
  font-weight: 850;
}
.status {
  width: max-content;
  padding: 3px 8px;
  border-radius: 999px;
  background: #e9efec;
  color: #51635f;
  font-size: 12px;
}
.status[data-status='IN_PRODUCTION'],
.status[data-status='RELEASED'] {
  background: #fff0c8;
  color: #815d13;
}
.quantity,
code {
  font-family: 'Cascadia Mono', monospace;
}
td small {
  display: block;
  color: #71817d;
}
.empty {
  text-align: center;
  color: #73817e;
  padding: 40px;
}
.error-note {
  margin: 0;
  padding: 12px;
  color: #9b2f29;
  background: #fff0ed;
  border-radius: 10px;
}
.pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  color: #677975;
}
@media (max-width: 700px) {
  .hero {
    flex-direction: column;
  }
  .convert-panel {
    grid-template-columns: 1fr;
  }
}
</style>
