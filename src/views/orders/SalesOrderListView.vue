<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { useOrderListStore } from '@/stores/orders'
import ResponsiveFilterBar from '@/components/layout/ResponsiveFilterBar.vue'
import SelectField from '@/components/form/SelectField.vue'
import { ORDER_STATUS_LABELS, type OrderStatus, type SalesOrder } from '@/types/order'

const auth = useAuthStore()
const orders = useOrderListStore()
const { rows, loading, page, size, total, query, status, failure } = storeToRefs(orders)
const filtersOpen = ref(false)
const canViewProcurement = computed(() => auth.permissions.has('PROCUREMENT_VIEW'))
const canViewShipment = computed(
  () => auth.permissions.has('SHIPMENT_VIEW') || auth.permissions.has('AFTER_SALES_MANAGE'),
)

const statusOptions = Object.entries(ORDER_STATUS_LABELS) as Array<[OrderStatus, string]>

function orderQuantity(order: SalesOrder): number {
  return order.items.reduce((totalQuantity, item) => totalQuantity + item.quantity, 0)
}

function load(): Promise<void> {
  return orders.load()
}

function asOrder(row: unknown): SalesOrder {
  return row as SalesOrder
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

    <ResponsiveFilterBar v-model="filtersOpen" form-id="order-filters" @submit="load">
      <el-form-item label="关键词">
        <el-input v-model="query" clearable maxlength="120" placeholder="订单号 / 客户" />
      </el-form-item>
      <el-form-item label="主状态">
        <SelectField
          v-model="status"
          aria-label="订单主状态"
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
  </section>
</template>
