<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { productApi } from '@/api/products'
import { ApiClientError } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import type { Product, ProductInput, ProductStatus } from '@/types/product'

const auth = useAuthStore()
const router = useRouter()
const rows = ref<Product[]>([])
const loading = ref(false)
const page = ref(1)
const size = ref(20)
const total = ref(0)
const query = ref('')
const status = ref<'' | ProductStatus>('')
const drawer = ref(false)
const failure = reactive({ message: '', traceId: '' })
const form = reactive<ProductInput>({ styleNo: '', name: '' })
const canManage = computed(() => auth.permissions.has('PRODUCT_MANAGE'))

async function load(): Promise<void> {
  loading.value = true
  failure.message = ''
  try {
    const result = await productApi.list({
      page: page.value - 1,
      size: size.value,
      sort: 'styleNo,asc',
      ...(query.value ? { query: query.value } : {}),
      ...(status.value ? { status: status.value } : {}),
    })
    rows.value = result.content
    total.value = result.totalElements
  } catch (error) {
    const candidate = error as Partial<ApiClientError>
    failure.message = candidate.message || '产品资料加载失败'
    failure.traceId = candidate.traceId || ''
  } finally {
    loading.value = false
  }
}

function openCreate(): void {
  Object.assign(form, { styleNo: '', name: '', brand: '', series: '', category: '', season: '' })
  drawer.value = true
}

async function create(): Promise<void> {
  try {
    const created = await productApi.create({ ...form, styleNo: form.styleNo.trim().toUpperCase() })
    drawer.value = false
    ElMessage.success('产品草稿已创建')
    await router.push({ name: 'product-detail', params: { id: created.id } })
  } catch (error) {
    const candidate = error as Partial<ApiClientError>
    failure.message = candidate.message || '产品创建失败'
    failure.traceId = candidate.traceId || ''
  }
}

watch([status, size], () => {
  page.value = 1
  void load()
})
onMounted(load)
</script>

<template>
  <section class="product-page">
    <header class="product-heading">
      <div>
        <p class="eyebrow">PATTERN LIBRARY / 款式主档</p>
        <h1>产品纸样台账</h1>
        <p>款号、SKU矩阵与生效BOM在这里形成可审计的生产基线。</p>
      </div>
      <button
        v-if="canManage"
        data-testid="create-product"
        class="primary-action compact"
        type="button"
        @click="openCreate"
      >
        <span>新建产品草稿</span><b>＋</b>
      </button>
    </header>

    <div class="pattern-ruler" aria-hidden="true">
      <span v-for="n in 12" :key="n">{{ n }}</span>
    </div>
    <div class="product-toolbar">
      <label
        >检索<input v-model="query" maxlength="120" placeholder="款号 / 品名" @keyup.enter="load"
      /></label>
      <label
        >状态<select v-model="status" aria-label="产品状态">
          <option value="">全部</option>
          <option value="DRAFT">草稿</option>
          <option value="ACTIVE">已上架</option>
          <option value="INACTIVE">已停用</option>
        </select></label
      >
      <button class="outline-action" type="button" @click="load">查询</button>
    </div>

    <div v-if="failure.message" class="master-error" role="alert">
      <b>{{ failure.message }}</b
      ><span v-if="failure.traceId">追踪号 {{ failure.traceId }}</span>
    </div>

    <div class="product-ledger" :aria-busy="loading">
      <table class="product-table">
        <thead>
          <tr>
            <th>款号</th>
            <th>品名 / 品牌</th>
            <th>系列 / 季节</th>
            <th>版型</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td data-label="款号">
              <code>{{ row.styleNo }}</code>
            </td>
            <td data-label="品名 / 品牌">
              <b>{{ row.name }}</b
              ><small>{{ row.brand || '—' }}</small>
            </td>
            <td data-label="系列 / 季节">{{ row.series || '—' }} / {{ row.season || '—' }}</td>
            <td data-label="版型">{{ row.fit || '未定义' }}</td>
            <td data-label="状态">
              <span class="product-state" :class="row.status.toLowerCase()">{{ row.status }}</span>
            </td>
            <td data-label="操作">
              <RouterLink :to="{ name: 'product-detail', params: { id: row.id } }"
                >查看纸样 →</RouterLink
              >
            </td>
          </tr>
          <tr v-if="!loading && rows.length === 0">
            <td colspan="6" class="empty-cell">暂无产品纸样</td>
          </tr>
        </tbody>
      </table>
    </div>
    <footer class="pager">
      <span>共 {{ total }} 款</span
      ><el-pagination
        v-model:current-page="page"
        v-model:page-size="size"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="prev, pager, next, sizes"
        @current-change="load"
      />
    </footer>

    <el-drawer v-model="drawer" title="新建产品草稿" size="min(560px, 94vw)">
      <form class="master-form" @submit.prevent="create">
        <label>款号<input v-model="form.styleNo" required maxlength="40" /></label>
        <label>品名<input v-model="form.name" required maxlength="120" /></label>
        <label>品牌<input v-model="form.brand" maxlength="80" /></label>
        <label>系列<input v-model="form.series" maxlength="80" /></label>
        <label>类别<input v-model="form.category" maxlength="80" /></label>
        <label>季节<input v-model="form.season" maxlength="40" /></label>
        <label
          >目标价格<input v-model.number="form.targetPrice" type="number" min="0" step="0.01"
        /></label>
        <label>版型<input v-model="form.fit" maxlength="80" /></label>
        <button class="primary-action" type="submit"><span>建立产品主档</span><b>→</b></button>
      </form>
    </el-drawer>
  </section>
</template>
