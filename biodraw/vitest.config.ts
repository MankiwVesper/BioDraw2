import { defineConfig } from 'vitest/config'

// 仅测纯逻辑层（无 React/Konva/DOM），用 node 环境即可。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
