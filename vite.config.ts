import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import { createVuePlugins } from './vite.plugins'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxy = {
    '/api': {
      target: env.VITE_DEV_API_TARGET || 'http://192.168.0.197:8080',
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
