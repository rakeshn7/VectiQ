import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['react-plotly.js', 'plotly.js/dist/plotly'],
  },
  build: {
    chunkSizeWarningLimit: 5500,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom', 'axios'],
          'plotly-vendor': ['plotly.js/dist/plotly', 'react-plotly.js'],
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    host: true,
  },
});
