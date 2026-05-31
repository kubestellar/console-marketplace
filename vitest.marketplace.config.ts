import type { ConfigEnv } from 'vite'
import { defineConfig, mergeConfig } from 'vitest/config'

import consoleConfig from './console-parent/web/vite.config'

const MARKETPLACE_ROOT = '../../web'
const MARKETPLACE_TEST_GLOB = `${MARKETPLACE_ROOT}/src/**/*.{test,spec}.{ts,tsx}`
const MARKETPLACE_COVERAGE_GLOB = `${MARKETPLACE_ROOT}/src/**/*.{ts,tsx}`
const COVERAGE_THRESHOLD = 70

const testEnv: ConfigEnv = {
  command: 'serve',
  mode: 'test',
  isSsrBuild: false,
  isPreview: false,
}

const baseConfig = typeof consoleConfig === 'function' ? consoleConfig(testEnv) : consoleConfig

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: [MARKETPLACE_TEST_GLOB],
      coverage: {
        all: true,
        provider: 'v8',
        reporter: ['text', 'json', 'json-summary', 'html'],
        include: [MARKETPLACE_COVERAGE_GLOB],
        exclude: [
          `${MARKETPLACE_ROOT}/src/**/*.{test,spec}.{ts,tsx}`,
          `${MARKETPLACE_ROOT}/src/**/__tests__/**`,
          `${MARKETPLACE_ROOT}/src/**/*.d.ts`,
        ],
        thresholds: {
          lines: COVERAGE_THRESHOLD,
        },
      },
    },
  }),
)
