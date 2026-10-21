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
    fs: {
      // El servidor de desarrollo corre en un contenedor con el proyecto
      // completo montado en /app. Sin esta lista, cualquier peticion a un
      // archivo de configuracion (Dockerfile, .dockerignore, tsconfig...) pasa
      // por el transformador de Vite, que intenta parsearlo como JavaScript y
      // rompe la pagina con "invalid JS syntax".
      // Vite ya bloquea .env y *.pem por su cuenta; aqui se cubre el resto.
      deny: [
        '**/Dockerfile',
        '**/Dockerfile.*',
        '**/.dockerignore',
        '**/.gitignore',
        '**/.gitattributes',
        '**/tsconfig*.json',
        '**/*.tsbuildinfo',
        '**/vite.config.*',
        '**/package-lock.json',
        '**/pnpm-lock.yaml',
        '**/yarn.lock',
      ],
    },
  },
});