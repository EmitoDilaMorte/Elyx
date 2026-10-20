import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['elyx-app.com', 'www.elyx-app.com'],
    watch: {
      usePolling: true,
      interval: 120,
    },
  },
});