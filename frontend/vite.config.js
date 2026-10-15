import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const edgeApi = 'http://127.0.0.1:8000';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 3000,
    strictPort: true,
    open: false,
    proxy: {
      '/health': { target: edgeApi, changeOrigin: true },
      '/api': { target: edgeApi, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
