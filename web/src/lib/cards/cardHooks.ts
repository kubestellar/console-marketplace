export function useCardData<T>(items: T[]) {
  return {
    items,
    totalItems: items.length,
    currentPage: 1,
    totalPages: 1,
    itemsPerPage: 5,
    setItemsPerPage: () => {},
    goToPage: () => {},
    needsPagination: false,
    filters: {
      search: '',
      setSearch: () => {},
      localClusterFilter: [],
      toggleClusterFilter: () => {},
      clearClusterFilter: () => {},
      availableClusters: [],
      showClusterFilter: false,
      setShowClusterFilter: () => {},
      clusterFilterRef: { current: null },
    },
    sorting: {
      sortBy: 'status',
      setSortBy: () => {},
      sortDirection: 'asc',
      setSortDirection: () => {},
    },
    containerRef: { current: null },
    containerStyle: {},
  }
}
