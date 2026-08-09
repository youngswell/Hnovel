import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      // 阅读器子项目代理到其 dev server（内部 3100），dev 统一走 3000 入口
      '/reader': {
        target: 'http://localhost:3100',
        changeOrigin: true,
      },
    },
  },
})
