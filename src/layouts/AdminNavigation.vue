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
    <template v-for="item in props.items" :key="item.index">
      <li v-if="item.groupLabel" class="navigation-group-label" role="presentation">
        {{ item.groupLabel }}
      </li>
      <el-menu-item
        :index="item.index"
        :aria-label="item.ariaLabel"
        @click="emit('navigate', item.path)"
      >
        <el-icon aria-hidden="true"><component :is="item.icon" /></el-icon>
        <span>{{ item.label }}</span>
      </el-menu-item>
    </template>
  </el-menu>
</template>

<style scoped>
.navigation-group-label {
  padding: 12px 20px 5px;
  color: rgba(248, 244, 233, 0.5);
  font:
    700 10px/1.2 Consolas,
    monospace;
  letter-spacing: 0.14em;
}

.navigation-group-label:first-child {
  padding-top: 6px;
}
</style>
