import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // ne scanne que les sources — sinon vitest ramasse les .js compiles dans dist/
    include: ['src/**/*.test.ts'],
  },
})
