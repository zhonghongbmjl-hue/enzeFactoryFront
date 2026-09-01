<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { salesOrderApi } from '@/api/orders'
import { ApiClientError } from '@/api/http'
import { ORDER_STATUS_LABELS, type OrderStatus, type SalesOrder } from '@/types/order'

const rows = ref<SalesOrder[]>([])
const loading = ref(false)
const page = ref(1)
const size = ref(20)
const total = ref(0)
const query = ref('')
const status = ref<'' | OrderStatus>('')
const failure = reactive({ message: '', traceId: '' })

const statusOptions = Object.entries(ORDER_STATUS_LABELS) as Array<[OrderStatus, string]>

function orderQuantity(order: SalesOrder): number {
  return order.items.reduce((totalQuantity, item) => totalQuantity + item.quantity, 0)
}

async function load(): Promise<void> {
  loading.value = true
  failure.message = ''
  failure.traceId = ''
  try {
    const result = await salesOrderApi.list({
      page: page.value - 1,
      size: size.value,
      ...(query.value.trim() ? { query: query.value.trim() } : {}),
      ...(status.value ? { status: status.value } : {}),
    })
    rows.value = result.content
    total.value = result.totalElements
  } catch (error) {
    const candidate = error as Partial<ApiClientError>
    failure.message = candidate.message || '订单列表加载失败'
    failure.traceId = candidate.traceId || ''
  } finally {
    loading.value = false
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
        <p class="eyebrow">PO CONTROL / 订单履约</p>
        <h1>订单履约台账</h1>
        <p>主状态用于业务管控，物料、生产、质量和交付进度独立记录。</p>
      </div>
      <span class="order-register-stamp">PO · LIVE</span>
    </header>

    <div class="pattern-ruler" aria-hidden="true">
      <span v-for="n in 12" :key="n">{{ n }}</span>
    </div>
    <form class="product-toolbar" role="search" @submit.prevent="load">
      <label>检索<input v-model="query" maxlength="120" placeholder="订单号 / 客户" /></label>
      <label>
        主状态
        <select v-model="status" aria-label="订单主状态">
          <option value="">全部</option>
          <option v-for="[value, label] in statusOptions" :key="value" :value="value">
            {{ label }}
          </option>
        </select>
      </label>
      <button class="outline-action" type="submit">查询</button>
    </form>

    <div v-if="failure.message" class="master-error" role="alert" aria-live="polite">
      <b>{{ failure.message }}</b
      ><span v-if="failure.traceId">追踪号 {{ failure.traceId }}</span>
    </div>

    <div class="product-ledger order-ledger" :aria-busy="loading">
      <table class="product-table">
        <thead>
          <tr>
            <th>订单 / 客户</th>
            <th>下单 / 交期</th>
            <th>数量</th>
            <th>主状态</th>
            <th>执行进度</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td data-label="订单 / 客户">
              <code>{{ row.orderNo }}</code>
              <small>{{ row.customerCode }} · {{ row.customerName }}</small>
            </td>
            <td data-label="下单 / 交期">
              {{ row.orderDate }}
              <small>{{ row.items[0]?.deliveryDate || '未设交期' }}</small>
            </td>
            <td data-label="数量">
              <b>{{ orderQuantity(row) }}</b> 件
            </td>
            <td data-label="主状态">
              <span class="order-state" :class="row.status.toLowerCase()">
                {{ ORDER_STATUS_LABELS[row.status] }}
              </span>
            </td>
            <td data-label="执行进度">
              <div class="compact-progress" aria-label="四维执行进度">
                <span>物料 {{ row.progress.materialPercent }}%</span>
                <span>生产 {{ row.progress.productionPercent }}%</span>
                <span>质量 {{ row.progress.qualityPercent }}%</span>
                <span>交付 {{ row.progress.shipmentPercent }}%</span>
              </div>
            </td>
            <td data-label="操作">
              <RouterLink :to="{ name: 'sales-order-detail', params: { id: row.id } }">
                查看履约 →
              </RouterLink>
            </td>
          </tr>
          <tr v-if="!loading && rows.length === 0">
            <td colspan="6" class="empty-cell">暂无订单</td>
          </tr>
        </tbody>
      </table>
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
  </section>
</template>
