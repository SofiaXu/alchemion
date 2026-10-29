import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

export default defineConfig({
  plugins: [
    {
      name: 'portable-module-workers',
      writeBundle() {
        execFileSync(
          process.execPath,
          [
            fileURLToPath(new URL('../../scripts/worker-urls.mjs', import.meta.url)),
            ...(this.meta.watchMode ? ['--watch'] : [])
          ],
          { stdio: 'inherit' }
        )
        execFileSync(
          process.execPath,
          [fileURLToPath(new URL('../../scripts/format-data.mjs', import.meta.url))],
          { stdio: 'inherit' }
        )
      }
    }
  ],
  base: './',
  build: {
    target: 'es2022',
    copyPublicDir: false,
    lib: {
      entry: Object.fromEntries(
        ['core', 'formats', 'viewer'].map((entry) => [
          entry,
          fileURLToPath(new URL(`./src/${entry}/index.ts`, import.meta.url))
        ])
      ),
      formats: ['es'],
      fileName: (_format, entry) => `${entry}.js`
    },
    rollupOptions: {
      external: (id) => /^(@babylonjs\/|rxjs(?:\/|$)|mathjs$|earcut$|deep-object-diff$)/.test(id)
    }
  },
  worker: { format: 'es' }
})
