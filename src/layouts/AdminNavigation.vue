<script setup lang="ts">
import type { AdminNavItem } from './nav'

const props = defineProps<{
  items: readonly AdminNavItem[]
  activeIndex: string
}>()

const emit = defineEmits<{ navigate: [path: string] }>()
</script>

<template>
  <el-menu
    class="admin-navigation"
    :default-active="activeIndex"
    background-color="var(--ink-900)"
    text-color="var(--text-muted-on-ink)"
    active-text-color="var(--ink-950)"
  >
    <el-menu-item
      v-for="item in props.items"
      :key="item.index"
      :index="item.index"
      :aria-label="item.ariaLabel"
      @click="emit('navigate', item.path)"
    >
      <el-icon aria-hidden="true"><component :is="item.icon" /></el-icon>
      <span>{{ item.label }}</span>
    </el-menu-item>
  </el-menu>
</template>
