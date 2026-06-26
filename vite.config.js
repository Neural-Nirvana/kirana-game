import { defineConfig } from 'vite';

const rawBase = process.env.KIRANA_BASE_PATH ?? '';
const base = rawBase ? (rawBase.endsWith('/') ? rawBase : `${rawBase}/`) : '/';

export default defineConfig({
  base,
  server: {
    proxy: {
      [base === '/' ? '/api' : `${base.replace(/\/$/, '')}/api`]: {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
});
