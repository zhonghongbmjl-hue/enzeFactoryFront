<script setup lang="ts">
import { useRouter } from 'vue-router'
const router = useRouter()
</script>

<template>
  <main class="error-stage">
    <p class="error-code">403 / ACCESS DENIED</p>
    <h1>这道工序不在你的权限范围内</h1>
    <p>如需处理该业务，请联系系统管理员调整岗位权限。</p>
    <button class="primary-action compact" type="button" @click="router.replace('/')">
      返回控制塔
    </button>
  </main>
</template>
