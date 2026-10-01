import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // Agent worktrees and local tooling copies must not be collected.
    exclude: [...configDefaults.exclude, '.worktrees/**', '.claude/**', 'dist-electron/**'],
  },
  base: './',
  resolve: {
    alias: {
      '@shared': resolve(rootDir, 'shared'),
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      input: {
        main: resolve(rootDir, 'index.html'),
        pm: resolve(rootDir, 'src/project-manager.html'),
        terminal: resolve(rootDir, 'src/terminal-window.html'),
      },
      output: {
        // Stable vendor chunks shared by the three windows. Heavy optional
        // libraries (mermaid, katex, html-to-image, prism grammars) are
        // loaded via dynamic import() at their use sites instead.
        codeSplitting: {
          groups: [
            { name: 'react-vendor', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 30 },
            // Math (remark-math / rehype-katex / KaTeX) and raw HTML (rehype-raw / parse5 /
            // rehype-sanitize) are excluded: chat-core loads them on demand.
            { name: 'markdown', test: /node_modules[\\/](react-markdown|remark-(?!math)[^\\/]+|rehype-(?!katex|raw|sanitize)[^\\/]+|unified|micromark(?!-extension-math)[^\\/]*|mdast-(?!util-math)[^\\/]+|hast-(?!util-(?:raw|sanitize|from-parse5|to-parse5|from-html|from-dom|to-text))[^\\/]+|unist-[^\\/]+|vfile[^\\/]*)[\\/]/, priority: 20 },
            { name: 'xterm', test: /node_modules[\\/]@xterm[\\/]/, priority: 20 },
          ],
        },
      },
    },
  },
})
