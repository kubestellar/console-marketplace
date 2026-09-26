import { useMemo, useRef, useState } from 'react'

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

export interface CardDataOptions {
  filter?: CardDataFilter
  sort?: CardDataSort
  defaultLimit?: number | 'unlimited'
}

const DEFAULT_ITEMS_PER_PAGE = 5
const DEFAULT_CLUSTER_FIELD = 'cluster'

function resolveItemsPerPage(defaultLimit?: number | 'unlimited') {
  if (defaultLimit === 'unlimited') {
    return 'unlimited' as const
  }

  if (typeof defaultLimit === 'number' && Number.isInteger(defaultLimit) && defaultLimit > 0) {
    return defaultLimit
  }

  return DEFAULT_ITEMS_PER_PAGE
}

function getField(item: unknown, field: string): unknown {
  if (item !== null && typeof item === 'object' && field in (item as Record<string, unknown>)) {
    return (item as Record<string, unknown>)[field]
  }
  return undefined
}

function matchesSearch(item: unknown, query: string, searchFields?: string[]): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) {
    return true
  }

  const fields =
    searchFields && searchFields.length > 0
      ? searchFields
      : item !== null && typeof item === 'object'
        ? Object.keys(item as Record<string, unknown>)
        : []

  return fields.some(field => {
    const value = getField(item, field)
    return value != null && String(value).toLowerCase().includes(needle)
  })
}

function defaultComparator(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b
  }
  return String(a ?? '').localeCompare(String(b ?? ''))
}

/**
 * Shared search / sort / pagination / cluster-filter primitive used by card
 * components. `items` is expected to already be filtered by the global
 * cluster selector (see `useClusterFilteredRows`) — this hook applies the
 * card-local search text, card-local cluster filter, sort, and pagination on
 * top of that.
 *
 * Cluster filtering reads `opts.filter.clusterField` (defaults to
 * `'cluster'`) off each item. Search reads `opts.filter.searchFields`
 * (defaults to every own-enumerable key of the item) and matches
 * case-insensitively. Sorting uses `opts.sort.comparators[sortBy]` when
 * provided, otherwise falls back to a locale/number comparator on the
 * `sortBy` field.
 */
export function useCardData<T, SortKey extends string = string>(
  items: T[],
  opts?: CardDataOptions,
) {
  const filterOpts = opts?.filter
  const sortOpts = opts?.sort
  const clusterField = filterOpts?.clusterField ?? DEFAULT_CLUSTER_FIELD

  const [search, setSearchState] = useState('')
  const [localClusterFilter, setLocalClusterFilter] = useState<string[]>([])
  const [showClusterFilter, setShowClusterFilter] = useState(false)
  const [sortBy, setSortByState] = useState<SortKey>(
    (sortOpts?.defaultField as SortKey | undefined) ?? ('status' as SortKey),
  )
  const [sortDirection, setSortDirectionState] = useState<'asc' | 'desc'>(
    sortOpts?.defaultDirection ?? 'asc',
  )
  const [itemsPerPage, setItemsPerPageState] = useState<number | 'unlimited'>(
    resolveItemsPerPage(opts?.defaultLimit),
  )
  const [currentPage, setCurrentPage] = useState(1)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const clusterFilterRef = useRef<HTMLDivElement | null>(null)

  const availableClusters = useMemo(() => {
    const seen = new Set<string>()
    for (const item of items) {
      const value = getField(item, clusterField)
      if (typeof value === 'string' && value) {
        seen.add(value)
      }
    }
    return Array.from(seen).sort()
  }, [items, clusterField])

  const clusterFiltered = useMemo(() => {
    if (localClusterFilter.length === 0) {
      return items
    }
    return items.filter(item => {
      const value = getField(item, clusterField)
      return typeof value === 'string' && localClusterFilter.includes(value)
    })
  }, [items, localClusterFilter, clusterField])

  const searched = useMemo(
    () => clusterFiltered.filter(item => matchesSearch(item, search, filterOpts?.searchFields)),
    [clusterFiltered, search, filterOpts?.searchFields],
  )

  const sorted = useMemo(() => {
    const comparator = sortOpts?.comparators?.[sortBy]
    return [...searched].sort((a, b) => {
      const fieldA = getField(a, sortBy)
      const fieldB = getField(b, sortBy)
      const result = comparator ? comparator(fieldA, fieldB) : defaultComparator(fieldA, fieldB)
      return sortDirection === 'desc' ? -result : result
    })
  }, [searched, sortBy, sortDirection, sortOpts?.comparators])

  const totalItems = sorted.length
  const totalPages =
    itemsPerPage === 'unlimited'
      ? totalItems > 0
        ? 1
        : 0
      : Math.ceil(totalItems / itemsPerPage)
  // Clamp without an effect: if search/filter/sort shrank the result set out
  // from under a stale `currentPage`, render the closest valid page instead
  // of an out-of-range slice.
  const safeCurrentPage = totalPages === 0 ? 1 : Math.min(Math.max(currentPage, 1), totalPages)

  const pageItems = useMemo(() => {
    if (itemsPerPage === 'unlimited') {
      return sorted
    }
    const start = (safeCurrentPage - 1) * itemsPerPage
    return sorted.slice(start, start + itemsPerPage)
  }, [sorted, safeCurrentPage, itemsPerPage])

  const needsPagination = itemsPerPage !== 'unlimited' && totalItems > itemsPerPage

  function goToPage(page: number) {
    setCurrentPage(Math.min(Math.max(page, 1), Math.max(totalPages, 1)))
  }

  function setItemsPerPage(next: number | 'unlimited') {
    setItemsPerPageState(next)
    setCurrentPage(1)
  }

  function setSearch(value: string) {
    setSearchState(value)
    setCurrentPage(1)
  }

  function toggleClusterFilter(cluster: string) {
    setLocalClusterFilter(prev =>
      prev.includes(cluster) ? prev.filter(c => c !== cluster) : [...prev, cluster],
    )
    setCurrentPage(1)
  }

  function clearClusterFilter() {
    setLocalClusterFilter([])
    setCurrentPage(1)
  }

  function setSortBy(field: SortKey) {
    setSortByState(field)
  }

  function setSortDirection(direction: 'asc' | 'desc') {
    setSortDirectionState(direction)
  }

  return {
    items: pageItems,
    totalItems,
    currentPage: safeCurrentPage,
    totalPages,
    itemsPerPage,
    setItemsPerPage,
    goToPage,
    needsPagination,
    filters: {
      search,
      setSearch,
      localClusterFilter,
      toggleClusterFilter,
      clearClusterFilter,
      availableClusters,
      showClusterFilter,
      setShowClusterFilter,
      clusterFilterRef,
    },
    sorting: {
      sortBy,
      setSortBy,
      sortDirection,
      setSortDirection,
    },
    containerRef,
    containerStyle: {},
  }
}
