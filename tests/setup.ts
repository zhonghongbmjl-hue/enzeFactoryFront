import { afterEach } from 'vitest'
import { config } from '@vue/test-utils'

config.global.stubs = { transition: false, 'el-icon': true }

afterEach(() => {
  window.sessionStorage.clear()
  window.localStorage.clear()
  window.history.replaceState({}, '', '/')
  document.body.innerHTML = ''
})
