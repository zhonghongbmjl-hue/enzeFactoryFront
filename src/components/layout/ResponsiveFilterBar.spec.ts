import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ResponsiveFilterBar from './ResponsiveFilterBar.vue'

describe('ResponsiveFilterBar', () => {
  it('associates the mobile toggle with the search form and updates expanded state', async () => {
    const wrapper = mount(ResponsiveFilterBar, {
      props: {
        modelValue: false,
        formId: 'ledger-filters',
      },
      slots: { default: '<label>关键词<input name="query" /></label>' },
    })

    const toggle = wrapper.get('.filter-toggle')
    expect(toggle.attributes('aria-controls')).toBe('ledger-filters')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    await toggle.trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true])
    await wrapper.setProps({ modelValue: true })
    expect(wrapper.get('#ledger-filters').classes()).toContain('is-open')
    expect(toggle.attributes('aria-expanded')).toBe('true')
  })

  it('submits on Enter and keeps fields and actions in separate layout slots', async () => {
    const wrapper = mount(ResponsiveFilterBar, {
      props: { modelValue: true, formId: 'order-filters' },
      slots: {
        default: '<label for="order-query">关键词</label><input id="order-query" />',
        actions: '<button type="submit">查询</button>',
      },
    })

    await wrapper.get('#order-filters').trigger('submit')
    expect(wrapper.emitted('submit')).toHaveLength(1)
    expect(wrapper.get('.filter-fields #order-query').exists()).toBe(true)
    expect(wrapper.get('.filter-actions button').text()).toBe('查询')
  })
})
