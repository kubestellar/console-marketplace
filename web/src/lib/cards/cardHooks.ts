interface CardDataFilter {
  searchFields?: string[]
  clusterField?: string
  storageKey?: string
}

interface CardDataSort {
  defaultField?: string
  defaultDirection?: 'asc' | 'desc'
  comparators?: Record<string, (a: unknown, b: unknown) => number>
}

interface CardDataOptions {
  filter?: CardDataFilter
  sort?: CardDataSort
  defaultLimit?: number | 'unlimited'
}

const DEFAULT_ITEMS_PER_PAGE = 5

function resolveItemsPerPage(defaultLimit?: number | 'unlimited') {
  if (defaultLimit === 'unlimited') {
    return 'unlimited' as const
  }

  if (typeof defaultLimit === 'number' && Number.isInteger(defaultLimit) && defaultLimit > 0) {
    return defaultLimit
  }

  return DEFAULT_ITEMS_PER_PAGE
}

/**
 * PLACEHOLDER — non-functional stub.
 *
 * `useCardData` currently returns the shape of a full search/sort/pagination
 * hook, but every setter is a no-op and `filters.search` is a hard-coded empty
 * string. The pagination shape reflects `defaultLimit` but there is no way to
 * change page, page size, sort field, sort direction, search text, or cluster
 * filter state at runtime.
 *
 * Card components that render `<CardSearchInput value={filters.search}
 * onChange={filters.setSearch} />` therefore ship a controlled input pinned to
 * `''` — typing does nothing. `<CardPaginationFooter />` renders an empty
 * `<div>` for the same reason.
 *
 * Do not build new cards against these no-op fields expecting them to work.
 * The real implementation is tracked in
 * https://github.com/kubestellar/console-marketplace/issues/778 — until it
 * lands, cards that need working search/pagination should manage that state
 * locally with `useState` instead of destructuring these fields.
 *
 * The unit tests in `cardHooks.test.ts` codify the stub behaviour (asserting
 * `filters.search === ''` and that `setSearch()` does not throw) and must be
 * replaced when the real hook lands.
 */
export function useCardData<T, _SortKey = string>(items: T[], opts?: CardDataOptions) {
  const itemsPerPage = resolveItemsPerPage(opts?.defaultLimit)
  const pageItems = itemsPerPage === 'unlimited' ? items : items.slice(0, itemsPerPage as number)

  return {
    items: pageItems,
    totalItems: items.length,
    currentPage: 1,
    totalPages: itemsPerPage === 'unlimited' ? 1 : Math.ceil(items.length / (itemsPerPage as number)),
    itemsPerPage,
    // STUB: no-op — see JSDoc above and issue #778.
    setItemsPerPage: () => {},
    // STUB: no-op — see JSDoc above and issue #778.
    goToPage: () => {},
    needsPagination: itemsPerPage !== 'unlimited' && items.length > (itemsPerPage as number),
    filters: {
      // STUB: always '' — cards rendering CardSearchInput against this get a
      // controlled input that ignores keystrokes. See issue #778.
      search: '',
      // STUB: no-op — see issue #778.
      setSearch: () => {},
      localClusterFilter: [] as string[],
      // STUB: no-op — see issue #778.
      toggleClusterFilter: () => {},
      // STUB: no-op — see issue #778.
      clearClusterFilter: () => {},
      availableClusters: [] as string[],
      showClusterFilter: false,
      // STUB: no-op — see issue #778.
      setShowClusterFilter: () => {},
      clusterFilterRef: { current: null } as { current: null },
    },
    sorting: {
      sortBy: opts?.sort?.defaultField ?? 'status',
      // STUB: no-op — see issue #778.
      setSortBy: () => {},
      sortDirection: opts?.sort?.defaultDirection ?? 'asc',
      // STUB: no-op — see issue #778.
      setSortDirection: () => {},
    },
    containerRef: { current: null } as { current: null },
    containerStyle: {},
  }
}
