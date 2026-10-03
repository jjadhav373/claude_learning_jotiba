import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:8080' } },
  build: {
    rollupOptions: { input: { main: 'index.html', prototype: 'prototype.html' } },
  },
});
