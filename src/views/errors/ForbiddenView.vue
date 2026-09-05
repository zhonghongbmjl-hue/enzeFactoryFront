<script setup lang="ts">
import { useRouter } from 'vue-router'
const router = useRouter()
</script>

<template>
  <el-result
    class="system-result"
    icon="warning"
    title="这道工序不在你的权限范围内"
    sub-title="如需处理该业务，请联系系统管理员调整岗位权限。"
  >
    <template #extra>
      <el-button type="primary" @click="router.replace('/')">返回控制塔</el-button>
    </template>
  </el-result>
</template>
