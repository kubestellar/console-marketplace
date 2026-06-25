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

export function useCardData<T, _SortKey = string>(items: T[], opts?: CardDataOptions) {
  const defaultLimit = opts?.defaultLimit
  const itemsPerPage = defaultLimit === 'unlimited'
    ? ('unlimited' as const)
    : typeof defaultLimit === 'number' ? defaultLimit : 5
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
