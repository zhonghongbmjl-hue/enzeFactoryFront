import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SelectField from './SelectField.vue'

describe('SelectField', () => {
  const options = [
    { label: '面料', value: 'FABRIC' },
    { label: '辅料', value: 'ACCESSORY' },
  ]

  it('enables clearable by default and treats a cleared value as empty', async () => {
    const wrapper = mount(SelectField, {
      props: { modelValue: 'FABRIC', options },
    })
    const select = wrapper.getComponent({ name: 'ElSelect' })

    expect(select.props('clearable')).toBe(true)
    await select.vm.$emit('update:modelValue', null)
    await select.vm.$emit('change', null)

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([''])
    expect(wrapper.emitted('change')?.[0]).toEqual([''])
  })

  it('allows a page to disable clearable', () => {
    const wrapper = mount(SelectField, {
      props: { modelValue: 'FABRIC', options },
      attrs: { clearable: false },
    })

    expect(wrapper.getComponent({ name: 'ElSelect' }).props('clearable')).toBe(false)
  })
})
