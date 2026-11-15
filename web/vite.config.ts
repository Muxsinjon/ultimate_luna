import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Production bundles use Preact's React-compatible runtime (about 180 kB smaller than React).
// The component code is plain React; Vitest and the dev server keep using React itself.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: './',
  resolve:
    command === 'build'
      ? {
          alias: [
            { find: /^react-dom\/client$/, replacement: 'preact/compat/client' },
            { find: /^react-dom$/, replacement: 'preact/compat' },
            { find: /^react\/jsx-runtime$/, replacement: 'preact/jsx-runtime' },
            { find: /^react\/jsx-dev-runtime$/, replacement: 'preact/jsx-dev-runtime' },
            { find: /^react$/, replacement: 'preact/compat' },
          ],
        }
      : {},
  build: { target: 'es2022' },
}))
