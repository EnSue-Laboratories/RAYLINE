import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        pm: resolve(__dirname, 'src/project-manager.html'),
        terminal: resolve(__dirname, 'src/terminal-window.html'),
      },
    },
  },
})
