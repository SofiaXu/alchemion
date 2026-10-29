import js from '@eslint/js'
import ts from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

export default ts.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '.tools/**',
      '.tmp/**',
      'test-results/**',
      'playwright-report/**'
    ]
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  prettier,
  {
    files: ['**/*.mjs'],
    languageOptions: {
      globals: Object.fromEntries(
        [
          'process',
          'console',
          'URL',
          'setTimeout',
          'clearTimeout',
          'Buffer',
          'window',
          'document',
          'performance',
          'requestAnimationFrame'
        ].map((name) => [name, 'readonly'])
      )
    }
  },
  {
    files: ['packages/alchemion/src/core/**/*.ts'],
    ignores: ['**/__tests__/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '**/internal/**',
            '**/formats/**',
            '**/formats',
            '**/viewer/**',
            '**/viewer',
            '@babylonjs/*',
            'three',
            'three/*',
            '*?worker*',
            'node:*',
            'vite',
            'vite/*'
          ]
        }
      ]
    }
  },
  {
    files: ['packages/alchemion/src/formats/**/*.ts'],
    ignores: ['**/__tests__/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '**/viewer/**',
            '**/viewer',
            '@babylonjs/*',
            'three',
            'three/*',
            '*?worker*',
            'node:*',
            'vite',
            'vite/*'
          ]
        }
      ]
    }
  }
)
