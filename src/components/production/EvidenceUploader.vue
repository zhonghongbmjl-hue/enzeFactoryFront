<script setup lang="ts">
import { computed, ref } from 'vue'
import { productionEvidenceApi } from '@/api/production'
import type { EvidenceReference, TemporaryEvidenceUpload } from '@/types/production'

defineOptions({ name: 'EvidenceUploader' })
const props = defineProps<{ workOrderId: string; disabled?: boolean }>()
interface EvidenceUploadState {
  selectedCount: number
  readyCount: number
  pendingCount: number
  hasError: boolean
}
const emit = defineEmits<{
  'update:uploads': [value: EvidenceReference[]]
  'update:state': [value: EvidenceUploadState]
}>()

interface UploadRow extends TemporaryEvidenceUpload {
  localId: string
  progress: number
  state: 'uploading' | 'ready' | 'error'
  error?: string
}

const rows = ref<UploadRow[]>([])
const busy = ref(false)
const errorMessage = ref('')
let generation = 0
let localSequence = 0
const controllers = new Map<string, AbortController>()
const ready = computed(() => rows.value.filter((row) => row.state === 'ready'))

async function selectFiles(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (!files.length || busy.value || props.disabled) return
  if (rows.value.length + files.length > 12) {
    errorMessage.value = '单次自检最多 12 张图片。'
    return
  }
  const requestGeneration = ++generation
  busy.value = true
  errorMessage.value = ''
  const batch = files.map((file) => {
    try {
      validateLocal(file)
      const localId = `${file.name}-${file.size}-${file.lastModified}-${++localSequence}`
      const row: UploadRow = {
        localId,
        tempObjectKey: '',
        sha256: '',
        contentType: file.type,
        sizeBytes: file.size,
        originalFilename: file.name,
        progress: 0,
        state: 'uploading',
      }
      rows.value.push(row)
      return { file, row }
    } catch (error) {
      const localId = `${file.name}-${file.size}-${file.lastModified}-${++localSequence}`
      const row: UploadRow = {
        localId,
        tempObjectKey: '',
        sha256: '',
        contentType: file.type,
        sizeBytes: file.size,
        originalFilename: file.name,
        progress: 0,
        state: 'error',
        error: error instanceof Error ? error.message : '图片校验失败',
      }
      rows.value.push(row)
      return { file, row }
    }
  })
  publish()
  await Promise.all(
    batch.map(async ({ file, row }) => {
      if (row.state === 'error') return
      const controller = new AbortController()
      controllers.set(row.localId, controller)
      try {
        const sha256 = await digest(file)
        const uploaded = await productionEvidenceApi.upload(
          props.workOrderId,
          file,
          sha256,
          (percent) => {
            const active = rows.value.find((value) => value.localId === row.localId)
            if (requestGeneration === generation && active) active.progress = percent
          },
          controller.signal,
        )
        if (requestGeneration !== generation || controller.signal.aborted) {
          bestEffortCleanup(uploaded.tempObjectKey)
          return
        }
        const active = rows.value.find((value) => value.localId === row.localId)
        if (!active) return
        Object.assign(active, uploaded, { progress: 100, state: 'ready' as const })
        publish()
      } catch (error) {
        if (requestGeneration !== generation || controller.signal.aborted) return
        const active = rows.value.find((value) => value.localId === row.localId)
        if (!active) return
        active.state = 'error'
        active.error = error instanceof Error ? error.message : '上传失败'
        publish()
      } finally {
        controllers.delete(row.localId)
      }
    }),
  )
  if (requestGeneration === generation) {
    busy.value = false
    publish()
  }
}

function remove(localId: string): void {
  if (props.disabled) return
  const row = rows.value.find((value) => value.localId === localId)
  controllers.get(localId)?.abort()
  controllers.delete(localId)
  rows.value = rows.value.filter((row) => row.localId !== localId)
  busy.value = rows.value.some((value) => value.state === 'uploading')
  publish()
  if (row?.state === 'ready') {
    bestEffortCleanup(row.tempObjectKey)
  }
}

function clear(deleteRemote = true): void {
  generation += 1
  controllers.forEach((controller) => controller.abort())
  controllers.clear()
  const consumed = rows.value.filter((row) => row.state === 'ready')
  rows.value = []
  busy.value = false
  errorMessage.value = ''
  publish()
  if (deleteRemote) {
    consumed.forEach((row) => {
      bestEffortCleanup(row.tempObjectKey)
    })
  }
}

function bestEffortCleanup(tempObjectKey: string): void {
  void productionEvidenceApi
    .removeTemporary(props.workOrderId, tempObjectKey)
    .catch(() => undefined)
}

function publish(): void {
  emit(
    'update:uploads',
    ready.value.map((row) => ({ tempObjectKey: row.tempObjectKey, sha256: row.sha256 })),
  )
  emit('update:state', {
    selectedCount: rows.value.length,
    readyCount: ready.value.length,
    pendingCount: rows.value.filter((row) => row.state === 'uploading').length,
    hasError: rows.value.some((row) => row.state === 'error'),
  })
}

function validateLocal(file: File): void {
  const extension = file.name.toLowerCase().match(/\.(jpg|jpeg|png|webp)$/)?.[1]
  const mimeByExtension: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  }
  if (!extension || mimeByExtension[extension] !== file.type) {
    throw new Error('仅支持扩展名与类型一致的 JPG、PNG、WEBP 图片。')
  }
  if (file.size <= 0 || file.size > 10 * 1024 * 1024) {
    throw new Error('单张图片必须小于 10 MB。')
  }
}

async function digest(file: File): Promise<string> {
  const result = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(result), (value) => value.toString(16).padStart(2, '0')).join('')
}

defineExpose({ clear, selectFiles })
</script>

<template>
  <section class="evidence-uploader" :aria-busy="busy">
    <label class="drop-zone" :class="{ disabled: disabled || busy }">
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        multiple
        :disabled="disabled || busy"
        @change="selectFiles"
      />
      <span class="index">EVIDENCE / 01</span>
      <strong>{{ busy ? '正在校验并上传…' : '添加过程证据图片' }}</strong>
      <small>JPG · PNG · WEBP / 单张 ≤ 10 MB / 最多 12 张</small>
    </label>

    <ul v-if="rows.length" class="upload-ledger">
      <li v-for="row in rows" :key="row.localId" :class="row.state">
        <div>
          <b>{{ row.originalFilename }}</b>
          <small v-if="row.state === 'ready'">SHA-256 {{ row.sha256.slice(0, 12) }}…</small>
          <small v-else-if="row.error">{{ row.error }}</small>
          <small v-else>上传 {{ row.progress }}%</small>
        </div>
        <i :style="{ '--progress': `${row.progress}%` }" />
        <button type="button" :disabled="disabled" @click="remove(row.localId)">移除</button>
      </li>
    </ul>
    <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
  </section>
</template>

<style scoped>
.evidence-uploader {
  display: grid;
  gap: 10px;
}
.drop-zone {
  display: grid;
  gap: 4px;
  min-height: 118px;
  align-content: center;
  padding: 18px;
  border: 1px dashed #79938d;
  border-radius: 12px;
  background: repeating-linear-gradient(135deg, #f5f7f2, #f5f7f2 12px, #eef2ec 12px, #eef2ec 13px);
  cursor: pointer;
}
.drop-zone:hover {
  border-color: #c18b30;
  box-shadow: inset 4px 0 #d7a94d;
}
.drop-zone.disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.drop-zone input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}
.index {
  color: #8a682a;
  font:
    700 10px 'Cascadia Mono',
    monospace;
  letter-spacing: 0.12em;
}
.drop-zone strong {
  color: #18383d;
  font-size: 17px;
}
.drop-zone small {
  color: #667c77;
}
.upload-ledger {
  display: grid;
  gap: 7px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.upload-ledger li {
  position: relative;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  padding: 11px 12px 14px;
  overflow: hidden;
  border: 1px solid #d7dfdb;
  border-radius: 9px;
  background: #fff;
}
.upload-ledger b,
.upload-ledger small {
  display: block;
}
.upload-ledger small {
  margin-top: 3px;
  color: #70817d;
  font-family: 'Cascadia Mono', monospace;
}
.upload-ledger i {
  position: absolute;
  bottom: 0;
  left: 0;
  width: var(--progress);
  height: 3px;
  background: #d7a94d;
  transition: width 0.2s ease;
}
.upload-ledger .ready i {
  background: #2f766b;
}
.upload-ledger .error i {
  background: #b5493f;
}
button {
  border: 0;
  background: transparent;
  color: #8b3a33;
  font-weight: 750;
  cursor: pointer;
}
.error {
  margin: 0;
  color: #9b2f29;
}
</style>
