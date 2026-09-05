<script setup lang="ts">
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import OrderProgressCard from '@/components/dashboard/OrderProgressCard.vue'
import { CONTROL_TOWER_PAGE_SIZE, useDashboardStore } from '@/stores/dashboard'

const dashboard = useDashboardStore()
const { result, page, loading, failure, traceId } = storeToRefs(dashboard)
const PAGE_SIZE = CONTROL_TOWER_PAGE_SIZE

function load(target = page.value): Promise<void> {
  return dashboard.load(target)
}

onMounted(() => load())
</script>

<template>
  <section class="control-tower" :aria-busy="loading">
    <header class="tower-heading">
      <div>
        <p class="eyebrow">ORDER CONTROL TOWER / LIVE LEDGER</p>
        <h1>订单履约控制塔</h1>
        <p>从采购、齐套、生产到质量和交付，按交期风险统一巡线。</p>
      </div>
      <aside>
        <span>LIVE</span>
        <b>{{ result?.totalElements ?? '—' }}</b>
        <small>当前订单</small>
      </aside>
    </header>

    <el-alert
      v-if="failure"
      type="error"
      :closable="false"
      show-icon
      role="alert"
      aria-live="polite"
    >
      <template #title>
        {{ failure }}
        <small v-if="traceId">追踪号 {{ traceId }}</small>
      </template>
      <el-button data-testid="retry-control-tower" @click="load()">重试</el-button>
    </el-alert>

    <div v-if="result?.content.length" class="order-card-grid">
      <OrderProgressCard v-for="order in result.content" :key="order.orderId" :order="order" />
    </div>
    <el-empty
      v-else-if="!loading && !failure"
      description="当前没有可跟踪订单。新订单通过审核后将自动进入控制塔。"
    />

    <footer v-if="result && result.totalPages > 0" class="tower-pagination">
      <span>第 {{ page + 1 }} / {{ result.totalPages }} 页</span>
      <el-pagination
        :current-page="page + 1"
        :page-size="PAGE_SIZE"
        :total="result.totalElements"
        layout="prev, pager, next"
        :disabled="loading"
        @current-change="(next: number) => load(next - 1)"
      />
    </footer>
  </section>
</template>

<style scoped>
.control-tower {
  --tower-risk-none: #71908a;
  --tower-risk-low: #2f766b;
  --tower-risk-medium: #ae7a18;
  --tower-risk-high: #d6572b;
  --tower-risk-overdue: #9d2732;
  display: grid;
  gap: 1.5rem;
  min-width: 0;
}
.tower-heading {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 2rem;
  padding: 1.5rem 1.7rem;
  border: 2px solid var(--ink-900);
  background: #efe8d5;
  box-shadow: 10px 10px 0 var(--ink-900);
}
.tower-heading::after {
  position: absolute;
  right: 8.5rem;
  bottom: 0;
  width: 18%;
  height: 100%;
  opacity: 0.12;
  background: repeating-linear-gradient(120deg, transparent 0 12px, var(--ink-900) 12px 14px);
  content: '';
}
.tower-heading h1 {
  margin: 0.15rem 0 0.35rem;
  font-size: clamp(1.8rem, 4vw, 3rem);
}
.tower-heading p:last-child {
  margin: 0;
  color: #53656b;
}
.tower-heading aside {
  z-index: 1;
  display: grid;
  min-width: 7rem;
  padding: 0.75rem 1rem;
  background: var(--ink-900);
  color: #fffdf5;
  text-align: right;
}
.tower-heading aside span {
  color: #e5c766;
  font-size: 0.65rem;
  letter-spacing: 0.25em;
}
.tower-heading aside b {
  font-size: 2rem;
}
.tower-heading aside b,
.tower-pagination span {
  font-variant-numeric: tabular-nums;
}
.tower-heading aside small {
  opacity: 0.72;
}
.order-card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.4rem;
  min-width: 0;
}
.tower-error,
.tower-empty,
.tower-pagination {
  border: 1px solid var(--ink-900);
  background: #fffdf5;
}
.tower-error {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.2rem;
  color: #8f2430;
}
.tower-error span {
  display: grid;
}
.tower-error small {
  margin-top: 0.2rem;
}
.tower-error button,
.tower-pagination button {
  border: 1px solid currentColor;
  background: transparent;
  padding: 0.4rem 0.7rem;
  font-weight: 700;
}
.tower-error button:focus-visible,
.tower-pagination button:focus-visible {
  outline: 3px solid var(--tower-risk-medium);
  outline-offset: 3px;
}
.tower-empty {
  display: grid;
  gap: 0.25rem;
  padding: 3rem;
  text-align: center;
}
.tower-empty span {
  color: #617078;
}
.tower-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 0.75rem;
}
.tower-pagination button:disabled {
  opacity: 0.35;
}
@media (max-width: 920px) {
  .order-card-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 600px) {
  .tower-heading {
    align-items: stretch;
    flex-direction: column;
  }
  .tower-heading aside {
    text-align: left;
  }
}
</style>
