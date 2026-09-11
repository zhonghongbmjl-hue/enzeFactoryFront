<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { salesOrderApi } from '@/api/orders'
import { masterDataApi } from '@/api/masterdata'
import { productApi } from '@/api/products'
import { ApiClientError } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import { useOrderListStore } from '@/stores/orders'
import ResponsiveFilterBar from '@/components/layout/ResponsiveFilterBar.vue'
import SelectField from '@/components/form/SelectField.vue'
import {
  ORDER_STATUS_LABELS,
  type OrderStatus,
  type SalesOrder,
  type SalesOrderInput,
} from '@/types/order'
import type { MasterDataOption } from '@/types/masterdata'
import type { Product, Sku } from '@/types/product'

interface DraftOrderItem {
  productId: string
  skuId: string
  color: string
  size: string
  fit: string
  quantity: number
  deliveryDate: string
  specialProcess: string
  unitPrice: number | undefined
}

function today(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function emptyItem(): DraftOrderItem {
  return {
    productId: '',
    skuId: '',
    color: '',
    size: '',
    fit: '',
    quantity: 1,
    deliveryDate: today(),
    specialProcess: '',
    unitPrice: undefined,
  }
}

const auth = useAuthStore()
const router = useRouter()
const orders = useOrderListStore()
const { rows, loading, page, size, total, query, status, failure } = storeToRefs(orders)
const filtersOpen = ref(false)
const drawer = ref(false)
const creating = ref(false)
const opening = ref(false)
const customerOptions = ref<MasterDataOption[]>([])
const productOptions = ref<Product[]>([])
const skuMap = ref<Record<string, Sku[]>>({})
const form = reactive({
  orderNo: '',
  customerId: '',
  orderDate: today(),
  items: [emptyItem()],
})
const canViewProcurement = computed(() => auth.permissions.has('PROCUREMENT_VIEW'))
const canViewShipment = computed(
  () => auth.permissions.has('SHIPMENT_VIEW') || auth.permissions.has('AFTER_SALES_MANAGE'),
)
const canManage = computed(() => auth.permissions.has('ORDER_MANAGE'))
const customerSelectOptions = computed(() =>
  customerOptions.value.map((item) => ({
    label: `${item.code} · ${item.name}`,
    value: item.id,
  })),
)
const productSelectOptions = computed(() =>
  productOptions.value.map((item) => ({
    label: `${item.styleNo} · ${item.name}`,
    value: item.id,
  })),
)

const statusOptions = Object.entries(ORDER_STATUS_LABELS) as Array<[OrderStatus, string]>

function skuSelectOptions(productId: string) {
  return (skuMap.value[productId] ?? [])
    .filter((sku) => sku.active)
    .map((sku) => ({
      label: `${sku.skuCode} · ${sku.color} / ${sku.size} / ${sku.fit}`,
      value: sku.id,
    }))
}

function orderQuantity(order: SalesOrder): number {
  return order.items.reduce((totalQuantity, item) => totalQuantity + item.quantity, 0)
}

function load(): Promise<void> {
  return orders.load()
}

function asOrder(row: unknown): SalesOrder {
  return row as SalesOrder
}

function reportCreateError(error: unknown, fallback: string): void {
  const candidate = error as Partial<ApiClientError>
  failure.value = {
    message: candidate.message || fallback,
    traceId: candidate.traceId || '',
  }
}

async function openCreate(): Promise<void> {
  if (opening.value) return
  opening.value = true
  form.orderNo = ''
  form.customerId = ''
  form.orderDate = today()
  form.items = [emptyItem()]
  skuMap.value = {}
  try {
    const [customers, products] = await Promise.all([
      masterDataApi.select('customers', '', 50),
      productApi.list({ page: 0, size: 50, sort: 'styleNo,asc', status: 'ACTIVE' }),
    ])
    customerOptions.value = customers
    productOptions.value = products.content
    drawer.value = true
  } catch (error) {
    reportCreateError(error, '订单选项加载失败')
  } finally {
    opening.value = false
  }
}

function addItem(): void {
  form.items.push(emptyItem())
}

function removeItem(index: number): void {
  if (form.items.length === 1) return
  form.items.splice(index, 1)
}

async function selectProduct(item: DraftOrderItem): Promise<void> {
  item.skuId = ''
  item.color = ''
  item.size = ''
  item.fit = ''
  if (!item.productId || skuMap.value[item.productId]) return
  try {
    const skus = await productApi.skus(item.productId)
    skuMap.value = { ...skuMap.value, [item.productId]: skus }
  } catch (error) {
    reportCreateError(error, 'SKU选项加载失败')
  }
}

function selectSku(item: DraftOrderItem): void {
  const sku = (skuMap.value[item.productId] ?? []).find((row) => row.id === item.skuId)
  if (!sku) return
  item.color = sku.color
  item.size = sku.size
  item.fit = sku.fit
}

async function create(): Promise<void> {
  if (creating.value) return
  creating.value = true
  try {
    const created = await salesOrderApi.create({
      orderNo: form.orderNo.trim().toUpperCase(),
      customerId: form.customerId,
      orderDate: form.orderDate,
      items: form.items.map((item) => {
        const line: SalesOrderInput['items'][number] = {
          productId: item.productId,
          skuId: item.skuId,
          color: item.color.trim(),
          size: item.size.trim().toUpperCase(),
          fit: item.fit.trim(),
          quantity: Number(item.quantity),
          deliveryDate: item.deliveryDate,
        }
        const process = item.specialProcess.trim()
        if (process) line.specialProcess = process
        if (typeof item.unitPrice === 'number' && Number.isFinite(item.unitPrice)) {
          line.unitPrice = item.unitPrice
        }
        return line
      }),
    })
    drawer.value = false
    ElMessage.success('订单草稿已创建')
    await router.push({ name: 'sales-order-detail', params: { id: created.id } })
  } catch (error) {
    reportCreateError(error, '订单创建失败')
  } finally {
    creating.value = false
  }
}

watch([status, size], () => {
  page.value = 1
  void load()
})
onMounted(load)
</script>

<template>
  <section class="order-page">
    <header class="product-heading">
      <div>
        <p class="eyebrow">SALES ORDER CONTROL / 订单履约</p>
        <h1>订单履约台账</h1>
        <p>主状态用于业务管控，物料、生产、质量和交付进度独立记录。</p>
      </div>
      <el-button
        v-if="canManage"
        data-testid="create-order"
        type="primary"
        :disabled="opening"
        @click="openCreate"
      >
        新建订单
      </el-button>
    </header>

    <ResponsiveFilterBar v-model="filtersOpen" form-id="order-filters" @submit="load">
      <el-form-item label="关键词">
        <el-input v-model="query" clearable maxlength="120" placeholder="订单号 / 客户" />
      </el-form-item>
      <el-form-item label="主状态">
        <SelectField
          v-model="status"
          aria-label="订单主状态"
          placeholder="全部"
          :options="[
            { label: '全部', value: 'ALL' },
            ...statusOptions.map(([value, label]) => ({ label, value })),
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
      aria-live="polite"
    >
      <span v-if="failure.traceId">追踪号 {{ failure.traceId }}</span>
    </el-alert>

    <div class="product-ledger order-ledger desktop-record-table" :aria-busy="loading">
      <el-table v-loading="loading" :data="rows">
        <el-table-column label="订单 / 客户" min-width="180">
          <template #default="{ row }">
            <code>{{ row.orderNo }}</code>
            <small>{{ row.customerCode }} · {{ row.customerName }}</small>
          </template>
        </el-table-column>
        <el-table-column label="下单 / 交期" min-width="140">
          <template #default="{ row }">
            {{ row.orderDate }}
            <small>{{ row.items[0]?.deliveryDate || '未设交期' }}</small>
          </template>
        </el-table-column>
        <el-table-column label="数量" width="100">
          <template #default="{ row }">
            <b>{{ orderQuantity(asOrder(row)) }}</b> 件
          </template>
        </el-table-column>
        <el-table-column label="主状态" width="120">
          <template #default="{ row }">
            <el-tag size="small">{{ ORDER_STATUS_LABELS[asOrder(row).status] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="执行进度" min-width="220">
          <template #default="{ row }">
            <el-space wrap aria-label="四维执行进度">
              <span>物料 {{ row.progress.materialPercent }}%</span>
              <span>生产 {{ row.progress.productionPercent }}%</span>
              <span>质量 {{ row.progress.qualityPercent }}%</span>
              <span>交付 {{ row.progress.shipmentPercent }}%</span>
            </el-space>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="250" fixed="right">
          <template #default="{ row }">
            <el-space wrap>
              <RouterLink :to="{ name: 'sales-order-detail', params: { id: row.id } }">
                查看履约
              </RouterLink>
              <RouterLink
                v-if="canViewProcurement && row.requirements?.length"
                :to="`/procurement/${row.id}`"
              >
                采购来料
              </RouterLink>
              <RouterLink v-if="canViewShipment" :to="`/shipments/${row.id}`">
                包装发运
              </RouterLink>
            </el-space>
          </template>
        </el-table-column>
        <template #empty>暂无订单</template>
      </el-table>
    </div>
    <div v-if="rows.length" class="mobile-record-list" :aria-busy="loading">
      <article v-for="row in rows" :key="row.id" class="mobile-record-card">
        <header>
          <div>
            <code>{{ row.orderNo }}</code
            ><small>{{ row.customerName }}</small>
          </div>
          <el-tag size="small">{{ ORDER_STATUS_LABELS[row.status] }}</el-tag>
        </header>
        <dl>
          <div>
            <dt>客户编码</dt>
            <dd>{{ row.customerCode }}</dd>
          </div>
          <div>
            <dt>下单日期</dt>
            <dd>{{ row.orderDate }}</dd>
          </div>
          <div>
            <dt>要求交期</dt>
            <dd>{{ row.items[0]?.deliveryDate || '未设交期' }}</dd>
          </div>
          <div>
            <dt>订单数量</dt>
            <dd>{{ orderQuantity(row) }} 件</dd>
          </div>
        </dl>
        <div class="mobile-progress" aria-label="四维执行进度">
          <span
            >物料 <b>{{ row.progress.materialPercent }}%</b></span
          >
          <span
            >生产 <b>{{ row.progress.productionPercent }}%</b></span
          >
          <span
            >质量 <b>{{ row.progress.qualityPercent }}%</b></span
          >
          <span
            >交付 <b>{{ row.progress.shipmentPercent }}%</b></span
          >
        </div>
        <footer>
          <RouterLink class="record-primary-link" :to="`/orders/${row.id}`">查看履约</RouterLink>
          <RouterLink
            v-if="canViewProcurement && row.requirements?.length"
            :to="`/procurement/${row.id}`"
            >采购来料</RouterLink
          >
          <RouterLink v-if="canViewShipment" :to="`/shipments/${row.id}`">包装发运</RouterLink>
        </footer>
      </article>
    </div>
    <footer class="pager">
      <span>共 {{ total }} 笔订单</span>
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="size"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="prev, pager, next, sizes"
        @current-change="load"
      />
    </footer>

    <el-drawer v-model="drawer" title="新建订单" size="min(640px, 94vw)" destroy-on-close>
      <el-form
        v-if="drawer"
        class="master-form"
        label-position="top"
        data-testid="create-order-form"
        @submit.prevent="create"
      >
        <el-form-item label="订单号">
          <el-input
            v-model="form.orderNo"
            data-testid="order-no"
            maxlength="64"
            required
            autocomplete="off"
          />
        </el-form-item>
        <el-form-item label="客户">
          <SelectField
            id="order-customer"
            v-model="form.customerId"
            data-testid="order-customer"
            aria-label="客户"
            filterable
            placeholder="选择客户"
            :options="customerSelectOptions"
          />
        </el-form-item>
        <el-form-item label="下单日期">
          <el-input
            v-model="form.orderDate"
            data-testid="order-date"
            type="date"
            required
            autocomplete="off"
          />
        </el-form-item>
        <div v-for="(item, index) in form.items" :key="index" class="order-line-draft">
          <header>
            <span>订单行 {{ index + 1 }}</span>
            <el-button v-if="form.items.length > 1" link type="primary" @click="removeItem(index)">
              移除
            </el-button>
          </header>
          <el-form-item label="产品">
            <SelectField
              :id="`order-product-${index}`"
              v-model="item.productId"
              :data-testid="`order-product-${index}`"
              aria-label="产品"
              filterable
              placeholder="选择产品"
              :options="productSelectOptions"
              @change="selectProduct(item)"
            />
          </el-form-item>
          <el-form-item label="SKU">
            <SelectField
              :id="`order-sku-${index}`"
              v-model="item.skuId"
              :data-testid="`order-sku-${index}`"
              aria-label="SKU"
              filterable
              placeholder="选择SKU"
              :options="skuSelectOptions(item.productId)"
              @change="selectSku(item)"
            />
          </el-form-item>
          <el-form-item label="数量">
            <el-input
              v-model.number="item.quantity"
              :data-testid="`order-quantity-${index}`"
              type="number"
              min="1"
              step="1"
              required
            />
          </el-form-item>
          <el-form-item label="交期">
            <el-input
              v-model="item.deliveryDate"
              :data-testid="`order-delivery-${index}`"
              type="date"
              required
            />
          </el-form-item>
          <el-form-item label="特殊工艺">
            <el-input v-model="item.specialProcess" maxlength="120" />
          </el-form-item>
          <el-form-item label="单价">
            <el-input v-model.number="item.unitPrice" type="number" min="0" step="0.01" />
          </el-form-item>
        </div>
        <el-button class="table-action" link type="primary" @click="addItem"
          >＋ 添加订单行</el-button
        >
        <el-form-item>
          <el-button
            type="primary"
            native-type="submit"
            data-testid="submit-order"
            :disabled="creating"
          >
            建立订单草稿
          </el-button>
        </el-form-item>
      </el-form>
    </el-drawer>
  </section>
</template>
