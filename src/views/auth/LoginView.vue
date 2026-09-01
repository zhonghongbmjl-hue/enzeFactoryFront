<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { ApiClientError } from '@/api/http'
import { safeReturnTo } from '@/router/safeReturn'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const loading = ref(false)
const errorMessage = ref('')
const traceId = ref('')
const form = reactive({ tenantCode: '', username: '', password: '' })

async function submit(): Promise<void> {
  if (loading.value) return
  errorMessage.value = ''
  traceId.value = ''
  loading.value = true
  try {
    await auth.login({
      tenantCode: form.tenantCode.trim().toLowerCase(),
      username: form.username.trim(),
      password: form.password,
    })
    ElMessage.success('身份核验通过，正在进入工厂控制台')
    await router.replace(safeReturnTo(route.query.returnTo))
  } catch (error) {
    const apiError =
      error instanceof ApiClientError ? error : new ApiClientError('登录暂时不可用，请稍后重试')
    errorMessage.value = apiError.message
    traceId.value = apiError.traceId ?? ''
    ElMessage.error(apiError.message)
  } finally {
    form.password = ''
    loading.value = false
  }
}
</script>

<template>
  <main class="login-stage">
    <section class="login-story" aria-label="系统简介">
      <div class="pattern-id">PATTERN / 02—01</div>
      <div class="cut-piece cut-piece-a" aria-hidden="true" />
      <div class="cut-piece cut-piece-b" aria-hidden="true" />
      <div class="story-copy">
        <p class="eyebrow">GARMENT FACTORY EXECUTION</p>
        <h1>让每一片布料，<br />都有清晰去向。</h1>
        <p>从 PO、齐套、生产抽检到交付，把工厂现场的每一次动作织进同一条数据经纬。</p>
      </div>
      <div class="work-ticket">
        <span>当前版本</span><b>V2.1</b><span>证据门禁</span><b>已启用</b>
      </div>
    </section>

    <section class="login-panel">
      <div class="panel-heading">
        <span class="status-pin" aria-hidden="true" />
        <div>
          <p>班次接入</p>
          <h2>登录控制台</h2>
        </div>
      </div>
      <p class="panel-note">请输入租户与账号信息。登录状态只保留在本次浏览器会话中。</p>

      <form @submit.prevent="submit">
        <label for="tenant-code">工厂租户代码</label>
        <input
          id="tenant-code"
          v-model="form.tenantCode"
          name="tenantCode"
          autocomplete="organization"
          maxlength="64"
          pattern="[a-z0-9][a-z0-9_\-]{1,63}"
          placeholder="例如 needle-one"
          required
        />
        <label for="username">工号 / 账号</label>
        <input
          id="username"
          v-model="form.username"
          name="username"
          autocomplete="username"
          maxlength="64"
          placeholder="请输入账号"
          required
        />
        <label for="password">密码</label>
        <input
          id="password"
          v-model="form.password"
          name="password"
          type="password"
          autocomplete="current-password"
          minlength="8"
          maxlength="128"
          placeholder="至少 8 位"
          required
        />

        <div v-if="errorMessage" class="login-error" role="alert">
          <b>{{ errorMessage }}</b>
          <span v-if="traceId">报障追踪号：{{ traceId }}</span>
        </div>
        <div v-else-if="auth.sessionValidationMessage" class="login-error" role="alert">
          <b>{{ auth.sessionValidationMessage }}</b>
        </div>

        <button class="primary-action" type="submit" :disabled="loading">
          <span>{{ loading ? '正在核验…' : '进入工厂控制台' }}</span>
          <span aria-hidden="true">→</span>
        </button>
      </form>

      <p class="security-note">
        <span aria-hidden="true">●</span> JWT 不写入长期存储；关闭会话后自动清除
      </p>
    </section>
  </main>
</template>
