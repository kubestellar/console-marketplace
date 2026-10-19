/**
 * Shared factories for the mock preambles duplicated across card
 * `*.test.tsx` suites (see issue #570). `vi.mock` factories are hoisted, so
 * each test file must still call `vi.mock(...)` itself, but the factory
 * bodies can delegate to these helpers instead of repeating the same
 * stub markup in every file.
 *
 * Example usage in a test file:
 *
 *   import { mockCardComponents, mockClusterBadgeModule, mockSkeletonModule } from '../../test/cardTestHelpers'
 *
 *   vi.mock('../ui/Skeleton', () => mockSkeletonModule('coredns-skeleton'))
 *   vi.mock('../../ui/ClusterBadge', () => mockClusterBadgeModule())
 *   vi.mock('../../../lib/cards/CardComponents', () => mockCardComponents('coredns'))
 */

/** Shape shared by the `useCardData` mock options across card test suites. */
export interface CardDataOptions<T> {
  filter?: {
    searchFields?: (keyof T)[]
  }
  sort?: {
    defaultField?: string
    defaultDirection?: 'asc' | 'desc'
    comparators?: Record<string, (a: T, b: T) => number>
  }
}

/** Module factory for `vi.mock('.../ui/Skeleton', ...)`. */
export function mockSkeletonModule(testId: string) {
  return {
    Skeleton: () => <div data-testid={testId} />,
  }
}

/**
 * Module factory for `vi.mock('.../ui/ClusterBadge', ...)`.
 * Pass a `testId` for suites that assert on the badge element directly.
 */
export function mockClusterBadgeModule(testId?: string) {
  return {
    ClusterBadge: ({ cluster }: { cluster: string }) => (
      <span data-testid={testId}>{cluster}</span>
    ),
  }
}

/**
 * Module factory for `vi.mock('.../lib/cards/CardComponents', ...)`.
 * Produces the `CardSearchInput` + `CardPaginationFooter` stubs shared by
 * every card suite, parameterized by the card's `data-testid` prefix.
 * Callers with extra exports (e.g. `CardControlsRow`, `CardAIActions`)
 * can spread this into a larger factory object.
 */
export function mockCardComponents(prefix: string, options: { clusterBadgeTestId?: string } = {}) {
  const { clusterBadgeTestId } = options
  return {
    CardSearchInput: ({ value, onChange, placeholder }: {
      value: string
      onChange: (value: string) => void
      placeholder: string
    }) => (
      <input
        data-testid={`${prefix}-search`}
        value={value}
        placeholder={placeholder}
        onChange={event => onChange(event.target.value)}
      />
    ),
    /**
     * Renders only the "N/total" cluster-count chip (the part of
     * `CardControlsHeader` every suite using this factory has historically
     * exercised). Suites asserting on `cardControls` (sort select/direction)
     * override this key locally with their own richer stub, same as they
     * used to override `CardControlsRow`.
     */
    CardControlsHeader: ({ selectedClusterCount, totalClusterCount }: {
      selectedClusterCount?: number
      totalClusterCount?: number
    }) => (
      <div>
        {selectedClusterCount !== undefined && selectedClusterCount > 0 && (
          <span>{selectedClusterCount}/{totalClusterCount}</span>
        )}
      </div>
    ),
    /**
     * Mirrors the real `CardScopeBadge`'s three branches (one cluster ->
     * a `ClusterBadge`-shaped span, several -> `t('common:common.nClusters')`,
     * none -> `t('common:common.allClusters')`). The single-cluster span
     * is rendered inline — matching `mockClusterBadgeModule`'s own markup —
     * rather than importing the real/mocked `ClusterBadge` component,
     * since importing it here hits a vi.mock hoisting cycle with the
     * calling suite's own `vi.mock('.../ui/ClusterBadge', ...)`. Pass
     * `clusterBadgeTestId` matching whatever `testId` the suite gave
     * `mockClusterBadgeModule(testId)` if it asserts on this badge.
     */
    CardScopeBadge: ({ selectedClusters, t }: {
      selectedClusters: string[]
      t: (key: string, options?: Record<string, unknown>) => string
    }) => (
      <div>
        {selectedClusters.length === 1 ? (
          <span data-testid={clusterBadgeTestId}>{selectedClusters[0]}</span>
        ) : selectedClusters.length > 1 ? (
          <span>{t('common:common.nClusters', { count: selectedClusters.length })}</span>
        ) : (
          <span>{t('common:common.allClusters')}</span>
        )}
      </div>
    ),
    CardPaginationFooter: ({
      currentPage,
      totalPages,
      onPageChange,
      needsPagination,
    }: {
      currentPage?: number
      totalPages?: number
      onPageChange?: (page: number) => void
      needsPagination?: boolean
    }) => (
      <div data-testid={`${prefix}-pagination`}>
        <span data-testid={`${prefix}-page-indicator`}>
          {currentPage}/{totalPages}
        </span>
        {needsPagination && onPageChange && (
          <button
            data-testid={`${prefix}-next-page`}
            onClick={() => onPageChange(currentPage === totalPages ? 1 : (currentPage ?? 1) + 1)}
            type="button"
          >
            next page
          </button>
        )}
      </div>
    ),
  }
}
