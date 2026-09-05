<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { bomApi, productApi } from '@/api/products'
import { ApiClientError } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import type { BomPage, BomSummary, Product, ProductInput, Sku, SkuInput } from '@/types/product'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const product = ref<Product>()
const skus = ref<Sku[]>([])
const boms = ref<BomSummary[]>([])
const bomPage = ref(0)
const bomTotalPages = ref(0)
const failure = ref('')
const traceId = ref('')
const skuDrawer = ref(false)
const bomDrawer = ref(false)
const productDrawer = ref(false)
const pendingProductAction = ref('')
const editingSkuId = ref('')
const skuForm = reactive<SkuInput>({ skuCode: '', color: '', colorCode: '', size: '', fit: '' })
const productForm = reactive<ProductInput>({ styleNo: '', name: '' })
const bomForm = reactive({ versionNo: '', name: '' })
const canManage = computed(() => auth.permissions.has('PRODUCT_MANAGE'))
const canApprove = computed(() => auth.permissions.has('PRODUCT_APPROVE'))
const productId = computed(() => String(route.params.id))
const colorVariants = computed(() => [
  ...new Map(
    skus.value.map((sku) => [sku.colorCode, { color: sku.color, colorCode: sku.colorCode }]),
  ).values(),
])
const sizes = computed(() => [...new Set(skus.value.map((sku) => sku.size))])
const fits = computed(() => [...new Set(skus.value.map((sku) => sku.fit || 'DEFAULT'))])

async function load(): Promise<void> {
  try {
    const [loadedProduct, loadedSkus, loadedBoms] = await Promise.all([
      productApi.get(productId.value),
      productApi.skus(productId.value),
      bomApi.list(productId.value, bomPage.value, 20),
    ])
    product.value = loadedProduct
    skus.value = loadedSkus
    applyBomPage(loadedBoms)
  } catch (error) {
    const candidate = error as Partial<ApiClientError>
    failure.value = candidate.message || '产品详情加载失败'
    traceId.value = candidate.traceId || ''
  }
}

function applyBomPage(page: BomPage): void {
  boms.value = page.content
  bomTotalPages.value = page.totalPages
}

async function changeBomPage(next: number): Promise<void> {
  if (next < 0 || next >= bomTotalPages.value) return
  bomPage.value = next
  try {
    applyBomPage(await bomApi.list(productId.value, next, 20))
  } catch (error) {
    report(error, 'BOM历史加载失败')
  }
}

function skuAt(colorCode: string, size: string, fit: string): Sku | undefined {
  return skus.value.find(
    (sku) => sku.colorCode === colorCode && sku.size === size && (sku.fit || 'DEFAULT') === fit,
  )
}

function report(error: unknown, fallback: string): void {
  const candidate = error as Partial<ApiClientError>
  failure.value = candidate.message || fallback
  traceId.value = candidate.traceId || ''
}

async function productAction(action: 'activate' | 'deactivate' | 'reopen'): Promise<void> {
  if (!product.value || pendingProductAction.value) return
  pendingProductAction.value = action
  try {
    product.value = await productApi.action(product.value.id, action, product.value.version)
    ElMessage.success('产品状态已更新')
  } catch (error) {
    report(error, '产品状态更新失败')
  } finally {
    pendingProductAction.value = ''
  }
}

function openProductEdit(): void {
  if (!product.value) return
  Object.assign(productForm, {
    styleNo: product.value.styleNo,
    name: product.value.name,
    brand: product.value.brand || '',
    series: product.value.series || '',
    category: product.value.category || '',
    season: product.value.season || '',
    targetPrice: product.value.targetPrice,
    fit: product.value.fit || '',
    version: product.value.version,
  })
  productDrawer.value = true
}

async function saveProduct(): Promise<void> {
  if (!product.value) return
  try {
    product.value = await productApi.update(product.value.id, { ...productForm })
    productDrawer.value = false
    ElMessage.success('产品草稿已保存')
  } catch (error) {
    report(error, '产品草稿保存失败')
  }
}

function openSku(sku?: Sku): void {
  editingSkuId.value = sku?.id || ''
  Object.assign(
    skuForm,
    sku
      ? {
          skuCode: sku.skuCode,
          color: sku.color,
          colorCode: sku.colorCode,
          size: sku.size,
          fit: sku.fit,
          version: sku.version,
        }
      : { skuCode: '', color: '', colorCode: '', size: '', fit: '', version: undefined },
  )
  skuDrawer.value = true
}

async function createSku(): Promise<void> {
  try {
    const input = {
      ...skuForm,
      skuCode: skuForm.skuCode.trim().toUpperCase(),
      colorCode: skuForm.colorCode.trim().toUpperCase(),
      size: skuForm.size.trim().toUpperCase(),
    }
    if (editingSkuId.value) await productApi.updateSku(productId.value, editingSkuId.value, input)
    else await productApi.createSku(productId.value, input)
    skuDrawer.value = false
    ElMessage.success(editingSkuId.value ? 'SKU已更新' : 'SKU已加入矩阵')
    await load()
  } catch (error) {
    report(error, 'SKU保存失败')
  }
}

async function setSkuActive(sku: Sku): Promise<void> {
  try {
    await productApi.setSkuStatus(productId.value, sku, !sku.active)
    await load()
  } catch (error) {
    report(error, 'SKU状态更新失败')
  }
}

async function createBom(): Promise<void> {
  try {
    const created = await bomApi.create({
      productId: productId.value,
      versionNo: bomForm.versionNo.trim().toUpperCase(),
      name: bomForm.name.trim(),
      items: [],
    })
    bomDrawer.value = false
    await router.push({ name: 'bom-editor', params: { bomId: created.id } })
  } catch (error) {
    report(error, 'BOM创建失败')
  }
}
onMounted(load)
</script>

<template>
  <section v-if="product" class="product-detail">
    <header class="detail-ticket">
      <div>
        <p class="eyebrow">STYLE CARD / {{ product.styleNo }}</p>
        <h1>{{ product.name }}</h1>
        <p>
          {{ product.brand || '自有品牌' }} · {{ product.series || '未分系列' }} ·
          {{ product.season || '全季' }}
        </p>
      </div>
      <div class="ticket-actions">
        <span class="product-state" :class="product.status.toLowerCase()">{{
          product.status
        }}</span>
        <el-button
          v-if="canManage && product.status === 'DRAFT'"
          data-testid="edit-product"
          @click="openProductEdit"
        >
          编辑草稿
        </el-button>
        <el-button
          v-if="canApprove && product.status === 'DRAFT'"
          :disabled="!!pendingProductAction"
          @click="productAction('activate')"
        >
          审核上架
        </el-button>
        <el-button
          v-if="canManage && product.status === 'ACTIVE'"
          :disabled="!!pendingProductAction"
          @click="productAction('deactivate')"
        >
          停用
        </el-button>
        <el-button
          v-if="canManage && product.status === 'INACTIVE'"
          :disabled="!!pendingProductAction"
          @click="productAction('reopen')"
        >
          重开草稿
        </el-button>
      </div>
    </header>

    <el-alert
      v-if="failure"
      :title="failure"
      type="error"
      :closable="false"
      show-icon
      role="alert"
      aria-live="polite"
    >
      <span v-if="traceId">追踪号 {{ traceId }}</span>
    </el-alert>

    <ol class="status-timeline" aria-label="产品状态时间线">
      <li class="done"><b>01</b><span>产品草稿</span></li>
      <li :class="{ done: product.status !== 'DRAFT' }"><b>02</b><span>SKU与BOM齐备</span></li>
      <li :class="{ done: product.status === 'ACTIVE' }"><b>03</b><span>审核上架</span></li>
    </ol>

    <div class="detail-grid">
      <article class="pattern-panel">
        <header class="panel-title">
          <div>
            <p class="eyebrow">SKU MATRIX</p>
            <h2>颜色 × 尺码矩阵</h2>
          </div>
          <el-button
            v-if="canManage && product.status === 'DRAFT'"
            link
            type="primary"
            @click="openSku()"
          >
            ＋ 新增SKU
          </el-button>
        </header>
        <section v-for="fit in fits" :key="fit" class="sku-fit-group">
          <h3>版型 {{ fit || '默认' }}</h3>
          <div class="sku-matrix" :style="`--matrix-columns:${Math.max(sizes.length, 1)}`">
            <div class="matrix-corner">颜色 / 色号 \ 尺码</div>
            <b v-for="size in sizes" :key="size">{{ size }}</b
            ><template v-for="variant in colorVariants" :key="variant.colorCode"
              ><b>{{ variant.color }} · {{ variant.colorCode }}</b
              ><span
                v-for="size in sizes"
                :key="`${variant.colorCode}-${size}-${fit}`"
                :class="{ active: skuAt(variant.colorCode, size, fit)?.active }"
                >{{ skuAt(variant.colorCode, size, fit)?.skuCode || '—' }}</span
              ></template
            >
          </div>
        </section>
        <ul v-if="skus.length" class="sku-maintenance" aria-label="SKU明细">
          <li v-for="sku in skus" :key="sku.id">
            <code>{{ sku.skuCode }}</code
            ><span>{{ sku.colorCode }} / {{ sku.size }} / {{ sku.fit }}</span>
            <el-button
              v-if="canManage && product.status === 'DRAFT'"
              link
              type="primary"
              @click="openSku(sku)"
            >
              编辑
            </el-button>
            <el-button
              v-if="canManage && product.status === 'DRAFT'"
              link
              type="primary"
              @click="setSkuActive(sku)"
            >
              {{ sku.active ? '停用' : '启用' }}
            </el-button>
          </li>
        </ul>
        <p v-if="skus.length === 0" class="panel-empty">
          尚未配置SKU。产品上架至少需要一个启用SKU。
        </p>
      </article>
      <article class="pattern-panel">
        <header class="panel-title">
          <div>
            <p class="eyebrow">BOM HISTORY</p>
            <h2>版次履历</h2>
          </div>
          <el-button
            v-if="canManage && product.status === 'DRAFT'"
            link
            type="primary"
            @click="bomDrawer = true"
          >
            ＋ 新建版本
          </el-button>
        </header>
        <ul class="bom-history">
          <li v-for="bom in boms" :key="bom.id">
            <span
              ><b>{{ bom.versionNo }}</b
              ><small>{{ bom.name }}</small></span
            ><span class="product-state" :class="bom.status.toLowerCase()">{{ bom.status }}</span
            ><RouterLink :to="{ name: 'bom-editor', params: { bomId: bom.id } }"
              >展开物料表</RouterLink
            >
          </li>
        </ul>
        <p v-if="boms.length === 0" class="panel-empty">尚未建立BOM版本。</p>
        <nav v-if="bomTotalPages > 1" class="product-toolbar" aria-label="BOM历史分页">
          <el-button :disabled="bomPage === 0" @click="changeBomPage(bomPage - 1)">
            上一页
          </el-button>
          <span>第 {{ bomPage + 1 }} / {{ bomTotalPages }} 页</span>
          <el-button :disabled="bomPage + 1 >= bomTotalPages" @click="changeBomPage(bomPage + 1)">
            下一页
          </el-button>
        </nav>
      </article>
    </div>
    <el-drawer v-model="productDrawer" title="编辑产品草稿" size="min(560px, 94vw)">
      <el-form class="master-form" label-position="top" @submit.prevent="saveProduct">
        <el-form-item label="款号">
          <el-input v-model="productForm.styleNo" required maxlength="40" />
        </el-form-item>
        <el-form-item label="品名">
          <el-input v-model="productForm.name" required maxlength="120" />
        </el-form-item>
        <el-form-item label="品牌">
          <el-input v-model="productForm.brand" maxlength="80" />
        </el-form-item>
        <el-form-item label="系列">
          <el-input v-model="productForm.series" maxlength="80" />
        </el-form-item>
        <el-form-item label="类别">
          <el-input v-model="productForm.category" maxlength="80" />
        </el-form-item>
        <el-form-item label="季节">
          <el-input v-model="productForm.season" maxlength="40" />
        </el-form-item>
        <el-form-item label="目标价格">
          <el-input v-model.number="productForm.targetPrice" type="number" min="0" step="0.01" />
        </el-form-item>
        <el-form-item label="版型">
          <el-input v-model="productForm.fit" maxlength="80" />
        </el-form-item>
        <el-button type="primary" native-type="submit">保存产品草稿</el-button>
      </el-form>
    </el-drawer>
    <el-drawer
      v-model="skuDrawer"
      :title="editingSkuId ? '编辑SKU组合' : '新增SKU组合'"
      size="min(480px, 94vw)"
    >
      <el-form class="master-form" label-position="top" @submit.prevent="createSku">
        <el-form-item label="SKU编码">
          <el-input v-model="skuForm.skuCode" required maxlength="64" />
        </el-form-item>
        <el-form-item label="颜色">
          <el-input v-model="skuForm.color" required maxlength="80" />
        </el-form-item>
        <el-form-item label="色号">
          <el-input v-model="skuForm.colorCode" required maxlength="40" />
        </el-form-item>
        <el-form-item label="尺码">
          <el-input v-model="skuForm.size" required maxlength="24" />
        </el-form-item>
        <el-form-item label="版型">
          <el-input v-model="skuForm.fit" maxlength="80" />
        </el-form-item>
        <el-button type="primary" native-type="submit">保存SKU</el-button>
      </el-form>
    </el-drawer>
    <el-drawer v-model="bomDrawer" title="新建BOM版本" size="min(480px, 94vw)">
      <el-form class="master-form" label-position="top" @submit.prevent="createBom">
        <el-form-item label="版本号">
          <el-input v-model="bomForm.versionNo" required maxlength="40" />
        </el-form-item>
        <el-form-item label="版本名称">
          <el-input v-model="bomForm.name" required maxlength="120" />
        </el-form-item>
        <p class="panel-empty">创建后进入物料编辑器录入面料、辅料用量与损耗。</p>
        <el-button type="primary" native-type="submit">建立BOM草稿</el-button>
      </el-form>
    </el-drawer>
  </section>
  <el-alert
    v-else-if="failure"
    :title="failure"
    type="error"
    :closable="false"
    show-icon
    role="alert"
    aria-live="polite"
  >
    <span v-if="traceId">追踪号 {{ traceId }}</span>
  </el-alert>
</template>
