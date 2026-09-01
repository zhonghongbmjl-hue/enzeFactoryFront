<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { procurementApi } from '@/api/procurement'
import { useAuthStore } from '@/stores/auth'
import type { MaterialBranch, ProcurementWorkspace, PurchasePlan } from '@/types/procurement'
import { PLAN_STATUS_LABELS } from '@/types/procurement'

const route = useRoute()
const auth = useAuthStore()
const workspace = ref<ProcurementWorkspace>()
const loading = ref(false)
const pending = ref('')
const failure = ref('')
const traceId = ref('')
const orderId = computed(() => String(route.params.orderId))
const canManage = computed(() => auth.permissions.has('PROCUREMENT_MANAGE'))
const canApprove = computed(() => auth.permissions.has('PROCUREMENT_APPROVE'))
const canViewOrder = computed(() => auth.permissions.has('ORDER_VIEW'))
const stages = ['采购计划', '采购下单', '到货登记', '来料检验', '合格品上架', '采购闭环']

function orderedBranches(): PurchasePlan[] {
  const order: MaterialBranch[] = ['FABRIC', 'ACCESSORY']
  return [...(workspace.value?.branches ?? [])].sort(
    (left, right) => order.indexOf(left.materialType) - order.indexOf(right.materialType),
  )
}

function branchLabel(type: MaterialBranch): string {
  return type === 'FABRIC' ? '布料采购' : '辅料采购'
}

function branchCode(type: MaterialBranch): string {
  return type === 'FABRIC' ? 'FABRIC TRACK' : 'ACCESSORY TRACK'
}

function stageIndex(plan: PurchasePlan): number {
  if (plan.status === 'COMPLETED') return 5
  if (plan.status === 'DRAFT' || plan.status === 'PENDING_APPROVAL') return 0
  const itemStages = plan.items.map((item) => {
    if (item.orderedQuantity < item.plannedQuantity) return 1
    if (item.receivedQuantity < item.orderedQuantity) return 2
    if (item.inspectedQuantity < item.receivedQuantity) return 3
    return 4
  })
  return itemStages.length ? Math.min(...itemStages) : 1
}

function report(error: unknown, fallback: string): void {
  const candidate = error as { message?: string; traceId?: string }
  failure.value = candidate.message || fallback
  traceId.value = candidate.traceId || ''
}

async function load(): Promise<void> {
  loading.value = true
  failure.value = ''
  try {
    workspace.value = await procurementApi.workspace(orderId.value)
  } catch (error) {
    report(error, '采购工作台加载失败')
  } finally {
    loading.value = false
  }
}

async function act(plan: PurchasePlan, action: 'submit' | 'approve' | 'complete'): Promise<void> {
  const key = `${plan.id}:${action}`
  if (pending.value) return
  pending.value = key
  failure.value = ''
  try {
    const updated = await procurementApi.planAction(plan.id, action, plan.version)
    if (workspace.value) {
      workspace.value = {
        ...workspace.value,
        branches: workspace.value.branches.map((item) => (item.id === updated.id ? updated : item)),
      }
    }
    const message = {
      submit: '采购计划已提交审核',
      approve: '采购计划已审核',
      complete: '采购计划已完成',
    }[action]
    ElMessage.success(message)
  } catch (error) {
    report(error, '采购计划状态更新失败')
  } finally {
    pending.value = ''
  }
}

onMounted(load)
</script>

<template>
  <section class="procurement-workspace" :aria-busy="loading">
    <header class="detail-ticket procurement-ticket">
      <div>
        <p class="eyebrow">MATERIAL INBOUND / ORDER {{ orderId }}</p>
        <h1>采购与来料工作台</h1>
        <p>布料、辅料独立推进；到货、检验、上架数量逐笔守恒。</p>
      </div>
      <RouterLink
        v-if="canViewOrder"
        class="outline-action procurement-back"
        :to="`/orders/${orderId}`"
      >
        返回订单
      </RouterLink>
    </header>

    <div v-if="failure" class="master-error" role="alert" aria-live="polite">
      <b>{{ failure }}</b
      ><span v-if="traceId">追踪号 {{ traceId }}</span>
    </div>

    <div v-if="workspace" class="procurement-branches">
      <article
        v-for="plan in orderedBranches()"
        :key="plan.id"
        data-testid="procurement-branch"
        class="procurement-branch"
        :class="plan.materialType.toLowerCase()"
      >
        <header class="branch-head">
          <div>
            <p class="eyebrow">{{ branchCode(plan.materialType) }}</p>
            <h2>{{ branchLabel(plan.materialType) }}</h2>
            <code>{{ plan.orderNo }}</code>
          </div>
          <span class="branch-state" :class="plan.status.toLowerCase()">
            {{ PLAN_STATUS_LABELS[plan.status] }}
          </span>
        </header>

        <ol class="branch-stages" :aria-label="`${branchLabel(plan.materialType)}进度`">
          <li
            v-for="(stage, index) in stages"
            :key="stage"
            :class="{ current: index === stageIndex(plan), done: index < stageIndex(plan) }"
          >
            <b>{{ String(index + 1).padStart(2, '0') }}</b
            ><span>{{ stage }}</span>
          </li>
        </ol>

        <div class="responsive-table branch-table">
          <table class="order-data-table">
            <thead>
              <tr>
                <th>物料</th>
                <th>采购数量</th>
                <th>执行数量</th>
                <th>来源关系</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in plan.items" :key="item.id">
                <td>
                  <code>{{ item.materialCode }}</code
                  ><small>{{ item.materialName }}</small>
                </td>
                <td>
                  <b>{{ item.plannedQuantity }} {{ item.uom }}</b>
                </td>
                <td>
                  <span class="item-quantity-progress">
                    <small>下单 {{ item.orderedQuantity }}</small>
                    <small>到货 {{ item.receivedQuantity }}</small>
                    <small>检验 {{ item.inspectedQuantity }}</small>
                    <small>合格 {{ item.passedQuantity }}</small>
                    <small v-if="item.rejectedQuantity">不合格 {{ item.rejectedQuantity }}</small>
                    <small>上架 {{ item.putAwayQuantity }}</small>
                  </span>
                </td>
                <td>
                  <span class="source-chain">
                    <small
                      >订单项 <code>{{ item.orderItemId.slice(0, 8) }}</code></small
                    >
                    <small
                      >冻结BOM <code>{{ item.bomSnapshotId.slice(0, 8) }}</code></small
                    >
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <footer class="branch-actions">
          <span>版本 {{ plan.version }} · {{ plan.items.length }} 项</span>
          <button
            v-if="canManage && plan.status === 'DRAFT'"
            :data-testid="`submit-${plan.materialType.toLowerCase()}-plan`"
            class="primary-action compact"
            type="button"
            :disabled="!!pending"
            @click="act(plan, 'submit')"
          >
            <span>提交采购计划</span><b>→</b>
          </button>
          <button
            v-if="canApprove && plan.status === 'PENDING_APPROVAL'"
            :data-testid="`approve-${plan.materialType.toLowerCase()}-plan`"
            class="primary-action compact"
            type="button"
            :disabled="!!pending"
            @click="act(plan, 'approve')"
          >
            <span>审核采购计划</span><b>✓</b>
          </button>
          <button
            v-if="canManage && plan.status === 'ORDERED'"
            :data-testid="`complete-${plan.materialType.toLowerCase()}-plan`"
            class="primary-action compact"
            type="button"
            :disabled="!!pending"
            @click="act(plan, 'complete')"
          >
            <span>完成采购计划</span><b>✓</b>
          </button>
        </footer>
      </article>
    </div>

    <article v-else-if="!loading && !failure" class="pattern-panel panel-empty">
      订单审核后，系统会按冻结BOM自动生成布料与辅料采购分支。
    </article>
  </section>
</template>
