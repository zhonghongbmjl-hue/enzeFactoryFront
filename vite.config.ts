import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import { createVuePlugins } from './vite.plugins'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Keep the browser on a same-origin /api URL and switch only the dev proxy target.
  // Named Vite modes provide explicit local/original backend profiles; this fallback
  // makes an unprofiled Vite invocation use the backend checked out beside the frontend.
  const apiTarget = env.VITE_DEV_API_TARGET || 'http://127.0.0.1:18080'
  const proxy = {
    '/api': {
      target: apiTarget,
      changeOrigin: true,
    },
  }
  return {
    plugins: createVuePlugins(),
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      // host: '192.168.0.197',
      port: 5173,
      proxy,
    },
    preview: { proxy },
  }
})
