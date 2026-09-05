<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { productApi } from '@/api/products'
import { ApiClientError } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import { useProductListStore } from '@/stores/products'
import ResponsiveFilterBar from '@/components/layout/ResponsiveFilterBar.vue'
import SelectField from '@/components/form/SelectField.vue'
import type { ProductInput } from '@/types/product'

const auth = useAuthStore()
const router = useRouter()
const products = useProductListStore()
const { rows, loading, page, size, total, query, status, failure } = storeToRefs(products)
const filtersOpen = ref(false)
const drawer = ref(false)
const form = reactive<ProductInput>({ styleNo: '', name: '' })
const canManage = computed(() => auth.permissions.has('PRODUCT_MANAGE'))

function load(): Promise<void> {
  return products.load()
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
    failure.value = {
      message: candidate.message || '产品创建失败',
      traceId: candidate.traceId || '',
    }
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
      <el-button v-if="canManage" data-testid="create-product" type="primary" @click="openCreate">
        新建产品草稿
      </el-button>
    </header>

    <ResponsiveFilterBar v-model="filtersOpen" form-id="product-filters" @submit="load">
      <el-form-item label="关键词">
        <el-input
          v-model="query"
          clearable
          maxlength="120"
          placeholder="款号 / 品名"
          @keyup.enter="load"
        />
      </el-form-item>
      <el-form-item label="状态">
        <SelectField
          v-model="status"
          aria-label="产品状态"
          :options="[
            { label: '全部', value: 'ALL' },
            { label: '草稿', value: 'DRAFT' },
            { label: '已上架', value: 'ACTIVE' },
            { label: '已停用', value: 'INACTIVE' },
          ]"
        />
      </el-form-item>
      <template #actions>
        <el-button native-type="submit">查询</el-button>
      </template>
    </ResponsiveFilterBar>

    <el-alert
      v-if="failure.message"
      :title="failure.message"
      type="error"
      :closable="false"
      show-icon
      role="alert"
    >
      <span v-if="failure.traceId">追踪号 {{ failure.traceId }}</span>
    </el-alert>

    <div class="product-ledger desktop-record-table" :aria-busy="loading">
      <el-table v-loading="loading" :data="rows">
        <el-table-column label="款号" min-width="120">
          <template #default="{ row }">
            <code>{{ row.styleNo }}</code>
          </template>
        </el-table-column>
        <el-table-column label="品名 / 品牌" min-width="180">
          <template #default="{ row }">
            <b>{{ row.name }}</b>
            <small>{{ row.brand || '—' }}</small>
          </template>
        </el-table-column>
        <el-table-column label="系列 / 季节" min-width="140">
          <template #default="{ row }">{{ row.series || '—' }} / {{ row.season || '—' }}</template>
        </el-table-column>
        <el-table-column label="版型" min-width="100">
          <template #default="{ row }">{{ row.fit || '未定义' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag size="small">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <RouterLink :to="{ name: 'product-detail', params: { id: row.id } }"
              >查看纸样</RouterLink
            >
          </template>
        </el-table-column>
        <template #empty>暂无产品纸样</template>
      </el-table>
    </div>
    <div v-if="rows.length" class="mobile-record-list" :aria-busy="loading">
      <article v-for="row in rows" :key="row.id" class="mobile-record-card">
        <header>
          <div>
            <code>{{ row.styleNo }}</code
            ><small>{{ row.brand || '未设置品牌' }}</small>
          </div>
          <el-tag size="small">{{ row.status }}</el-tag>
        </header>
        <h2>{{ row.name }}</h2>
        <dl>
          <div>
            <dt>系列</dt>
            <dd>{{ row.series || '—' }}</dd>
          </div>
          <div>
            <dt>季节</dt>
            <dd>{{ row.season || '—' }}</dd>
          </div>
          <div>
            <dt>版型</dt>
            <dd>{{ row.fit || '未定义' }}</dd>
          </div>
        </dl>
        <footer>
          <RouterLink class="record-primary-link" :to="`/products/${row.id}`">查看纸样</RouterLink>
        </footer>
      </article>
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
      <el-form class="master-form" label-position="top" @submit.prevent="create">
        <el-form-item label="款号"><el-input v-model="form.styleNo" maxlength="40" /></el-form-item>
        <el-form-item label="品名"><el-input v-model="form.name" maxlength="120" /></el-form-item>
        <el-form-item label="品牌"><el-input v-model="form.brand" maxlength="80" /></el-form-item>
        <el-form-item label="系列"><el-input v-model="form.series" maxlength="80" /></el-form-item>
        <el-form-item label="类别"
          ><el-input v-model="form.category" maxlength="80"
        /></el-form-item>
        <el-form-item label="季节"><el-input v-model="form.season" maxlength="40" /></el-form-item>
        <el-form-item label="目标价格">
          <el-input v-model.number="form.targetPrice" type="number" min="0" step="0.01" />
        </el-form-item>
        <el-form-item label="版型"><el-input v-model="form.fit" maxlength="80" /></el-form-item>
        <el-button type="primary" native-type="submit">建立产品主档</el-button>
      </el-form>
    </el-drawer>
  </section>
</template>
