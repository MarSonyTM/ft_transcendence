import { defineConfig } from 'vite'

export default defineConfig({
  root: './src',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'terser',
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://backend_dev:3000',
        changeOrigin: true,
      }
    }
  },
  preview: {
    port: 5173,
    host: '0.0.0.0'
  }
})
