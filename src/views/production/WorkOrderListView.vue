<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { productionApi } from '@/api/production'
import { createIdempotencyAttempt } from '@/api/http'
import { WORK_ORDER_PAGE_SIZE, useWorkOrderListStore } from '@/stores/workOrders'
import type { WorkOrderSummary } from '@/types/production'

const workOrders = useWorkOrderListStore()
const { rows, loading, errorMessage, page, totalPages, totalElements } = storeToRefs(workOrders)
const productionScheduleId = ref('')
const converting = ref(false)
const conversion = createIdempotencyAttempt()

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

function load(targetPage = page.value): Promise<void> {
  return workOrders.load(targetPage)
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

function asWorkOrder(row: unknown): WorkOrderSummary {
  return row as WorkOrderSummary
}

onMounted(load)
defineExpose({ load })
</script>

<template>
  <section class="work-orders">
    <header class="hero">
      <div>
        <p class="eyebrow">PRODUCTION CONTROL / 工单控制塔</p>
        <h1>生产工单</h1>
        <p>把已审批排程固化为唯一生产批次，沿产线追踪计划、在制与良品。</p>
      </div>
      <el-button :disabled="loading" @click="load()">刷新工况</el-button>
    </header>

    <el-form data-testid="convert-form" class="convert-panel" inline @submit.prevent="convert">
      <el-form-item label="已审批排程 ID">
        <el-input
          v-model.trim="productionScheduleId"
          name="productionScheduleId"
          placeholder="ProductionSchedule UUID"
        />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" native-type="submit" :loading="converting">
          {{ converting ? '转换中…' : '生成工单与批次' }}
        </el-button>
      </el-form-item>
      <small>同一排程无论重试或并发提交，都只生成一张工单与一个批次。</small>
    </el-form>

    <el-alert v-if="errorMessage" :title="errorMessage" type="error" :closable="false" show-icon />

    <div class="desktop-record-table">
      <el-table v-loading="loading" :data="rows">
        <el-table-column label="工单 / 状态" min-width="180">
          <template #default="{ row }">
            <RouterLink :to="`/work-orders/${asWorkOrder(row).id}`">{{
              asWorkOrder(row).workOrderNo
            }}</RouterLink>
            <el-tag size="small">{{ statusLabel[asWorkOrder(row).status] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="生产批次" min-width="140">
          <template #default="{ row }">
            <code>{{ row.productionBatch.plannedBatchCode }}</code>
          </template>
        </el-table-column>
        <el-table-column label="产线" min-width="120">
          <template #default="{ row }">
            <code>{{ row.productionLineId }}</code>
          </template>
        </el-table-column>
        <el-table-column label="计划量" prop="plannedQuantity" width="100" />
        <el-table-column label="生产窗口" min-width="200">
          <template #default="{ row }">
            {{ row.productionBatch.startDate }} → {{ row.productionBatch.endDate }}
          </template>
        </el-table-column>
        <el-table-column label="进度" min-width="140">
          <template #default="{ row }">
            <b>{{ row.totalGoodQuantity }}</b>
            <small>良品 / 在制 {{ row.workInProgressQuantity }}</small>
          </template>
        </el-table-column>
        <template #empty>暂无工单，从已审批排程开始。</template>
      </el-table>
    </div>
    <div v-if="rows.length" class="mobile-record-list" :aria-busy="loading">
      <article v-for="row in rows" :key="row.id" class="mobile-record-card">
        <header>
          <div>
            <code>{{ row.workOrderNo }}</code
            ><small>{{ row.productionLineId }}</small>
          </div>
          <el-tag size="small">{{ statusLabel[row.status] }}</el-tag>
        </header>
        <dl>
          <div>
            <dt>生产批次</dt>
            <dd>{{ row.productionBatch.plannedBatchCode }}</dd>
          </div>
          <div>
            <dt>计划量</dt>
            <dd>{{ row.plannedQuantity }}</dd>
          </div>
          <div>
            <dt>生产窗口</dt>
            <dd>{{ row.productionBatch.startDate }} → {{ row.productionBatch.endDate }}</dd>
          </div>
          <div>
            <dt>良品 / 在制</dt>
            <dd>{{ row.totalGoodQuantity }} / {{ row.workInProgressQuantity }}</dd>
          </div>
        </dl>
        <footer>
          <RouterLink class="record-primary-link" :to="`/work-orders/${row.id}`"
            >查看工单</RouterLink
          >
        </footer>
      </article>
    </div>
    <nav v-if="totalPages > 1" class="pager" aria-label="工单分页">
      <span>第 {{ page + 1 }} / {{ totalPages }} 页，共 {{ totalElements }} 张工单</span>
      <el-pagination
        :current-page="page + 1"
        :page-size="WORK_ORDER_PAGE_SIZE"
        :total="totalElements"
        layout="prev, pager, next"
        @current-change="(next: number) => load(next - 1)"
      />
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
