<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { bomApi } from '@/api/products'
import { masterDataApi } from '@/api/masterdata'
import { ApiClientError } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import type { BomVersion } from '@/types/product'
import type { MasterDataOption } from '@/types/masterdata'

interface DraftItem {
  materialId: string
  materialCode: string
  materialName: string
  usage: number
  lossRate: number
}

const props = defineProps<{ bomId?: string }>()
const route = useRoute()
const auth = useAuthStore()
const bom = ref<BomVersion>()
const failure = ref('')
const traceId = ref('')
const materialOptions = ref<MasterDataOption[]>([])
const materialQuery = ref('')
const materialLoading = ref(false)
const pendingAction = ref('')
let materialSearchGeneration = 0
const draftItems = ref<DraftItem[]>([])
const id = computed(() => props.bomId || String(route.params.bomId || ''))
const canManage = computed(() => auth.permissions.has('PRODUCT_MANAGE'))
const canApprove = computed(() => auth.permissions.has('PRODUCT_APPROVE'))

async function load(): Promise<void> {
  if (!id.value) return
  try {
    const result = await bomApi.get(id.value)
    if (result) {
      bom.value = result
      draftItems.value = result.items.map((item) => ({
        materialId: item.materialId,
        materialCode: item.materialCode,
        materialName: item.materialName,
        usage: Number(item.usage),
        lossRate: Number(item.lossRate),
      }))
      if (result.status === 'DRAFT' && canManage.value) {
        await searchMaterials()
      }
    }
  } catch (error) {
    const candidate = error as Partial<ApiClientError>
    failure.value = candidate.message || 'BOM加载失败'
    traceId.value = candidate.traceId || ''
  }
}

async function searchMaterials(): Promise<void> {
  const generation = ++materialSearchGeneration
  const query = materialQuery.value.trim()
  if (!query) {
    materialOptions.value = []
    materialLoading.value = false
    return
  }
  materialLoading.value = true
  try {
    const found = await masterDataApi.select('materials', query, 50)
    if (generation === materialSearchGeneration) materialOptions.value = found
  } catch (error) {
    if (generation === materialSearchGeneration) report(error, '物料选项加载失败')
  } finally {
    if (generation === materialSearchGeneration) materialLoading.value = false
  }
}

function report(error: unknown, fallback: string): void {
  const candidate = error as Partial<ApiClientError>
  failure.value = candidate.message || fallback
  traceId.value = candidate.traceId || ''
}

function addItem(): void {
  const available = materialOptions.value.find(
    (material) => !draftItems.value.some((item) => item.materialId === material.id),
  )
  if (!available) {
    ElMessage.warning('没有可继续添加的启用物料')
    return
  }
  draftItems.value.push({
    materialId: available.id,
    materialCode: available.code,
    materialName: available.name,
    usage: 1,
    lossRate: 0,
  })
}

function selectMaterial(item: DraftItem): void {
  const selected = materialOptions.value.find((material) => material.id === item.materialId)
  if (selected) {
    item.materialCode = selected.code
    item.materialName = selected.name
  }
}

async function saveDraft(): Promise<void> {
  if (!bom.value || bom.value.status !== 'DRAFT') return
  try {
    bom.value = await bomApi.update(bom.value.id, {
      productId: bom.value.productId,
      versionNo: bom.value.versionNo,
      name: bom.value.name,
      version: bom.value.version,
      items: draftItems.value.map((item) => ({
        materialId: item.materialId,
        usage: Number(item.usage),
        lossRate: Number(item.lossRate),
      })),
    })
    ElMessage.success('BOM草稿已保存')
  } catch (error) {
    const candidate = error as Partial<ApiClientError>
    failure.value = candidate.message || 'BOM草稿保存失败'
    traceId.value = candidate.traceId || ''
  }
}

async function action(name: 'submit' | 'approve' | 'activate' | 'retire'): Promise<void> {
  if (!bom.value || pendingAction.value) return
  pendingAction.value = name
  try {
    bom.value = await bomApi[name](bom.value.id, bom.value.version)
    ElMessage.success('BOM状态已更新')
  } catch (error) {
    report(error, 'BOM状态更新失败')
  } finally {
    pendingAction.value = ''
  }
}
onMounted(load)
</script>

<template>
  <section class="bom-editor">
    <header class="product-heading">
      <div>
        <p class="eyebrow">MATERIAL SHEET / 物料清单</p>
        <h1>{{ bom?.name || 'BOM版本编辑器' }}</h1>
        <p>损耗率统一采用 0–1 小数；生效版本为不可修改生产快照。</p>
      </div>
      <span v-if="bom" class="product-state" :class="bom.status.toLowerCase()">{{
        bom.status
      }}</span>
    </header>
    <ol class="status-timeline">
      <li :class="{ done: !!bom }"><b>01</b><span>草稿配置</span></li>
      <li
        :class="{
          done: ['PENDING_APPROVAL', 'APPROVED', 'ACTIVE', 'RETIRED'].includes(bom?.status || ''),
        }"
      >
        <b>02</b><span>提交审核</span>
      </li>
      <li :class="{ done: ['APPROVED', 'ACTIVE', 'RETIRED'].includes(bom?.status || '') }">
        <b>03</b><span>审核通过</span>
      </li>
      <li :class="{ done: ['ACTIVE', 'RETIRED'].includes(bom?.status || '') }">
        <b>04</b><span>激活快照</span>
      </li>
    </ol>
    <div v-if="failure" class="master-error" role="alert">
      <b>{{ failure }}</b
      ><span v-if="traceId">追踪号 {{ traceId }}</span>
    </div>
    <div class="bom-sheet">
      <div
        v-if="bom?.status === 'DRAFT' && canManage"
        class="product-toolbar material-search"
        :aria-busy="materialLoading"
      >
        <label
          >检索物料<input
            v-model="materialQuery"
            placeholder="编码 / 名称"
            @keyup.enter="searchMaterials"
        /></label>
        <button
          type="button"
          class="outline-action"
          :disabled="materialLoading"
          @click="searchMaterials"
        >
          {{ materialLoading ? '查询中…' : '查询启用物料' }}
        </button>
      </div>
      <table class="product-table bom-table">
        <thead>
          <tr>
            <th>物料编码 / 名称</th>
            <th>类型</th>
            <th>规格快照</th>
            <th>单件用量</th>
            <th>损耗率</th>
            <th>计量单位 / 操作</th>
          </tr>
        </thead>
        <tbody>
          <template v-if="bom?.status === 'DRAFT' && canManage">
            <tr v-for="(item, index) in draftItems" :key="`${item.materialId}-${index}`">
              <td data-label="物料">
                <select v-model="item.materialId" aria-label="物料" @change="selectMaterial(item)">
                  <option v-for="option in materialOptions" :key="option.id" :value="option.id">
                    {{ option.code }} · {{ option.name }}
                  </option>
                </select>
              </td>
              <td data-label="类型">提交时校验</td>
              <td data-label="规格">由物料档案冻结</td>
              <td data-label="单件用量">
                <input
                  v-model.number="item.usage"
                  aria-label="单件用量"
                  type="number"
                  min="0.000001"
                  step="0.000001"
                />
              </td>
              <td data-label="损耗率">
                <input
                  v-model.number="item.lossRate"
                  aria-label="损耗率"
                  type="number"
                  min="0"
                  max="1"
                  step="0.000001"
                />
              </td>
              <td data-label="操作">
                <button type="button" class="table-action" @click="draftItems.splice(index, 1)">
                  移除
                </button>
              </td>
            </tr>
          </template>
          <template v-else>
            <tr v-for="item in bom?.items || []" :key="item.id">
              <td data-label="物料">
                <code>{{ item.materialCode }}</code
                ><small>{{ item.materialName }}</small>
              </td>
              <td data-label="类型">{{ item.materialType }}</td>
              <td data-label="规格">{{ item.specification || '—' }}</td>
              <td data-label="单件用量">
                <b>{{ item.usage }}</b>
              </td>
              <td data-label="损耗率">{{ (Number(item.lossRate) * 100).toFixed(2) }}%</td>
              <td data-label="计量单位">{{ item.uom }}</td>
            </tr>
          </template>
          <tr v-if="(bom?.status === 'DRAFT' ? draftItems.length : bom?.items.length || 0) === 0">
            <td colspan="6" class="empty-cell">草稿尚未录入物料；提交前必须包含至少一项面料。</td>
          </tr>
        </tbody>
      </table>
    </div>
    <footer class="bom-actions">
      <span v-if="bom?.status === 'ACTIVE'">🔒 ACTIVE快照已冻结，物料与表头不可原位修改。</span>
      <button
        v-if="canManage && bom?.status === 'DRAFT'"
        type="button"
        class="table-action"
        @click="addItem"
      >
        ＋ 添加物料
      </button>
      <button
        v-if="canManage && bom?.status === 'DRAFT'"
        type="button"
        class="outline-action"
        :disabled="!!pendingAction"
        @click="saveDraft"
      >
        保存草稿
      </button>
      <button
        v-if="canManage && bom?.status === 'DRAFT'"
        type="button"
        class="outline-action"
        :disabled="!!pendingAction"
        @click="action('submit')"
      >
        提交审核
      </button>
      <button
        v-if="canApprove && bom?.status === 'PENDING_APPROVAL'"
        data-testid="approve-bom"
        type="button"
        class="outline-action"
        :disabled="!!pendingAction"
        @click="action('approve')"
      >
        审核通过
      </button>
      <button
        v-if="canApprove && bom?.status === 'APPROVED'"
        type="button"
        class="primary-action compact"
        :disabled="!!pendingAction"
        @click="action('activate')"
      >
        <span>激活此版本</span><b>→</b>
      </button>
      <button
        v-if="canApprove && bom?.status === 'ACTIVE'"
        data-testid="retire-bom"
        type="button"
        class="outline-action"
        :disabled="!!pendingAction"
        @click="action('retire')"
      >
        退役此版本
      </button>
    </footer>
  </section>
</template>
