<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { planningApi } from '@/api/planning'
import { createIdempotencyAttempt } from '@/api/http'
import type { CreateProductionPlanInput, ProductionPlan } from '@/types/planning'
import { isPositiveDecimal } from '@/utils/decimal'

const form = ref<CreateProductionPlanInput>({
  orderId: '',
  orderItemId: '',
  skuId: '',
  kittingReleaseId: '',
  factoryId: '',
  workshopId: '',
  productionLineId: '',
  quantity: '0',
  startDate: '',
  endDate: '',
  plannedBatchCode: '',
})
const plan = ref<ProductionPlan>()
const query = ref('')
const pending = ref(false)
const failure = ref('')
const traceId = ref('')
let requestSequence = 0
const attempt = createIdempotencyAttempt()
const schedule = computed(() => plan.value?.items[0]?.schedule)
const readyToSubmit = computed(
  () =>
    isPositiveDecimal(form.value.quantity) &&
    Boolean(
      form.value.orderId &&
      form.value.orderItemId &&
      form.value.skuId &&
      form.value.kittingReleaseId &&
      form.value.factoryId &&
      form.value.workshopId &&
      form.value.productionLineId &&
      form.value.startDate &&
      form.value.endDate &&
      form.value.plannedBatchCode,
    ) &&
    form.value.endDate >= form.value.startDate,
)

function report(error: unknown, fallback: string): void {
  const candidate = error as { message?: string; traceId?: string }
  failure.value = candidate.message || fallback
  traceId.value = candidate.traceId || ''
}

function createPayload(): CreateProductionPlanInput {
  return { ...form.value, plannedBatchCode: form.value.plannedBatchCode.trim() }
}

async function createPlan(): Promise<void> {
  if (pending.value || !readyToSubmit.value) return
  plan.value = undefined
  pending.value = true
  failure.value = ''
  const payload = createPayload()
  const request = ++requestSequence
  const snapshot = JSON.stringify(payload)
  try {
    const created = await planningApi.create(payload, attempt.keyFor(payload))
    if (request !== requestSequence || JSON.stringify(createPayload()) !== snapshot) return
    plan.value = created
    attempt.succeeded()
    query.value = created.id
    ElMessage.success('排产草案已创建，齐套释放量已原子占用')
  } catch (error) {
    attempt.failed(error)
    if (request === requestSequence && JSON.stringify(createPayload()) === snapshot) {
      report(error, '排产创建失败')
    }
  } finally {
    pending.value = false
  }
}

async function loadPlan(): Promise<void> {
  if (!query.value.trim() || pending.value) return
  plan.value = undefined
  pending.value = true
  failure.value = ''
  const requestedPlanId = query.value.trim()
  const request = ++requestSequence
  try {
    const loaded = await planningApi.get(requestedPlanId)
    if (request !== requestSequence || query.value.trim() !== requestedPlanId) return
    plan.value = loaded
  } catch (error) {
    if (request === requestSequence && query.value.trim() === requestedPlanId) {
      report(error, '排产计划读取失败')
    }
  } finally {
    pending.value = false
  }
}

async function approve(): Promise<void> {
  if (!plan.value || pending.value || plan.value.status === 'APPROVED') return
  pending.value = true
  failure.value = ''
  try {
    plan.value = await planningApi.approve(plan.value.id, plan.value.version)
    ElMessage.success('排程已审批，可进入工单生成')
  } catch (error) {
    report(error, '排程审批失败')
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <section class="planning-console">
    <header class="dispatch-head">
      <div>
        <p class="eyebrow">MANUAL DISPATCH / LINE CONTROL</p>
        <h1>生产排产驾驶舱</h1>
        <p>把已齐套释放量转换为带日期、产线与批次身份的可执行排程。</p>
      </div>
      <div class="dispatch-rule" aria-label="排产约束">
        <span>齐套释放</span><b>LOCK</b><span>生产线</span><b>DATE</b><span>审批门</span>
      </div>
    </header>

    <div v-if="failure" class="planning-error" role="alert" aria-live="polite">
      <b>{{ failure }}</b
      ><small v-if="traceId">追踪号 {{ traceId }}</small>
    </div>

    <div class="dispatch-grid">
      <article class="dispatch-card input-card">
        <header>
          <span>01</span>
          <div>
            <small>RELEASE TO LINE</small>
            <h2>新建人工排程</h2>
          </div>
        </header>
        <form data-testid="planning-form" class="planning-form" @submit.prevent="createPlan">
          <fieldset :disabled="pending">
            <legend>订单与齐套来源</legend>
            <label
              >订单 ID<input v-model.trim="form.orderId" name="orderId" required autocomplete="off"
            /></label>
            <label
              >订单项 ID<input
                v-model.trim="form.orderItemId"
                name="orderItemId"
                required
                autocomplete="off"
            /></label>
            <label
              >SKU ID<input v-model.trim="form.skuId" name="skuId" required autocomplete="off"
            /></label>
            <label
              >齐套释放 ID<input
                v-model.trim="form.kittingReleaseId"
                name="kittingReleaseId"
                required
                autocomplete="off"
            /></label>
          </fieldset>
          <fieldset :disabled="pending">
            <legend>生产资源链</legend>
            <label
              >工厂 ID<input
                v-model.trim="form.factoryId"
                name="factoryId"
                required
                autocomplete="off"
            /></label>
            <label
              >车间 ID<input
                v-model.trim="form.workshopId"
                name="workshopId"
                required
                autocomplete="off"
            /></label>
            <label class="span-two"
              >产线 ID<input
                v-model.trim="form.productionLineId"
                name="productionLineId"
                required
                autocomplete="off"
            /></label>
          </fieldset>
          <fieldset class="schedule-fields" :disabled="pending">
            <legend>排程窗口</legend>
            <label
              >排产数量<input
                v-model.trim="form.quantity"
                name="quantity"
                required
                inputmode="decimal"
                autocomplete="off"
            /></label>
            <label
              >计划批次<input
                v-model.trim="form.plannedBatchCode"
                name="plannedBatchCode"
                required
                maxlength="64"
                autocomplete="off"
            /></label>
            <label
              >开始日期<input v-model="form.startDate" name="startDate" required type="date"
            /></label>
            <label
              >结束日期<input
                v-model="form.endDate"
                name="endDate"
                required
                type="date"
                :min="form.startDate"
            /></label>
          </fieldset>
          <button class="dispatch-action" type="submit" :disabled="pending || !readyToSubmit">
            <span>{{ pending ? '锁定资源中…' : '创建排产草案' }}</span
            ><b>→</b>
          </button>
        </form>
      </article>

      <article class="dispatch-card status-card">
        <header>
          <span>02</span>
          <div>
            <small>APPROVAL GATE</small>
            <h2>排程签发</h2>
          </div>
        </header>
        <form class="plan-query" @submit.prevent="loadPlan">
          <input
            v-model="query"
            aria-label="排产计划 ID"
            placeholder="输入排产计划 UUID"
            :disabled="pending"
          />
          <button type="submit" :disabled="pending">读取</button>
        </form>
        <template v-if="plan && schedule">
          <div class="approval-banner" :class="plan.status.toLowerCase()">
            <small>审批状态</small>
            <strong>{{ plan.status === 'APPROVED' ? '已审批' : '待审批' }}</strong>
            <span>{{ plan.planNo }}</span>
          </div>
          <dl class="schedule-ticket">
            <div>
              <dt>计划批次</dt>
              <dd>{{ schedule.plannedBatchCode }}</dd>
            </div>
            <div>
              <dt>排产数量</dt>
              <dd>{{ schedule.quantity }}</dd>
            </div>
            <div>
              <dt>日期窗口</dt>
              <dd>{{ schedule.startDate }} → {{ schedule.endDate }}</dd>
            </div>
            <div>
              <dt>产线</dt>
              <dd>
                <code>{{ schedule.productionLineId }}</code>
              </dd>
            </div>
            <div>
              <dt>齐套释放</dt>
              <dd>
                <code>{{ schedule.kittingReleaseId }}</code>
              </dd>
            </div>
            <div>
              <dt>并发版本</dt>
              <dd>v{{ plan.version }}</dd>
            </div>
          </dl>
          <aside class="work-order-gate" :class="{ open: plan.status === 'APPROVED' }">
            <b>{{ plan.status === 'APPROVED' ? '工单门已开启' : '仅已审批排程可下推工单' }}</b>
            <small>Task 12 将只读取 APPROVED 排程。</small>
          </aside>
          <button
            v-if="plan.status === 'DRAFT'"
            class="approve-action"
            type="button"
            :disabled="pending || Boolean(failure)"
            @click="approve"
          >
            审批并签发排程
          </button>
        </template>
        <div v-else class="empty-schedule">
          <span>⌁</span><b>等待排程草案</b
          ><small>左侧创建后，这里会显示审批门与完整生产来源链。</small>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.planning-console {
  display: grid;
  gap: 20px;
  color: #14251e;
}
.dispatch-head {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 24px;
  padding: 30px;
  color: #f7f1e3;
  background: #142820;
  border-bottom: 6px solid #e6672f;
  box-shadow: 10px 10px 0 #d9d2c1;
}
.dispatch-head h1 {
  margin: 8px 0;
  font:
    600 clamp(2rem, 4vw, 4rem)/1 STZhongsong,
    SimSun,
    serif;
}
.dispatch-head > div:first-child > p:last-child {
  margin: 0;
  color: #b9c4bc;
}
.dispatch-rule {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
  font:
    700 10px Consolas,
    monospace;
}
.dispatch-rule span {
  padding: 8px 10px;
  border: 1px solid #687b71;
}
.dispatch-rule b {
  color: #f0a45f;
}
.dispatch-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.12fr) minmax(340px, 0.88fr);
  gap: 18px;
}
.dispatch-card {
  min-width: 0;
  padding: 22px;
  border: 1px solid #45594e;
  background: rgba(255, 253, 247, 0.86);
}
.dispatch-card > header {
  display: flex;
  gap: 14px;
  align-items: start;
  border-bottom: 2px solid #142820;
  margin-bottom: 18px;
}
.dispatch-card > header > span {
  color: #d25521;
  font:
    700 3rem/1 Georgia,
    serif;
}
.dispatch-card h2 {
  margin: 2px 0 14px;
  font:
    600 1.65rem STZhongsong,
    SimSun,
    serif;
}
.dispatch-card header small {
  color: #65746c;
  font:
    700 10px Consolas,
    monospace;
  letter-spacing: 0.14em;
}
.planning-form {
  display: grid;
  gap: 14px;
}
.planning-form fieldset {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin: 0;
  padding: 14px;
  border: 1px dashed #849087;
}
.planning-form legend {
  padding: 0 8px;
  color: #a54218;
  font-size: 12px;
  font-weight: 900;
}
.planning-form label {
  display: grid;
  gap: 5px;
  color: #4a5c53;
  font-size: 11px;
  font-weight: 800;
}
.planning-form input,
.plan-query input {
  width: 100%;
  min-width: 0;
  height: 42px;
  padding: 0 10px;
  color: #142820;
  background: #fff;
  border: 1px solid #9aa49e;
  border-radius: 0;
}
.planning-form input:focus,
.plan-query input:focus {
  border-color: #e6672f;
  box-shadow: inset 4px 0 #e6672f;
  outline: 0;
}
.span-two {
  grid-column: 1 / -1;
}
.dispatch-action,
.approve-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 50px;
  padding: 0 17px;
  color: #fff;
  background: #d25521;
  border: 0;
  font-weight: 900;
  box-shadow: 6px 6px 0 #142820;
  cursor: pointer;
}
.dispatch-action:disabled,
.approve-action:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}
.status-card {
  background: #e7ece3;
}
.plan-query {
  display: flex;
  margin-bottom: 16px;
}
.plan-query button {
  color: #fff;
  background: #142820;
  border: 0;
  padding: 0 14px;
  font-weight: 800;
}
.approval-banner {
  display: grid;
  grid-template-columns: 1fr auto;
  padding: 18px;
  color: #644713;
  background: #f1dfaa;
  border-left: 6px solid #cf8b25;
}
.approval-banner.approved {
  color: #174f38;
  background: #d5e8dc;
  border-color: #3c8765;
}
.approval-banner small,
.approval-banner strong {
  grid-column: 1;
}
.approval-banner strong {
  font:
    700 2rem STZhongsong,
    SimSun,
    serif;
}
.approval-banner span {
  grid-row: 1 / 3;
  grid-column: 2;
  align-self: center;
  font:
    700 11px Consolas,
    monospace;
}
.schedule-ticket {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  margin: 16px 0;
  border: 1px solid #87938b;
}
.schedule-ticket div {
  min-width: 0;
  padding: 11px;
  border: 1px solid #c4ccc6;
}
.schedule-ticket dt {
  color: #617168;
  font-size: 10px;
  font-weight: 900;
}
.schedule-ticket dd {
  margin: 5px 0 0;
  overflow-wrap: anywhere;
  font-weight: 800;
}
.schedule-ticket code {
  font-size: 10px;
}
.work-order-gate {
  display: grid;
  gap: 4px;
  padding: 15px;
  color: #762f1d;
  background: repeating-linear-gradient(135deg, #f6dcd3, #f6dcd3 10px, #fbe8e0 10px, #fbe8e0 20px);
  border: 1px solid #be7158;
}
.work-order-gate.open {
  color: #174f38;
  background: #d7eadf;
  border-color: #71a58a;
}
.work-order-gate small {
  font-size: 11px;
}
.approve-action {
  width: 100%;
  margin-top: 16px;
  background: #142820;
  box-shadow: 6px 6px 0 #d25521;
}
.empty-schedule {
  min-height: 360px;
  display: grid;
  place-content: center;
  text-align: center;
  color: #68776f;
}
.empty-schedule span {
  color: #d25521;
  font-size: 5rem;
  line-height: 1;
}
.empty-schedule b {
  color: #273a31;
  font:
    600 1.4rem STZhongsong,
    SimSun,
    serif;
}
.empty-schedule small {
  max-width: 280px;
  margin-top: 8px;
}
.planning-error {
  display: grid;
  gap: 4px;
  padding: 13px 16px;
  color: #7c2f17;
  background: #fae0d5;
  border-left: 5px solid #bd431b;
}
@media (max-width: 980px) {
  .dispatch-head,
  .dispatch-grid {
    display: grid;
    grid-template-columns: 1fr;
  }
}
@media (max-width: 620px) {
  .dispatch-head {
    padding: 22px;
  }
  .planning-form fieldset,
  .schedule-ticket {
    grid-template-columns: 1fr;
  }
  .span-two {
    grid-column: auto;
  }
}
</style>
