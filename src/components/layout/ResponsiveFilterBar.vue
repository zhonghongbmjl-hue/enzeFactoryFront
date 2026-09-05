<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: boolean
    formId: string
    title?: string
  }>(),
  { title: '筛选条件' },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: []
}>()
</script>

<template>
  <el-button
    class="filter-toggle"
    :aria-expanded="modelValue"
    :aria-controls="formId"
    @click="emit('update:modelValue', !modelValue)"
  >
    {{ title }}
  </el-button>
  <el-form
    :id="formId"
    class="filter-bar responsive-filters"
    :class="{ 'is-open': modelValue }"
    label-position="top"
    role="search"
    @submit.prevent="emit('submit')"
  >
    <div class="filter-fields">
      <slot />
    </div>
    <div class="filter-actions">
      <slot name="actions" />
    </div>
  </el-form>
</template>
