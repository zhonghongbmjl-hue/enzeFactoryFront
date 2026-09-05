<script lang="ts">
import { ElOption, ElSelect } from 'element-plus'
import { defineComponent, h, type Component, type PropType } from 'vue'

export interface SelectFieldOption {
  label: string | number
  value: string | number | boolean | object
  disabled?: boolean
}

type SelectFieldValue = string | number | boolean | object | null

// Element Plus 2.14 leaks internal option prop definitions to vue-tsc. Keeping
// the render boundary here preserves the real ElSelect/ElOption components and
// gives every page a stable, application-level value contract.
export default defineComponent({
  name: 'SelectField',
  inheritAttrs: false,
  props: {
    modelValue: {
      type: [String, Number, Boolean, Object] as PropType<SelectFieldValue>,
      default: '',
    },
    options: {
      type: Array as PropType<SelectFieldOption[]>,
      default: () => [],
    },
    id: { type: String, default: undefined },
    name: { type: String, default: undefined },
    dataTestid: { type: String, default: undefined },
  },
  emits: ['update:modelValue', 'change'],
  setup(props, { attrs, emit }) {
    const SelectControl = ElSelect as Component
    const OptionControl = ElOption as Component

    return () =>
      h(
        SelectControl,
        {
          ...attrs,
          id: props.id,
          name: props.name,
          'data-testid': props.dataTestid,
          modelValue: props.modelValue,
          'onUpdate:modelValue': (value: SelectFieldValue) => emit('update:modelValue', value),
          onChange: (value: SelectFieldValue) => emit('change', value),
        },
        () =>
          props.options.map((option) =>
            h(OptionControl, {
              key: String(option.value),
              label: option.label,
              value: option.value,
              disabled: option.disabled ?? false,
            }),
          ),
      )
  },
})
</script>
