import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const frontendHost = env.FRONTEND_HOST || '127.0.0.1';
  const frontendPort = Number(env.FRONTEND_PORT || 3000);
  const backendUrl = env.VITE_BACKEND_URL || `http://127.0.0.1:${env.BACKEND_PORT || '8001'}`;

  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || env.API_KEY || env.VITE_GEMINI_API_KEY || ''),
      'process.env.API_KEY': JSON.stringify(env.API_KEY || ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: frontendHost,
      port: frontendPort,
      strictPort: false,
      watch: {
        ignored: [
          '**/.idea/**',
          '**/logs/**',
          '**/*.log',
          '**/app.log',
          '**/python_output.txt',
          '**/acts.db',
          '**/acts.db-shm',
          '**/acts.db-wal',
          '**/__pycache__/**',
          '**/*.tmp'
        ]
      },
      proxy: {
        '/api': {
          target: backendUrl,
          changeOrigin: true,
          secure: false,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              console.log(`Proxying Request: ${req.method} ${req.url} -> ${backendUrl}`);
            });
            proxy.on('proxyRes', (proxyRes, req) => {
              console.log(`Proxy Response: ${proxyRes.statusCode} ${req.url}`);
            });
            proxy.on('error', (err, req) => {
              console.error(`Proxy Error for ${req.url}:`, err.message);
            });
          },
        },
      },
    },
  };
});
