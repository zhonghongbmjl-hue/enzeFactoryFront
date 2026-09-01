<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const initials = computed(() => auth.profile?.displayName.slice(0, 1) || '工')

async function signOut(): Promise<void> {
  const { remoteSucceeded } = await auth.logout()
  if (!remoteSucceeded) ElMessage.warning('服务器退出未确认，本机登录状态已安全清除')
  await router.replace({ name: 'login' })
}
</script>

<template>
  <div class="admin-shell">
    <aside class="rail" aria-label="主导航">
      <RouterLink class="brand-mark" to="/" aria-label="经纬工厂控制台首页">
        <span class="brand-glyph" aria-hidden="true">JW</span>
        <span class="brand-copy"><b>经纬</b><small>FACTORY OS</small></span>
      </RouterLink>

      <nav class="rail-nav">
        <RouterLink to="/" class="rail-link" aria-label="履约总览">
          <span class="nav-index" aria-hidden="true">01</span>
          <span class="nav-long" aria-hidden="true">履约总览</span>
          <span class="nav-short" aria-hidden="true">总览</span>
        </RouterLink>
        <RouterLink
          v-if="auth.permissions.has('MASTERDATA_VIEW')"
          to="/master-data"
          class="rail-link"
          aria-label="基础资料"
        >
          <span class="nav-index" aria-hidden="true">02</span>
          <span class="nav-long" aria-hidden="true">基础资料</span>
          <span class="nav-short" aria-hidden="true">资料</span>
        </RouterLink>
        <RouterLink
          v-if="auth.permissions.has('PRODUCTION_MANAGE')"
          to="/production"
          class="rail-link"
          aria-label="生产排产"
        >
          <span class="nav-index" aria-hidden="true">03</span>
          <span class="nav-long" aria-hidden="true">生产排产</span>
          <span class="nav-short" aria-hidden="true">排产</span>
        </RouterLink>
        <RouterLink
          v-if="auth.permissions.has('PRODUCTION_MANAGE')"
          to="/work-orders"
          class="rail-link"
          aria-label="生产工单"
        >
          <span class="nav-index" aria-hidden="true">04</span>
          <span class="nav-long" aria-hidden="true">生产工单</span>
          <span class="nav-short" aria-hidden="true">工单</span>
        </RouterLink>
        <RouterLink
          v-if="auth.permissions.has('PRODUCT_VIEW')"
          to="/products"
          class="rail-link"
          aria-label="产品纸样"
        >
          <span class="nav-index" aria-hidden="true">05</span>
          <span class="nav-long" aria-hidden="true">产品纸样</span>
          <span class="nav-short" aria-hidden="true">产品</span>
        </RouterLink>
        <RouterLink
          v-if="auth.permissions.has('ORDER_VIEW')"
          to="/orders"
          class="rail-link"
          aria-label="订单履约"
        >
          <span class="nav-index" aria-hidden="true">06</span>
          <span class="nav-long" aria-hidden="true">订单履约</span>
          <span class="nav-short" aria-hidden="true">订单</span>
        </RouterLink>
        <RouterLink
          v-if="auth.permissions.has('PROCUREMENT_VIEW') && auth.permissions.has('ORDER_VIEW')"
          to="/orders"
          class="rail-link"
          aria-label="采购来料（按订单进入）"
        >
          <span class="nav-index" aria-hidden="true">07</span>
          <span class="nav-long" aria-hidden="true">采购来料</span>
          <span class="nav-short" aria-hidden="true">采购</span>
        </RouterLink>
        <RouterLink
          v-if="auth.permissions.has('INVENTORY_MANAGE')"
          to="/inventory"
          class="rail-link"
          aria-label="库存与领退料"
        >
          <span class="nav-index" aria-hidden="true">08</span>
          <span class="nav-long" aria-hidden="true">库存领退</span>
          <span class="nav-short" aria-hidden="true">库存</span>
        </RouterLink>
        <RouterLink
          v-if="auth.permissions.has('INVENTORY_MANAGE')"
          to="/cutting-kitting"
          class="rail-link"
          aria-label="裁剪与齐套"
        >
          <span class="nav-index" aria-hidden="true">09</span>
          <span class="nav-long" aria-hidden="true">裁剪齐套</span>
          <span class="nav-short" aria-hidden="true">齐套</span>
        </RouterLink>
        <RouterLink
          v-if="auth.permissions.has('QUALITY_INSPECT')"
          to="/quality"
          class="rail-link"
          aria-label="成品质量闭环"
        >
          <span class="nav-index" aria-hidden="true">10</span>
          <span class="nav-long" aria-hidden="true">品质闭环</span>
          <span class="nav-short" aria-hidden="true">品质</span>
        </RouterLink>
        <RouterLink
          v-if="
            auth.permissions.has('ORDER_VIEW') &&
            (auth.permissions.has('SHIPMENT_VIEW') || auth.permissions.has('AFTER_SALES_MANAGE'))
          "
          to="/orders"
          class="rail-link"
          aria-label="包装发运与售后（按订单进入）"
        >
          <span class="nav-index" aria-hidden="true">11</span>
          <span class="nav-long" aria-hidden="true">包装发运</span>
          <span class="nav-short" aria-hidden="true">发运</span>
        </RouterLink>
        <RouterLink
          v-if="auth.permissions.has('AFTER_SALES_MANAGE')"
          to="/after-sales"
          class="rail-link"
          aria-label="售后待办"
        >
          <span class="nav-index" aria-hidden="true">12</span>
          <span class="nav-long" aria-hidden="true">售后待办</span>
          <span class="nav-short" aria-hidden="true">售后</span>
        </RouterLink>
      </nav>

      <div class="rail-foot">
        <span class="shift-light" aria-hidden="true" />
        <span><small>系统状态</small><b>班次在线</b></span>
      </div>
    </aside>

    <section class="workbench">
      <header class="topbar">
        <div>
          <p class="eyebrow">GARMENT EXECUTION / 服装生产协同</p>
          <p class="crumb">控制塔 <span>/</span> 实时工况</p>
        </div>
        <div class="operator">
          <span class="operator-badge">{{ initials }}</span>
          <span class="operator-copy">
            <b>{{ auth.profile?.displayName }}</b>
            <small>{{ auth.profile?.tenantCode }}</small>
          </span>
          <button class="text-button" type="button" @click="signOut">退出</button>
        </div>
      </header>
      <main class="content-plane">
        <RouterView />
      </main>
    </section>
  </div>
</template>
