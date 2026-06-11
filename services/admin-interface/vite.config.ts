import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/v1': {
        target: 'https://localhost:8448',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: { outDir: 'dist' },
});
