import { defineConfig } from 'vite'
import { resolve } from 'path'
import dts from 'vite-plugin-dts'

export default defineConfig({
  build: {
    lib: { entry: resolve(__dirname, 'src/main.ts'), formats: ['es', 'cjs'] },
    copyPublicDir: false
  },
  resolve: { alias: { src: resolve('src/') } },
  plugins: [
    dts({
      // Exclude test files from the generated .d.ts file
      exclude: ['src/test.ts', '**/__tests__/**.ts']
    })
  ]
})
