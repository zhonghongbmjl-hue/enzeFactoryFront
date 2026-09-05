import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import App from './App.vue'
import { createApplicationRouter } from './router'
import { useAuthStore } from './stores/auth'
import './stores'
import { configureAuthRuntime } from './api/http'
import { createUnauthorizedHandler } from './authBoundary'
import './styles/main.css'
import './styles/form-system.css'

const app = createApp(App)
const pinia = createPinia()
const auth = useAuthStore(pinia)
auth.restoreSession()
const router = createApplicationRouter(pinia)

configureAuthRuntime({
  getSession: () => ({ token: auth.token, generation: auth.generation }),
  onUnauthorized: createUnauthorizedHandler(auth, router),
})

app.use(pinia)
app.use(router)
app.use(ElementPlus, { locale: zhCn } as never)
app.mount('#app')
