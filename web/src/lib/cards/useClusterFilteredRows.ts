import { useMemo } from 'react'

/** Minimal shape required to filter a row/item by cluster. */
interface ClusterScoped {
  cluster: string
}

/**
 * Filters `rows` down to the globally-selected clusters (from
 * `useGlobalFilters`). When no clusters are selected, returns `rows`
 * unchanged. Memoized on `rows` and `selectedClusters` identity, matching
 * the `globalFiltered` memo previously duplicated across the status cards.
 */
export function useClusterFilteredRows<T extends ClusterScoped>(
  rows: T[],
  selectedClusters: string[] | null | undefined,
): T[] {
  return useMemo(() => {
    if (!selectedClusters || selectedClusters.length === 0) return rows
    return rows.filter(row => selectedClusters.includes(row.cluster))
  }, [rows, selectedClusters])
}
