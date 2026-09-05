<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { ApiClientError } from '@/api/http'
import { safeReturnTo } from '@/router/safeReturn'

const TENANT_PATTERN = '[a-z0-9][a-z0-9_\\-]{1,63}'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const formRef = ref<FormInstance>()
const loading = ref(false)
const errorMessage = ref('')
const traceId = ref('')
const form = reactive({ tenantCode: '', username: '', password: '' })
const rules: FormRules<typeof form> = {
  tenantCode: [{ required: true, message: '请输入工厂租户代码', trigger: 'blur' }],
  username: [{ required: true, message: '请输入工号 / 账号', trigger: 'blur' }],
  password: [{ required: true, min: 8, message: '密码至少 8 位', trigger: 'blur' }],
}

async function submit(): Promise<void> {
  if (loading.value) return
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
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
  <el-row class="login-stage" :gutter="0">
    <el-col :xs="24" :md="14" class="login-story" aria-label="系统简介">
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
    </el-col>

    <el-col :xs="24" :md="10" class="login-panel">
      <el-card shadow="never" class="login-card">
        <div class="panel-heading">
          <span class="status-pin" aria-hidden="true" />
          <div>
            <p>班次接入</p>
            <h2>登录控制台</h2>
          </div>
        </div>
        <p class="panel-note">请输入租户与账号信息。登录状态只保留在本次浏览器会话中。</p>

        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          label-position="top"
          @submit.prevent="submit"
        >
          <el-form-item label="工厂租户代码" prop="tenantCode">
            <el-input
              id="tenant-code"
              v-model="form.tenantCode"
              name="tenantCode"
              autocomplete="organization"
              maxlength="64"
              :pattern="TENANT_PATTERN"
              placeholder="例如 needle-one"
            />
          </el-form-item>
          <el-form-item label="工号 / 账号" prop="username">
            <el-input
              id="username"
              v-model="form.username"
              name="username"
              autocomplete="username"
              maxlength="64"
              placeholder="请输入账号"
            />
          </el-form-item>
          <el-form-item label="密码" prop="password">
            <el-input
              id="password"
              v-model="form.password"
              name="password"
              type="password"
              autocomplete="current-password"
              show-password
              minlength="8"
              maxlength="128"
              placeholder="至少 8 位"
            />
          </el-form-item>

          <el-alert
            v-if="errorMessage"
            :title="errorMessage"
            type="error"
            :closable="false"
            show-icon
            role="alert"
          >
            <span v-if="traceId">报障追踪号：{{ traceId }}</span>
          </el-alert>
          <el-alert
            v-else-if="auth.sessionValidationMessage"
            :title="auth.sessionValidationMessage"
            type="warning"
            :closable="false"
            show-icon
            role="alert"
          />

          <el-form-item>
            <el-button type="primary" native-type="submit" :loading="loading" class="login-submit">
              {{ loading ? '正在核验…' : '进入工厂控制台' }}
            </el-button>
          </el-form-item>
        </el-form>

        <p class="security-note">
          <span aria-hidden="true">●</span> JWT 不写入长期存储；关闭会话后自动清除
        </p>
      </el-card>
    </el-col>
  </el-row>
</template>
