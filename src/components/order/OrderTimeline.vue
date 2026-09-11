<script setup lang="ts">
import { computed } from 'vue'
import type { OrderProgress, OrderStatus } from '@/types/order'

const props = defineProps<{ status: OrderStatus; progress: OrderProgress }>()

const stages: Array<{ status: OrderStatus; label: string }> = [
  { status: 'PENDING_APPROVAL', label: '待审核' },
  { status: 'APPROVED', label: '已审核' },
  { status: 'MATERIAL_PREPARING', label: '物料准备中' },
  { status: 'READY_FOR_PRODUCTION', label: '物料齐套' },
  { status: 'IN_PRODUCTION', label: '生产中' },
  { status: 'QUALITY_INSPECTION', label: '质检' },
  { status: 'PACKING', label: '包装' },
  { status: 'PARTIALLY_SHIPPED', label: '部分发货' },
  { status: 'SHIPPED', label: '已发货' },
  { status: 'AFTER_SALES_OBSERVATION', label: '售后观察' },
  { status: 'COMPLETED', label: '订单完成' },
]

const currentIndex = computed(() => {
  if (props.status === 'DRAFT') return -1
  if (props.status === 'CANCELLED') return -2
  return stages.findIndex((stage) => stage.status === props.status)
})
const currentStageLabel = computed(() => {
  if (props.status === 'DRAFT') return '草稿'
  if (props.status === 'CANCELLED') return '已取消'
  return stages[currentIndex.value]?.label ?? '状态待同步'
})
const currentStagePosition = computed(() =>
  currentIndex.value >= 0 ? `${currentIndex.value + 1} / ${stages.length}` : '—',
)

function meter(label: string, value: number, definition: string) {
  const normalized = Math.max(0, Math.min(100, value))
  return {
    label,
    value: normalized,
    definition,
    state: normalized === 100 ? '已完成' : normalized === 0 ? '未开始' : '进行中',
  }
}

const meters = computed(() => [
  meter('物料', props.progress.materialPercent, '采购入库 / 生产齐套'),
  meter('生产', props.progress.productionPercent, '良品产出 / 计划数量'),
  meter('质量', props.progress.qualityPercent, '最终合格 / 计划数量'),
  meter('交付', props.progress.shipmentPercent, '客户签收 / 发运计划'),
])
</script>

<template>
  <section class="order-timeline-panel">
    <div class="mobile-stage-summary" aria-label="当前订单阶段">
      <span>当前阶段</span>
      <strong>{{ currentStageLabel }}</strong>
      <small>第 {{ currentStagePosition }} 步</small>
    </div>
    <el-steps :active="Math.max(currentIndex, 0)" finish-status="success" align-center>
      <el-step v-for="stage in stages" :key="stage.status" :title="stage.label" />
    </el-steps>
    <el-alert
      v-if="status === 'DRAFT'"
      title="订单仍在草稿阶段，提交后进入审核流程。"
      type="info"
      :closable="false"
      class="timeline-note"
    />
    <el-alert
      v-if="status === 'CANCELLED'"
      title="订单已取消，生命周期停止。"
      type="error"
      :closable="false"
      class="timeline-note"
    />
    <div class="order-progress-grid" aria-label="订单执行进度">
      <div v-for="item in meters" :key="item.label" class="order-meter">
        <span
          ><b>{{ item.label }}</b
          ><strong>{{ item.value }}% · {{ item.state }}</strong></span
        >
        <small>{{ item.definition }}</small>
        <el-progress :percentage="item.value" :stroke-width="10" :aria-label="item.definition" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.order-meter small {
  display: block;
  min-height: 1.25rem;
  margin-bottom: 0.45rem;
  color: var(--text-muted-on-fabric, #68645c);
  font-size: 0.75rem;
  line-height: 1.4;
}

.mobile-stage-summary {
  display: none;
}

@media (max-width: 760px) {
  .order-timeline-panel > .el-steps {
    display: none;
  }

  .mobile-stage-summary {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 0.75rem;
    align-items: baseline;
    padding: 0.85rem 1rem;
    border: 1px solid var(--line, #d8d2c5);
    background: rgba(255, 255, 255, 0.58);
  }

  .mobile-stage-summary span,
  .mobile-stage-summary small {
    color: var(--text-muted-on-fabric, #68645c);
  }
}
</style>
