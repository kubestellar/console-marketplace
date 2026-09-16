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
 *   vi.mock('../ui/ClusterBadge', () => mockClusterBadgeModule())
 *   vi.mock('../../lib/cards/CardComponents', () => mockCardComponents('coredns'))
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
export function mockCardComponents(prefix: string) {
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
