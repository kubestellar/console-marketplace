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

export function useCardData<T, _SortKey = string>(items: T[], opts?: CardDataOptions) {
  const itemsPerPage = resolveItemsPerPage(opts?.defaultLimit)
  const pageItems = itemsPerPage === 'unlimited' ? items : items.slice(0, itemsPerPage as number)

  return {
    items: pageItems,
    totalItems: items.length,
    currentPage: 1,
    totalPages: itemsPerPage === 'unlimited' ? 1 : Math.ceil(items.length / (itemsPerPage as number)),
    itemsPerPage,
    setItemsPerPage: () => {},
    goToPage: () => {},
    needsPagination: itemsPerPage !== 'unlimited' && items.length > (itemsPerPage as number),
    filters: {
      search: '',
      setSearch: () => {},
      localClusterFilter: [] as string[],
      toggleClusterFilter: () => {},
      clearClusterFilter: () => {},
      availableClusters: [] as string[],
      showClusterFilter: false,
      setShowClusterFilter: () => {},
      clusterFilterRef: { current: null } as { current: null },
    },
    sorting: {
      sortBy: opts?.sort?.defaultField ?? 'status',
      setSortBy: () => {},
      sortDirection: opts?.sort?.defaultDirection ?? 'asc',
      setSortDirection: () => {},
    },
    containerRef: { current: null } as { current: null },
    containerStyle: {},
  }
}
