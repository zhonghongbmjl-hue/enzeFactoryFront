<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { createIdempotencyAttempt } from '@/api/http'
import { productionApi, productionEvidenceApi } from '@/api/production'
import type {
  ProcessInspectionView,
  ProductionCompletion,
  ProductionCompletionInput,
  WorkOrder,
} from '@/types/production'

const props = defineProps<{ workOrder: WorkOrder }>()
const emit = defineEmits<{ completed: [value: ProductionCompletion] }>()
const inspection = ref<ProcessInspectionView | null>(null)
const loading = ref(false)
const pending = ref(false)
const message = ref('')
const errorMessage = ref('')
const attempt = createIdempotencyAttempt()
const form = reactive({ startQuantity: '0.000000', endQuantity: '0.000000' })
let loadSequence = 0
let completionSequence = 0

const reasons = computed(() => {
  const result: string[] = []
  if (props.workOrder.status !== 'IN_PRODUCTION') result.push('工单必须处于生产中')
  if (!inspection.value) result.push('尚无可选择的过程初检')
  if (inspection.value?.result !== 'PASSED') result.push('所选初检不是通过版本')
  if (inspection.value && !inspection.value.coverageVerified) result.push('检查覆盖事实未验证')
  if (inspection.value?.failedQuantity !== '0.000000') result.push('检查仍含失败数量')
  if (inspection.value && inspection.value.manifest.objects.length < 1)
    result.push('冻结证据至少需要一张图片')
  return result
})

async function loadInspection(): Promise<void> {
  const requestId = ++loadSequence
  loading.value = true
  errorMessage.value = ''
  try {
    const latest = await productionEvidenceApi.latest(props.workOrder.id)
    if (requestId !== loadSequence) return
    inspection.value = latest
    form.endQuantity = latest?.passedQuantity ?? '0.000000'
  } catch (error) {
    if (requestId === loadSequence)
      errorMessage.value = error instanceof Error ? error.message : '检查事实加载失败'
  } finally {
    if (requestId === loadSequence) loading.value = false
  }
}

async function complete(): Promise<void> {
  if (pending.value || reasons.value.length || !inspection.value) return
  const currentInspection = inspection.value
  const input: ProductionCompletionInput = {
    inspectionId: currentInspection.id,
    manifestId: currentInspection.manifest.id,
    startQuantity: form.startQuantity,
    endQuantity: form.endQuantity,
    version: props.workOrder.version,
  }
  const requestId = ++completionSequence
  pending.value = true
  message.value = ''
  errorMessage.value = ''
  try {
    const response = await productionApi.complete(props.workOrder.id, input, attempt.keyFor(input))
    if (requestId !== completionSequence) return
    attempt.succeeded()
    message.value =
      response.outcome === 'READY_TO_COMPLETE'
        ? '良品范围已完整覆盖，工单进入待完工'
        : '本段良品范围已登记，仍需补齐其余连续范围'
    emit('completed', response)
  } catch (error) {
    if (requestId === completionSequence) {
      attempt.failed(error)
      errorMessage.value = error instanceof Error ? error.message : '生产完工登记失败'
    }
  } finally {
    if (requestId === completionSequence) pending.value = false
  }
}

watch(
  () => props.workOrder.id,
  () => {
    completionSequence += 1
    pending.value = false
    message.value = ''
    errorMessage.value = ''
    attempt.succeeded()
    void loadInspection()
  },
)
onMounted(loadInspection)
onBeforeUnmount(() => {
  loadSequence += 1
  completionSequence += 1
  pending.value = false
})
defineExpose({ refresh: loadInspection })
</script>

<template>
  <section class="completion-gate" aria-labelledby="completion-gate-heading">
    <header>
      <div>
        <p class="eyebrow">PRODUCTION COMPLETION</p>
        <h2 id="completion-gate-heading">良品范围完工门禁</h2>
      </div>
      <span :class="reasons.length ? 'blocked' : 'ready'">
        {{ reasons.length ? '门禁未满足' : '可登记范围' }}
      </span>
    </header>
    <p v-if="loading">正在核对不可变检查版本…</p>
    <div v-else-if="inspection" class="facts">
      <strong>检查版本 #{{ inspection.inspectionVersion }}</strong>
      <span>{{ inspection.result }} · 覆盖 {{ inspection.passedQuantity }}</span>
      <span>证据对象 {{ inspection.manifest.objects.length }} 个</span>
      <code>manifest {{ inspection.manifest.id }}</code>
    </div>
    <ul v-if="reasons.length" class="reasons">
      <li v-for="reason in reasons" :key="reason">{{ reason }}</li>
    </ul>
    <form data-testid="completion-form" @submit.prevent="complete">
      <label>
        起始良品量（含）
        <el-input v-model="form.startQuantity" name="startQuantity" inputmode="decimal" />
      </label>
      <label>
        结束良品量（不含）
        <el-input v-model="form.endQuantity" name="endQuantity" inputmode="decimal" />
      </label>
      <el-button
        type="primary"
        native-type="submit"
        :disabled="pending || loading || reasons.length > 0"
      >
        {{ pending ? '正在复验精确证据版本…' : '锁定范围并登记完工' }}
      </el-button>
    </form>
    <p v-if="message" class="success">{{ message }}</p>
    <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
    <small>服务端会重新 HEAD 每个精确对象版本；浏览器不接触证据桶凭据。</small>
  </section>
</template>

<style scoped>
.completion-gate {
  display: grid;
  gap: 14px;
  padding: 20px;
  border: 1px solid #ccd9d5;
  border-radius: 16px;
  background: linear-gradient(135deg, #f7fbf8, #fff9e8);
  color: #19383a;
}
header,
form,
.facts {
  display: flex;
  align-items: end;
  gap: 12px;
}
header {
  justify-content: space-between;
}
h2,
.eyebrow {
  margin: 0;
}
.eyebrow {
  color: #6f827d;
  font:
    700 11px 'Cascadia Mono',
    monospace;
  letter-spacing: 0.12em;
}
header > span {
  padding: 7px 10px;
  border-radius: 999px;
  font-weight: 800;
}
.ready {
  background: #d9eee3;
  color: #17613e;
}
.blocked {
  background: #fbe5d7;
  color: #8a3e24;
}
.facts {
  align-items: center;
  flex-wrap: wrap;
}
.facts code {
  color: #62736f;
  font-size: 11px;
}
form {
  align-items: end;
  flex-wrap: wrap;
}
label {
  display: grid;
  gap: 5px;
  font-size: 12px;
  font-weight: 750;
}
.reasons,
.error {
  color: #8d352d;
}
.success {
  color: #17613e;
  font-weight: 750;
}
@media (max-width: 680px) {
  header,
  form {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
