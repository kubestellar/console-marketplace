import { fileURLToPath } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('.', import.meta.url))
const MARKETPLACE_ROOT = 'web'
const SHARED_TEST_SETUP = './web/src/test/setup.ts'
const COVERAGE_THRESHOLD = 70

export default {
  root: REPO_ROOT,
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: SHARED_TEST_SETUP,
    css: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html'],
      exclude: [
        `${MARKETPLACE_ROOT}/src/**/*.{test,spec}.{ts,tsx}`,
        `${MARKETPLACE_ROOT}/src/**/__tests__/**`,
        `${MARKETPLACE_ROOT}/src/**/*.d.ts`,
      ],
      thresholds: {
        lines: COVERAGE_THRESHOLD,
        statements: COVERAGE_THRESHOLD,
        functions: COVERAGE_THRESHOLD,
        branches: COVERAGE_THRESHOLD,
      },
    },
  },
}
