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

const meters = computed(() => [
  { label: '物料', value: props.progress.materialPercent },
  { label: '生产', value: props.progress.productionPercent },
  { label: '质量', value: props.progress.qualityPercent },
  { label: '交付', value: props.progress.shipmentPercent },
])
</script>

<template>
  <section class="order-timeline-panel">
    <div class="order-stage-scroll">
      <ol class="order-stage-line" aria-label="订单生命周期">
        <li
          v-for="(stage, index) in stages"
          :key="stage.status"
          :class="{ done: currentIndex >= index, current: currentIndex === index }"
          :aria-current="currentIndex === index ? 'step' : undefined"
        >
          <b>{{ String(index + 1).padStart(2, '0') }}</b
          ><span>{{ stage.label }}</span>
        </li>
      </ol>
    </div>
    <p v-if="status === 'DRAFT'" class="timeline-note">订单仍在草稿阶段，提交后进入审核流程。</p>
    <p v-if="status === 'CANCELLED'" class="timeline-note danger">订单已取消，生命周期停止。</p>
    <div class="order-progress-grid" aria-label="订单执行进度">
      <div v-for="meter in meters" :key="meter.label" class="order-meter">
        <span
          ><b>{{ meter.label }}</b
          ><strong>{{ meter.value }}%</strong></span
        >
        <progress :value="meter.value" max="100">{{ meter.value }}%</progress>
      </div>
    </div>
  </section>
</template>
