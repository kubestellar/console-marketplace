import { useCache, type UseCacheResult } from '../cache'

/**
 * Options for {@link useDemoOnlyCard}.
 *
 * @template T The card's status data shape.
 */
export interface UseDemoOnlyCardOptions<T> {
  /** Cache key, e.g. `'notary-status'`. */
  key: string
  /** Data shown in demo mode / when the card has never loaded live data. */
  demoData: T
  /** Empty-shape value returned by the stub fetcher and used as `initialData`. */
  emptyData: T
}

/**
 * Standard status hook for cards that do not yet have a backend endpoint.
 *
 * The five status cards `buildpacks-status`, `coredns_status`, `kubeflow_status`,
 * `notary_status`, and `openkruise_status` each redeclared the same
 * `useCache(...)` boilerplate: a stub `fetchXStatus()` returning the empty
 * shape, and an eight-line `useCache` options object with identical
 * `category: 'default'`, `persist: true`, `demoWhenEmpty: true` values.
 *
 * This factory collapses that boilerplate to a single call site so that when
 * the shared card fetch/refresh contract changes (or a real backend endpoint
 * lands), the change happens in one place instead of five.
 */
export function useDemoOnlyCard<T>(
  options: UseDemoOnlyCardOptions<T>,
): UseCacheResult<T> {
  const { key, demoData, emptyData } = options
  return useCache<T>({
    key,
    fetcher: async () => emptyData,
    demoData,
    initialData: emptyData,
    category: 'default',
    persist: true,
    demoWhenEmpty: true,
  })
}
