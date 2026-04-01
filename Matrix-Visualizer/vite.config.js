import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // Allows for relative path deployment like GitHub Pages
  build: {
    outDir: 'dist',
  }
});
