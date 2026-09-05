<script setup lang="ts">
import SelectField from '@/components/form/SelectField.vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import EvidenceUploader from '@/components/production/EvidenceUploader.vue'
import { productionEvidenceApi } from '@/api/production'
import { createIdempotencyAttempt } from '@/api/http'
import type { EvidenceReference, ProcessInspectionView, WorkOrderStatus } from '@/types/production'

const props = defineProps<{ workOrderId: string; workOrderStatus: WorkOrderStatus }>()
const emit = defineEmits<{ 'inspection-updated': [] }>()
const latestInspection = ref<ProcessInspectionView | null>(null)
const uploads = ref<EvidenceReference[]>([])
const uploadState = ref({ selectedCount: 0, readyCount: 0, pendingCount: 0, hasError: false })
const evidenceUploader = ref<InstanceType<typeof EvidenceUploader> | null>(null)
const inspector = ref('')
const remarks = ref('')
const result = ref<'PASSED' | 'FAILED'>('PASSED')
const correctionDescription = ref('')
const loading = ref(false)
const submitting = ref(false)
const correctionPending = ref(false)
const errorMessage = ref('')
const submitAttempt = createIdempotencyAttempt()
const correctionAttempt = createIdempotencyAttempt()
const completionAttempt = createIdempotencyAttempt()
let sequence = 0

const canInspect = computed(() =>
  ['RELEASED', 'IN_PRODUCTION', 'PROCESS_INSPECTION'].includes(props.workOrderStatus),
)
const correctionRequired = computed(
  () => latestInspection.value?.result === 'FAILED' && !latestInspection.value.correction,
)
const correctionOpen = computed(() => latestInspection.value?.correction?.status === 'OPEN')
const canSubmit = computed(
  () =>
    canInspect.value &&
    uploads.value.length > 0 &&
    uploadState.value.selectedCount === uploads.value.length &&
    uploadState.value.readyCount === uploads.value.length &&
    uploadState.value.pendingCount === 0 &&
    !uploadState.value.hasError &&
    inspector.value.trim().length > 0 &&
    !submitting.value &&
    !correctionRequired.value &&
    !correctionOpen.value,
)

async function refresh(): Promise<void> {
  const requestId = ++sequence
  loading.value = true
  errorMessage.value = ''
  try {
    const response = await productionEvidenceApi.latest(props.workOrderId)
    if (requestId === sequence) latestInspection.value = response
  } catch (error) {
    if (requestId === sequence) {
      errorMessage.value = error instanceof Error ? error.message : '过程自检读取失败'
    }
  } finally {
    if (requestId === sequence) loading.value = false
  }
}

async function submitInspection(): Promise<void> {
  if (!canSubmit.value) return
  const payload = {
    result: result.value,
    images: uploads.value,
    inspector: inspector.value.trim(),
    ...(remarks.value.trim() ? { remarks: remarks.value.trim() } : {}),
  }
  const requestId = ++sequence
  submitting.value = true
  errorMessage.value = ''
  try {
    await productionEvidenceApi.submit(props.workOrderId, payload, submitAttempt.keyFor(payload))
    submitAttempt.succeeded()
    evidenceUploader.value?.clear(false)
    if (requestId === sequence) {
      await refresh()
      emit('inspection-updated')
    }
  } catch (error) {
    submitAttempt.failed(error)
    if (requestId === sequence) {
      errorMessage.value = error instanceof Error ? error.message : '过程自检提交失败'
    }
  } finally {
    submitting.value = false
  }
}

async function createCorrection(): Promise<void> {
  const inspection = latestInspection.value
  const description = correctionDescription.value.trim()
  if (!inspection || !correctionRequired.value || !description || correctionPending.value) return
  const payload = { inspectionId: inspection.id, description }
  const requestId = ++sequence
  correctionPending.value = true
  errorMessage.value = ''
  try {
    await productionEvidenceApi.createCorrection(
      props.workOrderId,
      inspection.id,
      description,
      correctionAttempt.keyFor(payload),
    )
    correctionAttempt.succeeded()
    if (requestId === sequence) await refresh()
  } catch (error) {
    correctionAttempt.failed(error)
    if (requestId === sequence) {
      errorMessage.value = error instanceof Error ? error.message : '纠正记录创建失败'
    }
  } finally {
    correctionPending.value = false
  }
}

async function completeCorrection(): Promise<void> {
  const correction = latestInspection.value?.correction
  if (!correction || correction.status !== 'OPEN' || correctionPending.value) return
  const payload = { correctionId: correction.id, version: correction.version }
  const requestId = ++sequence
  correctionPending.value = true
  errorMessage.value = ''
  try {
    await productionEvidenceApi.completeCorrection(
      props.workOrderId,
      correction.id,
      correction.version,
      completionAttempt.keyFor(payload),
    )
    completionAttempt.succeeded()
    if (requestId === sequence) await refresh()
  } catch (error) {
    completionAttempt.failed(error)
    if (requestId === sequence) {
      errorMessage.value = error instanceof Error ? error.message : '纠正完成失败'
    }
  } finally {
    correctionPending.value = false
  }
}

defineExpose({ refresh, submitInspection })
onMounted(refresh)
onBeforeUnmount(() => {
  sequence += 1
  submitting.value = false
  correctionPending.value = false
})
</script>

<template>
  <section class="inspection-panel">
    <header class="panel-heading">
      <div>
        <small>PROCESS GATE / IMMUTABLE EVIDENCE</small>
        <h2>过程自检与证据冻结</h2>
      </div>
      <span v-if="latestInspection" :class="['status', latestInspection.result.toLowerCase()]">
        {{ latestInspection.result === 'PASSED' ? '已通过' : '未通过' }} · V{{
          latestInspection.inspectionVersion
        }}
      </span>
      <span v-else class="status pending">待自检</span>
    </header>

    <div v-if="latestInspection" class="latest-card">
      <div>
        <small>巡检人</small><b>{{ latestInspection.inspector }}</b>
      </div>
      <div>
        <small>冻结对象</small><b>{{ latestInspection.manifest.objects.length }} 张</b>
      </div>
      <div>
        <small>清单摘要</small
        ><code>{{ latestInspection.manifest.aggregateSha256.slice(0, 16) }}…</code>
      </div>
      <p v-if="latestInspection.remarks">{{ latestInspection.remarks }}</p>
    </div>

    <div v-if="correctionRequired" class="correction-box">
      <b>上版自检未通过，必须先登记纠正措施</b>
      <el-input
        v-model="correctionDescription"
        type="textarea"
        maxlength="500"
        placeholder="说明设备、工艺或人员纠正措施"
      />
      <el-button
        type="primary"
        :disabled="correctionPending || !correctionDescription.trim()"
        @click="createCorrection"
      >
        登记纠正
      </el-button>
    </div>
    <div v-else-if="correctionOpen" class="correction-box open">
      <b>纠正执行中</b>
      <p>{{ latestInspection?.correction?.description }}</p>
      <el-button type="primary" :disabled="correctionPending" @click="completeCorrection">
        确认纠正完成
      </el-button>
    </div>

    <div v-if="canInspect" class="inspection-workspace">
      <EvidenceUploader
        ref="evidenceUploader"
        :work-order-id="workOrderId"
        :disabled="submitting || correctionRequired || correctionOpen"
        @update:uploads="uploads = $event"
        @update:state="uploadState = $event"
      />
      <div class="inspection-form">
        <label
          >判定
          <SelectField
            v-model="result"
            aria-label="巡检判定"
            :options="[
              { label: '通过', value: 'PASSED' },
              { label: '不通过', value: 'FAILED' },
            ]"
          />
        </label>
        <label>巡检人<el-input v-model.trim="inspector" name="inspector" maxlength="120" /></label>
        <label class="wide"
          >备注
          <el-input
            v-model.trim="remarks"
            type="textarea"
            maxlength="500"
            placeholder="记录部位、工序和观察结果"
          />
        </label>
        <p>上传对象只进入租户临时区；提交后由服务端复验并冻结，浏览器不会获得证据桶写入凭据。</p>
        <el-button
          data-testid="inspection-submit"
          type="primary"
          :disabled="!canSubmit"
          @click="submitInspection"
        >
          {{ submitting ? '冻结中…' : '提交并冻结证据' }}
        </el-button>
      </div>
    </div>
    <p v-else class="locked">工单下达后才可开展过程自检。</p>
    <p v-if="loading">自检事实读取中…</p>
    <el-alert
      v-if="errorMessage"
      :title="errorMessage"
      type="error"
      :closable="false"
      show-icon
      role="alert"
    />
  </section>
</template>

<style scoped>
.inspection-panel {
  display: grid;
  gap: 14px;
  padding: 20px;
  border: 1px solid #cbd8d3;
  border-radius: 14px;
  background: #fbfcf8;
  box-shadow: 0 8px 25px rgb(30 60 55 / 7%);
}
.panel-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid #dbe3df;
  padding-bottom: 13px;
}
.panel-heading small {
  color: #8b6828;
  font:
    700 10px 'Cascadia Mono',
    monospace;
  letter-spacing: 0.12em;
}
.panel-heading h2 {
  margin: 4px 0 0;
  color: #18383d;
  font-size: 22px;
}
.status {
  padding: 7px 10px;
  border-radius: 999px;
  font-weight: 800;
  font-size: 12px;
}
.status.passed {
  background: #dcefe6;
  color: #21665c;
}
.status.failed {
  background: #f9dfda;
  color: #9a3731;
}
.status.pending {
  background: #ece9df;
  color: #6d6759;
}
.latest-card {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  padding: 13px;
  border-left: 4px solid #2f766b;
  background: #eef5f1;
}
.latest-card small,
.latest-card b {
  display: block;
}
.latest-card small {
  color: #6a7c77;
}
.latest-card p {
  grid-column: 1 / -1;
  margin: 0;
}
.inspection-workspace {
  display: grid;
  grid-template-columns: minmax(300px, 1fr) minmax(320px, 1fr);
  gap: 14px;
}
.inspection-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  align-content: start;
}
label {
  display: grid;
  gap: 5px;
  color: #334f4e;
  font-size: 12px;
  font-weight: 750;
}
.wide,
.inspection-form p,
.inspection-form button {
  grid-column: 1 / -1;
}
.inspection-form p {
  margin: 0;
  color: #657874;
  font-size: 12px;
}
.correction-box {
  display: grid;
  gap: 9px;
  padding: 13px;
  border: 1px solid #e2a79c;
  border-radius: 9px;
  background: #fff0ed;
}
.correction-box.open {
  border-color: #d6bd75;
  background: #fff8df;
}
.correction-box p {
  margin: 0;
}
.locked,
.error {
  margin: 0;
  padding: 11px;
  border-radius: 8px;
}
.locked {
  background: #edf0ee;
  color: #66716e;
}
.error {
  background: #fff0ed;
  color: #9b2f29;
}
@media (max-width: 900px) {
  .inspection-workspace {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 560px) {
  .latest-card {
    grid-template-columns: 1fr;
  }
  .inspection-form {
    grid-template-columns: 1fr;
  }
  .panel-heading {
    flex-direction: column;
  }
}
</style>
