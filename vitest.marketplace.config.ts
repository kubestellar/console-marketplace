import { fileURLToPath } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('.', import.meta.url))
const MARKETPLACE_ROOT = 'web'
const SHARED_TEST_SETUP = './web/src/test/setup.ts'
// Ratcheted to the suite's actual (100%) coverage, mirroring the hard
// fail-under=100 gate in .github/workflows/python-unit-tests.yml. A lower
// floor here let a PR delete/skip a meaningful chunk of web/src/** tests, or
// add substantial untested code, without failing CI. See console-marketplace#963.
const COVERAGE_THRESHOLD = 100

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
      include: [`${MARKETPLACE_ROOT}/src/**/*.{ts,tsx}`],
      exclude: [
        `${MARKETPLACE_ROOT}/src/**/*.{test,spec}.{ts,tsx}`,
        `${MARKETPLACE_ROOT}/src/**/__tests__/**`,
        `${MARKETPLACE_ROOT}/src/**/*.d.ts`,
        // These two files have zero instrumentable runtime statements, so the
        // v8 coverage provider reports a misleading flat 0% (0/0) for both —
        // not an actual testing gap. See kubestellar/console-marketplace#993.
        // Scoped to exact paths (not a wildcard) so adding real runtime logic
        // to either file in the future isn't silently exempted from coverage.
        `${MARKETPLACE_ROOT}/src/components/cards/ui/Skeleton.tsx`, // bare re-export barrel, covered behaviorally by Skeleton.test.tsx
        `${MARKETPLACE_ROOT}/src/components/cards/shared/CardDisplayItem.ts`, // type-only interface, erased at compile time
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
