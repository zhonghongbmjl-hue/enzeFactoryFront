<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Close, Menu, SwitchButton } from '@element-plus/icons-vue'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import AdminNavigation from './AdminNavigation.vue'
import { activeNavIndex, visibleAdminNav } from './nav'

const auth = useAuthStore()
const app = useAppStore()
const { isDesktop, navigationOpen } = storeToRefs(app)
const route = useRoute()
const router = useRouter()
const navigationTrigger = ref<HTMLElement>()
app.syncViewport()
const initials = computed(() => auth.profile?.displayName.slice(0, 1) || '工')
const navItems = computed(() => visibleAdminNav(auth.permissions))
const routeName = computed(() => (typeof route.name === 'string' ? route.name : ''))
const activeMenu = computed(() => activeNavIndex(routeName.value, route.path, navItems.value))
const breadcrumbs = computed(() => route.meta.breadcrumbs ?? ['实时工况'])
const contentWidth = computed(() => route.meta.contentWidth ?? 'normal')

function syncViewport(): void {
  app.syncViewport()
}

async function signOut(): Promise<void> {
  const { remoteSucceeded } = await auth.logout()
  if (!remoteSucceeded) ElMessage.warning('服务器退出未确认，本机登录状态已安全清除')
  await router.replace({ name: 'login' })
}

function go(path: string): void {
  app.closeNavigation()
  void router.push(path)
}

function restoreNavigationTrigger(): void {
  if (!isDesktop.value) navigationTrigger.value?.focus()
}

watch(
  () => route.fullPath,
  async () => {
    app.closeNavigation()
    await nextTick()
    document.getElementById('main-content')?.focus({ preventScroll: true })
  },
)

onMounted(() => window.addEventListener('resize', syncViewport))
onUnmounted(() => window.removeEventListener('resize', syncViewport))
</script>

<template>
  <a class="skip-link" href="#main-content">跳至主要内容</a>
  <el-container class="admin-shell">
    <el-aside v-if="isDesktop" width="240px" aria-label="主导航">
      <RouterLink class="brand-mark" to="/" aria-label="经纬工厂控制台首页">
        <span class="brand-glyph" aria-hidden="true">JW</span>
        <span class="brand-copy"><b>经纬</b><small>FACTORY OS</small></span>
      </RouterLink>
      <AdminNavigation :items="navItems" :active-index="activeMenu" @navigate="go" />
      <div class="rail-status">
        <span class="shift-light" aria-hidden="true" />
        <span><small>系统状态</small><b>班次在线</b></span>
      </div>
    </el-aside>

    <el-container class="admin-workbench">
      <el-header>
        <div class="header-leading">
          <button
            v-if="!isDesktop"
            ref="navigationTrigger"
            class="navigation-trigger"
            type="button"
            aria-label="打开主导航"
            :aria-expanded="navigationOpen"
            aria-controls="mobile-navigation"
            @click="app.openNavigation()"
          >
            <el-icon><Menu /></el-icon>
          </button>
          <RouterLink v-if="!isDesktop" class="mobile-brand" to="/" aria-label="经纬工厂控制台首页">
            <span class="brand-glyph" aria-hidden="true">JW</span>
          </RouterLink>
          <div class="header-copy">
            <p class="eyebrow">GARMENT EXECUTION / 服装生产协同</p>
            <el-breadcrumb separator="/" aria-label="当前位置">
              <el-breadcrumb-item>控制塔</el-breadcrumb-item>
              <el-breadcrumb-item v-for="crumb in breadcrumbs" :key="crumb">
                {{ crumb }}
              </el-breadcrumb-item>
            </el-breadcrumb>
          </div>
        </div>

        <div class="operator">
          <el-avatar :size="38">{{ initials }}</el-avatar>
          <span class="operator-copy">
            <b>{{ auth.profile?.displayName }}</b>
            <small>{{ auth.profile?.tenantCode }}</small>
          </span>
          <el-dropdown trigger="click">
            <el-button text type="primary">
              账号<el-icon class="el-icon--right"><SwitchButton /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item divided @click="signOut">退出</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <el-main
        id="main-content"
        tabindex="-1"
        :class="`content-width-${contentWidth}`"
      >
        <RouterView />
      </el-main>
    </el-container>
  </el-container>

  <el-drawer
    v-if="!isDesktop"
    v-model="navigationOpen"
    class="mobile-navigation-drawer"
    direction="ltr"
    size="min(320px, 88vw)"
    :show-close="false"
    append-to-body
    @closed="restoreNavigationTrigger"
  >
    <template #header>
      <RouterLink class="brand-mark" to="/" aria-label="经纬工厂控制台首页" @click="go('/')">
        <span class="brand-glyph" aria-hidden="true">JW</span>
        <span class="brand-copy"><b>经纬</b><small>FACTORY OS</small></span>
      </RouterLink>
      <el-button text circle aria-label="关闭主导航" @click="app.closeNavigation()">
        <el-icon><Close /></el-icon>
      </el-button>
    </template>
    <nav id="mobile-navigation" aria-label="移动主导航">
      <AdminNavigation :items="navItems" :active-index="activeMenu" @navigate="go" />
    </nav>
    <div class="rail-status">
      <span class="shift-light" aria-hidden="true" />
      <span><small>系统状态</small><b>班次在线</b></span>
    </div>
  </el-drawer>
</template>
