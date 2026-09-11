<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { productionApi } from '@/api/production'
import { createIdempotencyAttempt } from '@/api/http'
import type { ProductionReport, ProductionReportInput, WorkOrder } from '@/types/production'
import ProcessInspectionPanel from './ProcessInspectionPanel.vue'
import CompletionGateStatus from '@/components/production/CompletionGateStatus.vue'
import { formatDateTime, formatQuantity, shortReference } from '@/utils/presentation'

const route = useRoute()
const workOrder = ref<WorkOrder | null>(null)
const completionGate = ref<InstanceType<typeof CompletionGateStatus> | null>(null)
const reports = ref<ProductionReport[]>([])
const reportPage = ref(0)
const reportTotalPages = ref(0)
const reportTotalElements = ref(0)
const loading = ref(false)
const reportPending = ref(false)
const errorMessage = ref('')
const reportAttempt = createIdempotencyAttempt()
const actionAttempts = {
  submit: createIdempotencyAttempt(),
  approve: createIdempotencyAttempt(),
  release: createIdempotencyAttempt(),
}
type Action = keyof typeof actionAttempts
const actionPending = reactive<Record<Action, boolean>>({
  submit: false,
  approve: false,
  release: false,
})
let mutationSequence = 0
let reportSequence = 0
const reportForm = reactive<Omit<ProductionReportInput, 'version'>>({
  inputQuantity: '0.000000',
  goodQuantity: '0.000000',
  defectQuantity: '0.000000',
  reworkInputQuantity: '0.000000',
  closingWorkInProgressQuantity: '0.000000',
  operator: '',
  team: '',
  workHours: '0.000000',
  equipment: '',
})

const steps = [
  ['DRAFT', '草稿'],
  ['PENDING_APPROVAL', '待审批'],
  ['APPROVED', '已审批'],
  ['RELEASED', '已下达'],
  ['IN_PRODUCTION', '生产中'],
  ['PROCESS_INSPECTION', '过程初检'],
  ['READY_TO_COMPLETE', '待完工'],
  ['COMPLETED', '已完工'],
] as const

const currentStep = computed(() => {
  const index = steps.findIndex(([status]) => status === workOrder.value?.status)
  return index < 0 ? steps.length - 1 : index
})

async function load(): Promise<void> {
  const workOrderId = String(route.params.id)
  const requestId = ++mutationSequence
  const reportsRequestId = ++reportSequence
  loading.value = true
  errorMessage.value = ''
  try {
    const [core, reportPage] = await Promise.all([
      productionApi.get(workOrderId),
      productionApi.reports(workOrderId, 0, 20),
    ])
    if (requestId === mutationSequence && reportsRequestId === reportSequence) {
      workOrder.value = core
      applyReportPage(reportPage)
    }
  } catch (error) {
    if (requestId === mutationSequence) {
      errorMessage.value = error instanceof Error ? error.message : '工单加载失败'
    }
  } finally {
    if (requestId === mutationSequence) loading.value = false
  }
}

async function transition(action: Action): Promise<void> {
  if (!workOrder.value || actionPending[action]) return
  const current = workOrder.value
  const payload = { action, id: current.id, version: current.version }
  const attempt = actionAttempts[action]
  const requestId = ++mutationSequence
  actionPending[action] = true
  errorMessage.value = ''
  try {
    const response = await productionApi[action](
      current.id,
      current.version,
      attempt.keyFor(payload),
    )
    await acceptMutationResponse(requestId, response)
    attempt.succeeded()
  } catch (error) {
    attempt.failed(error)
    if (requestId === mutationSequence) {
      errorMessage.value = error instanceof Error ? error.message : '工单状态更新失败'
    }
  } finally {
    if (requestId === mutationSequence) actionPending[action] = false
  }
}

async function report(): Promise<void> {
  if (!workOrder.value || reportPending.value) return
  const input: ProductionReportInput = { ...reportForm, version: workOrder.value.version }
  const current = workOrder.value
  const requestId = ++mutationSequence
  reportPending.value = true
  errorMessage.value = ''
  try {
    const response = await productionApi.report(current.id, input, reportAttempt.keyFor(input))
    await acceptMutationResponse(requestId, response)
    reportAttempt.succeeded()
  } catch (error) {
    reportAttempt.failed(error)
    if (requestId === mutationSequence) {
      errorMessage.value = error instanceof Error ? error.message : '生产报工失败'
    }
    if (requestId === mutationSequence) reportPending.value = false
    return
  }
  if (requestId === mutationSequence) {
    const reportsRequestId = ++reportSequence
    try {
      const page = await productionApi.reports(current.id, 0, 20)
      if (
        requestId === mutationSequence &&
        reportsRequestId === reportSequence &&
        workOrder.value?.id === current.id
      ) {
        applyReportPage(page)
      }
    } catch (error) {
      if (requestId === mutationSequence && reportsRequestId === reportSequence) {
        errorMessage.value =
          error instanceof Error
            ? `报工已成功，流水刷新失败：${error.message}`
            : '报工已成功，流水刷新失败'
      }
    }
  }
  if (requestId === mutationSequence) reportPending.value = false
}

async function loadReports(targetPage: number): Promise<void> {
  if (!workOrder.value) return
  const workOrderId = workOrder.value.id
  const requestId = ++reportSequence
  errorMessage.value = ''
  try {
    const page = await productionApi.reports(workOrderId, targetPage, 20)
    if (requestId === reportSequence && workOrder.value?.id === workOrderId) {
      applyReportPage(page)
    }
  } catch (error) {
    if (requestId === reportSequence && workOrder.value?.id === workOrderId) {
      errorMessage.value = error instanceof Error ? error.message : '报工流水加载失败'
    }
  }
}

function applyReportPage(page: Awaited<ReturnType<typeof productionApi.reports>>): void {
  reports.value = page.content
  reportPage.value = page.page
  reportTotalPages.value = page.totalPages
  reportTotalElements.value = page.totalElements
}

async function acceptMutationResponse(requestId: number, response: WorkOrder): Promise<void> {
  if (requestId !== mutationSequence) return
  const minimumVersion = Math.max(workOrder.value?.version ?? 0, response.version)
  const refreshed = await productionApi.get(response.id)
  if (requestId === mutationSequence && refreshed.version >= minimumVersion) {
    workOrder.value = refreshed
  }
}

defineExpose({ transition, loadReports, workOrder })

watch(
  () => String(route.params.id),
  () => {
    mutationSequence += 1
    reportSequence += 1
    workOrder.value = null
    reports.value = []
    reportPage.value = 0
    reportTotalPages.value = 0
    reportTotalElements.value = 0
    loading.value = false
    reportPending.value = false
    errorMessage.value = ''
    reportAttempt.succeeded()
    for (const action of Object.keys(actionAttempts) as Action[]) {
      actionAttempts[action].succeeded()
      actionPending[action] = false
    }
    void load()
  },
  { flush: 'sync' },
)

onMounted(load)
</script>

<template>
  <section v-if="workOrder" class="detail">
    <header class="heading">
      <div>
        <p>WORK ORDER / {{ workOrder.productionBatch.plannedBatchCode }}</p>
        <h1>{{ workOrder.workOrderNo }}</h1>
        <span :title="workOrder.productionLineId"
          >产线编号 {{ shortReference(workOrder.productionLineId) }}</span
        >
      </div>
      <div class="actions">
        <el-button
          v-if="workOrder.status === 'DRAFT'"
          type="primary"
          :disabled="actionPending.submit"
          @click="transition('submit')"
        >
          提交审批
        </el-button>
        <el-button
          v-if="workOrder.status === 'PENDING_APPROVAL'"
          type="primary"
          :disabled="actionPending.approve"
          @click="transition('approve')"
        >
          审批工单
        </el-button>
        <el-button
          v-if="workOrder.status === 'APPROVED'"
          type="primary"
          :disabled="actionPending.release"
          @click="transition('release')"
        >
          下达产线
        </el-button>
        <RouterLink
          v-if="['READY_TO_COMPLETE', 'TRIMMING', 'READY_FOR_QUALITY'].includes(workOrder.status)"
          class="quality-link"
          :to="{ name: 'quality', query: { workOrderId: workOrder.id } }"
        >
          前往品质闭环
        </RouterLink>
      </div>
    </header>

    <ol class="timeline" aria-label="工单状态时间线">
      <li
        v-for="([status, label], index) in steps"
        :key="status"
        :class="{ done: index <= currentStep }"
      >
        <i>{{ index + 1 }}</i
        ><span>{{ label }}</span>
      </li>
    </ol>

    <div class="metrics">
      <article>
        <small>计划数量</small><strong>{{ formatQuantity(workOrder.plannedQuantity) }}</strong>
      </article>
      <article>
        <small>累计投入</small><strong>{{ formatQuantity(workOrder.totalInputQuantity) }}</strong>
      </article>
      <article>
        <small>累计良品</small><strong>{{ formatQuantity(workOrder.totalGoodQuantity) }}</strong>
      </article>
      <article>
        <small>累计不良</small><strong>{{ formatQuantity(workOrder.totalDefectQuantity) }}</strong>
      </article>
      <article>
        <small>返工路由</small><strong>{{ formatQuantity(workOrder.totalReworkQuantity) }}</strong>
      </article>
      <article>
        <small>当前在制</small
        ><strong>{{ formatQuantity(workOrder.workInProgressQuantity) }}</strong>
      </article>
      <article>
        <small>待返工余额</small
        ><strong>{{ formatQuantity(workOrder.reworkPendingQuantity) }}</strong>
      </article>
      <article>
        <small>已批准报废</small
        ><strong>{{ formatQuantity(workOrder.approvedScrapQuantity) }}</strong>
      </article>
      <article>
        <small>未开工</small><strong>{{ formatQuantity(workOrder.unstartedQuantity) }}</strong>
      </article>
    </div>

    <div class="workspace">
      <el-form
        v-if="['RELEASED', 'IN_PRODUCTION'].includes(workOrder.status)"
        data-testid="report-form"
        @submit.prevent="report"
      >
        <header>
          <div>
            <small>REPORT DELTA</small>
            <h2>增量生产报工</h2>
          </div>
          <p>期初在制由服务端锁定读取，避免跨次重复计量。</p>
        </header>
        <div class="form-grid">
          <label
            >新投入<el-input v-model="reportForm.inputQuantity" name="inputQuantity" required
          /></label>
          <label
            >本次良品<el-input v-model="reportForm.goodQuantity" name="goodQuantity" required
          /></label>
          <label
            >本次不良<el-input v-model="reportForm.defectQuantity" name="defectQuantity" required
          /></label>
          <label
            >返工投入
            <el-input
              v-model="reportForm.reworkInputQuantity"
              name="reworkInputQuantity"
              required
            />
          </label>
          <label
            >期末在制
            <el-input
              v-model="reportForm.closingWorkInProgressQuantity"
              name="closingWorkInProgressQuantity"
              required
            />
          </label>
          <label
            >操作人员<el-input v-model.trim="reportForm.operator" name="operator" required
          /></label>
          <label>班组<el-input v-model.trim="reportForm.team" name="team" required /></label>
          <label>工时<el-input v-model="reportForm.workHours" name="workHours" required /></label>
          <label
            >设备<el-input v-model.trim="reportForm.equipment" name="equipment" required
          /></label>
        </div>
        <p class="formula">
          期初在制 + 新投入 + 返工投入 = 本次良品 + 本次不良 + 期末在制；本次不良全部进入待返工。
        </p>
        <el-button type="primary" native-type="submit" :disabled="reportPending"
          >提交报工</el-button
        >
      </el-form>

      <section class="reports">
        <h2>不可变报工流水</h2>
        <article v-for="entry in reports" :key="entry.id">
          <div>
            <b>{{ formatDateTime(entry.reportedAt) }}</b
            ><small>{{ entry.operator }} · {{ entry.team }}</small>
          </div>
          <code
            >投入 {{ formatQuantity(entry.inputQuantity) }} / 良
            {{ formatQuantity(entry.goodQuantity) }} / 不良
            {{ formatQuantity(entry.defectQuantity) }} / 在制
            {{ formatQuantity(entry.closingWorkInProgressQuantity) }}</code
          >
        </article>
        <p v-if="reports.length === 0">尚无报工记录。</p>
        <nav v-if="reportTotalPages > 1" class="report-pager" aria-label="报工流水分页">
          <el-button :disabled="reportPage === 0" @click="loadReports(reportPage - 1)">
            上一页
          </el-button>
          <span
            >第 {{ reportPage + 1 }} / {{ reportTotalPages }} 页，共
            {{ reportTotalElements }} 条</span
          >
          <el-button
            :disabled="reportPage + 1 >= reportTotalPages"
            @click="loadReports(reportPage + 1)"
          >
            下一页
          </el-button>
        </nav>
      </section>
    </div>
    <el-alert
      v-if="['COMPLETED', 'CLOSED'].includes(workOrder.status)"
      title="该生产工单已完成"
      description="当前页面为只读归档状态，可继续查看数量汇总、报工流水与质量记录。"
      type="success"
      :closable="false"
      show-icon
    />
    <ProcessInspectionPanel
      v-if="['RELEASED', 'IN_PRODUCTION', 'PROCESS_INSPECTION'].includes(workOrder.status)"
      :work-order-id="workOrder.id"
      :work-order-status="workOrder.status"
      @inspection-updated="completionGate?.refresh()"
    />
    <CompletionGateStatus
      v-if="workOrder.status === 'IN_PRODUCTION'"
      ref="completionGate"
      :work-order="workOrder"
      @completed="load"
    />
    <el-alert
      v-if="errorMessage"
      :title="errorMessage"
      type="error"
      :closable="false"
      show-icon
      role="alert"
    />
  </section>
  <p v-else-if="loading">工单读取中…</p>
  <el-alert
    v-else
    :title="errorMessage || '未找到工单'"
    type="error"
    :closable="false"
    show-icon
    role="alert"
  />
</template>

<style scoped>
.detail {
  display: grid;
  gap: 20px;
  color: #1b2d2f;
}
.heading {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  padding: 25px;
  border-radius: 18px;
  background: #18383d;
  color: #f7f2df;
}
.heading p,
.heading span {
  margin: 0;
  color: #bbcfca;
}
.heading h1 {
  margin: 5px 0;
  font-size: 38px;
}
button {
  border: 0;
  border-radius: 9px;
  padding: 11px 16px;
  background: #e5b757;
  font-weight: 800;
  cursor: pointer;
}
.quality-link {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 16px;
  border-radius: 9px;
  background: #e5b757;
  color: #182b2c;
  font-weight: 800;
  text-decoration: none;
}
.timeline {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  margin: 0;
  padding: 18px;
  list-style: none;
  background: #fff;
  border-radius: 14px;
  border: 1px solid #dce3df;
}
.timeline li {
  display: grid;
  gap: 5px;
  justify-items: center;
  color: #98a5a1;
  font-size: 12px;
}
.timeline i {
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #e8ecea;
  font-style: normal;
}
.timeline .done {
  color: #1d504c;
  font-weight: 800;
}
.timeline .done i {
  background: #d7a94d;
  color: #182b2c;
}
.metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
}
.metrics article {
  padding: 16px;
  background: #fff;
  border: 1px solid #dce3df;
  border-radius: 12px;
}
.metrics small,
.metrics strong {
  display: block;
}
.metrics strong {
  margin-top: 8px;
  font:
    800 20px 'Cascadia Mono',
    monospace;
}
.workspace {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(280px, 1fr);
  gap: 16px;
}
form,
.reports {
  padding: 20px;
  background: #fff;
  border: 1px solid #dce3df;
  border-radius: 14px;
}
form header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
form h2,
form p {
  margin: 0;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 11px;
  margin: 17px 0;
}
label {
  display: grid;
  gap: 5px;
  font-size: 12px;
  font-weight: 750;
}
.formula {
  margin-bottom: 14px;
  color: #526964;
  font-family: 'Cascadia Mono', monospace;
}
.reports article {
  display: grid;
  gap: 6px;
  padding: 12px 0;
  border-bottom: 1px solid #e7ece9;
}
.reports small {
  display: block;
  color: #778783;
}
.reports code {
  white-space: normal;
}
.report-pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  color: #687a76;
}
.gate {
  margin: 0;
  padding: 14px;
  border-left: 4px solid #d7a94d;
  background: #fff8df;
}
.error-note {
  margin: 0;
  padding: 12px;
  background: #fff0ed;
  color: #9b2f29;
  border-radius: 9px;
}
@media (max-width: 900px) {
  .workspace {
    grid-template-columns: 1fr;
  }
  .form-grid {
    grid-template-columns: 1fr 1fr;
  }
  .timeline {
    overflow-x: auto;
    grid-template-columns: repeat(7, 100px);
  }
}
@media (max-width: 560px) {
  .heading {
    flex-direction: column;
  }
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
