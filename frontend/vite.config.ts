import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // ── Production build ──────────────────────────────────────────────────────
  // vercel.json routes /api/* and /avatars/* to the Python serverless function,
  // so the frontend just uses relative paths — no proxy or absolute URL needed.
  build: {
    outDir: 'dist',
    sourcemap: false,
  },

  // ── Local development server ───────────────────────────────────────────────
  // The proxy below forwards /api/* and /avatars/* to the local FastAPI backend
  // (python -m uvicorn backend.app.main:app --port 8002).
  // This section is ignored during `vite build`; it only affects `vite dev`.
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8002',
        changeOrigin: true,
        secure: false,
      },
      '/avatars': {
        target: 'http://localhost:8002',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
