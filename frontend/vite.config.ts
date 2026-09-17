import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

const rootPkg = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf8'),
) as { version?: string }

const appVersion = process.env.APP_VERSION?.trim() || rootPkg.version || '0.0.0'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
  },
  plugins: [vue(), ...(mode === 'development' ? [vueDevTools()] : [])],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: process.env.FRONTEND_PORT ? Number(process.env.FRONTEND_PORT) : 5173,
    strictPort: Boolean(process.env.FRONTEND_PORT),
    proxy: {
      '/api': process.env.READATHON_API_ORIGIN || 'http://localhost:3001',
    },
  },
  preview: {
    proxy: {
      '/api': process.env.READATHON_API_ORIGIN || 'http://localhost:3001',
    },
  },
}))
