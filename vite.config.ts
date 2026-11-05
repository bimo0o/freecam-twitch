import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  server: { proxy: { '/api': 'http://127.0.0.1:3000', '/media': 'http://127.0.0.1:3000' } },
  build: {
    minify: false,
    rolldownOptions: { input: ['index.html', 'overlay.html', 'config.html', 'packed.html'], output: { manualChunks: (id: string) => id.includes('hls.js') ? 'hls' : undefined } }
  }
});
