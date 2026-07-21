import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Local: proxy /api to WAIGO backend (default :3001). Production: set VITE_API_URL at build time.
const waigoApi = process.env.VITE_DEV_API_PROXY || 'http://localhost:3001'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': { target: waigoApi, changeOrigin: true },
    },
  },
})
