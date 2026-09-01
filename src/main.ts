import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { createApplicationRouter } from './router'
import { useAuthStore } from './stores/auth'
import { configureAuthRuntime } from './api/http'
import { createUnauthorizedHandler } from './authBoundary'
import 'element-plus/es/components/message/style/css'
import './styles/main.css'

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
app.mount('#app')
