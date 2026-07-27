import { defineConfig } from 'vite';

export default defineConfig({
  worker: { format: 'es' },
  optimizeDeps: {
    include: ['heic2any']
  }
});
