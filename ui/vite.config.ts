import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// In dev (`npm run dev`) the React app runs on 5173 and proxies /api to the Express
// pipeline server on 5050. In production (`npm run ui`) the Express server serves the
// built dist/ directly, so no proxy is involved.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:5050' },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
