<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { safeReturnTo } from '@/router/safeReturn'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const retrying = ref(false)

async function retry(): Promise<void> {
  if (retrying.value) return
  retrying.value = true
  const result = await auth.validateRestoredSession()
  retrying.value = false
  if (result === 'valid') await router.replace(safeReturnTo(route.query.returnTo))
  if (result === 'anonymous') await router.replace({ name: 'login' })
}
</script>

<template>
  <el-result
    class="system-result"
    icon="info"
    title="暂时无法核验登录状态"
    :sub-title="auth.sessionValidationMessage || '服务端暂时不可达，请检查网络后重试。'"
  >
    <template #extra>
      <p>为保护工厂数据，核验完成前不会开放业务页面，也不会把网络故障误判为凭证失效。</p>
      <el-button type="primary" :loading="retrying" @click="retry">
        {{ retrying ? '正在重新核验…' : '重新核验' }}
      </el-button>
    </template>
  </el-result>
</template>
