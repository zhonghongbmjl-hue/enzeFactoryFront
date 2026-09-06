import { afterEach, beforeEach } from 'vitest'
import { config } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import { applyElementPlusClearableDefaults } from '@/elementPlusDefaults'

applyElementPlusClearableDefaults()

config.global.plugins = [ElementPlus]
config.global.stubs = { transition: false }

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  window.sessionStorage.clear()
  window.localStorage.clear()
  window.history.replaceState({}, '', '/')
  document.body.innerHTML = ''
})
