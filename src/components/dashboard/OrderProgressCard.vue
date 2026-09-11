<script setup lang="ts">
import { computed } from 'vue'
import { ORDER_STATUS_LABELS } from '@/types/order'
import type { DeliveryRisk, OrderControlTowerRow } from '@/types/dashboard'
import { formatDateTime } from '@/utils/presentation'

const props = defineProps<{ order: OrderControlTowerRow }>()

const riskLabels: Record<DeliveryRisk, string> = {
  NONE: '无风险',
  LOW: '低风险',
  MEDIUM: '中风险',
  HIGH: '高风险',
  OVERDUE: '已逾期',
}
const inspectionLabels: Record<string, string> = {
  NOT_STARTED: '未自检',
  PENDING: '待自检',
  PASSED: '自检通过',
  FAILED: '自检未通过',
  CORRECTION_REQUIRED: '待纠正',
}

const riskLabel = computed(() => riskLabels[props.order.deliveryRisk])
const inspectionLabel = computed(
  () => inspectionLabels[props.order.selfInspectionStatus] ?? props.order.selfInspectionStatus,
)

function rate(value: number): string {
  return Number(value).toFixed(2)
}
</script>

<template>
  <article
    class="order-progress-card"
    :class="`risk-${order.deliveryRisk.toLowerCase()}`"
    :data-order-id="order.orderId"
    :data-testid="`order-progress-${order.orderNo}`"
  >
    <header class="card-head">
      <div>
        <p class="eyebrow">{{ order.orderNo }}</p>
        <h2>{{ order.customerName }}</h2>
        <span>{{ ORDER_STATUS_LABELS[order.status] }} · 交期 {{ order.deliveryDate }}</span>
      </div>
      <strong class="risk-stamp">{{ riskLabel }}</strong>
    </header>

    <div class="flow-strip" aria-label="订单履约进度">
      <div>
        <span>采购</span><b>{{ order.procurementPercent }}%</b>
      </div>
      <div>
        <span>齐套</span><b>{{ order.overallKittingPercent }}%</b>
      </div>
      <div>
        <span>生产</span><b>{{ order.productionPercent }}%</b>
      </div>
      <div>
        <span>发运</span><b>{{ order.shipmentPercent }}%</b>
      </div>
    </div>

    <div class="material-ledger">
      <span
        >面料 <b>{{ order.fabricKittingPercent }}%</b></span
      >
      <span
        >辅料 <b>{{ order.accessoryKittingPercent }}%</b></span
      >
      <span
        >总体 <b>{{ order.overallKittingPercent }}%</b></span
      >
    </div>

    <dl class="quality-ledger">
      <div>
        <dt>过程自检</dt>
        <dd>{{ inspectionLabel }}</dd>
      </div>
      <div>
        <dt>证据</dt>
        <dd>冻结图 {{ order.frozenImageCount }} · 纠正 {{ order.correctionCount }}</dd>
      </div>
      <div>
        <dt>成品质量</dt>
        <dd>质检通过率 {{ rate(order.qualityPassRate) }}%</dd>
      </div>
      <div>
        <dt>质量返工</dt>
        <dd>返工率 {{ rate(order.reworkRate) }}%</dd>
      </div>
    </dl>

    <footer>
      <span v-if="order.lastSelfInspectionAt"
        >最后自检 {{ formatDateTime(order.lastSelfInspectionAt) }}</span
      >
      <span v-else>尚无自检记录</span>
      <RouterLink :to="`/orders/${order.orderId}`">进入订单 →</RouterLink>
    </footer>
  </article>
</template>

<style scoped>
.order-progress-card {
  --risk: var(--tower-risk-low, #2f766b);
  position: relative;
  overflow: hidden;
  min-width: 0;
  border: 2px solid var(--ink-900);
  background: #fffdf5;
  box-shadow: 8px 8px 0 color-mix(in srgb, var(--risk) 30%, var(--ink-900));
  animation: tower-card-in 420ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
  transition:
    box-shadow 160ms ease,
    transform 160ms ease;
}
.order-progress-card:nth-child(2n) {
  animation-delay: 70ms;
}
.order-progress-card:hover {
  box-shadow: 5px 5px 0 color-mix(in srgb, var(--risk) 42%, var(--ink-900));
  transform: translate(3px, 3px);
}
.order-progress-card::before {
  position: absolute;
  inset: 0 auto 0 0;
  width: 6px;
  background: var(--risk);
  content: '';
}
.risk-medium {
  --risk: var(--tower-risk-medium, #ae7a18);
}
.risk-high {
  --risk: var(--tower-risk-high, #d6572b);
}
.risk-overdue {
  --risk: var(--tower-risk-overdue, #9d2732);
}
.risk-none {
  --risk: var(--tower-risk-none, #71908a);
}
.card-head,
.order-progress-card footer {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.1rem 1.25rem 1rem 1.5rem;
}
.card-head h2 {
  margin: 0.18rem 0;
  font-size: 1.25rem;
}
.card-head span,
.order-progress-card footer {
  color: #617078;
  font-size: 0.8rem;
}
.risk-stamp {
  border: 1px solid currentColor;
  color: var(--risk);
  background: repeating-linear-gradient(135deg, transparent 0 5px, currentColor 5px 6px);
  background-color: #fffdf5;
  background-blend-mode: color-dodge;
  padding: 0.35rem 0.5rem;
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  white-space: nowrap;
}
.flow-strip {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border-block: 1px solid #c9c8bd;
  background: var(--ink-900);
  color: #fffdf5;
}
.flow-strip div {
  padding: 0.7rem 0.8rem;
  border-right: 1px solid #4d626a;
}
.flow-strip div:last-child {
  border-right: 0;
}
.flow-strip span {
  display: block;
  font-size: 0.68rem;
  letter-spacing: 0.12em;
}
.flow-strip b {
  display: block;
  margin-top: 0.16rem;
  font-size: 1.08rem;
  font-variant-numeric: tabular-nums;
}
.material-ledger {
  display: flex;
  gap: 0.55rem;
  padding: 0.8rem 1.25rem 0.2rem 1.5rem;
  flex-wrap: wrap;
}
.material-ledger span {
  border: 1px solid #8b9697;
  padding: 0.3rem 0.48rem;
  font-size: 0.75rem;
}
.quality-ledger {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  margin: 0.55rem 1.25rem 0.3rem 1.5rem;
  border-top: 1px solid #c9c8bd;
}
.quality-ledger div {
  padding: 0.7rem 0;
  border-bottom: 1px solid #c9c8bd;
}
.quality-ledger div:nth-child(odd) {
  padding-right: 0.75rem;
}
.quality-ledger dt {
  color: #657277;
  font-size: 0.68rem;
  letter-spacing: 0.08em;
}
.quality-ledger dd {
  margin: 0.22rem 0 0;
  font-weight: 700;
}
.order-progress-card footer {
  align-items: center;
  padding-left: 1.5rem;
}
.order-progress-card footer span {
  overflow-wrap: anywhere;
}
.order-progress-card footer a {
  color: var(--ink-900);
  font-weight: 800;
}
.order-progress-card footer a:focus-visible {
  outline: 3px solid var(--risk);
  outline-offset: 4px;
}
@keyframes tower-card-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@media (prefers-reduced-motion: reduce) {
  .order-progress-card {
    animation: none;
    transition: none;
  }
  .order-progress-card:hover {
    transform: none;
  }
}
@media (max-width: 660px) {
  .flow-strip,
  .quality-ledger {
    grid-template-columns: repeat(2, 1fr);
  }
  .flow-strip div:nth-child(2) {
    border-right: 0;
  }
  .card-head,
  .order-progress-card footer {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
