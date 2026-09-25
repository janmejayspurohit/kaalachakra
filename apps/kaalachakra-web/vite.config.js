import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy keeps the browser on one origin, so no CORS in dev and the
    // production build can sit behind the same reverse proxy unchanged.
    proxy: { '/api': { target: 'http://127.0.0.1:5174', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') } },
  },
});
