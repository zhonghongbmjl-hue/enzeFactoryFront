import { h } from 'vue'
import { mount } from '@vue/test-utils'
import { ElInput, ElSelect } from 'element-plus'
import { describe, expect, it } from 'vitest'
import { applyElementPlusClearableDefaults } from './elementPlusDefaults'

describe('elementPlusDefaults', () => {
  it('makes Element Plus inputs and selects clearable unless a page opts out', () => {
    applyElementPlusClearableDefaults()

    expect(
      mount({ render: () => h(ElInput) })
        .getComponent({ name: 'ElInput' })
        .props('clearable'),
    ).toBe(true)
    expect(
      mount({ render: () => h(ElSelect) })
        .getComponent({ name: 'ElSelect' })
        .props('clearable'),
    ).toBe(true)
    expect(
      mount({ render: () => h(ElInput, { clearable: false }) })
        .getComponent({ name: 'ElInput' })
        .props('clearable'),
    ).toBe(false)
  })
})
