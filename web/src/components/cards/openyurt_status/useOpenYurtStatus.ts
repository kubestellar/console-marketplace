import { useCache, type UseCacheResult } from '../../../lib/cache'
import { OPENYURT_DEMO_DATA } from './demoData'
import { fetchOpenYurtStatus, INITIAL_DATA, type OpenYurtStatus } from './fetch'
import type { OpenYurtFetchError } from './fetch'

export type { OpenYurtStatus, OpenYurtFetchError }

const CACHE_KEY = 'openyurt-status'

// Live fetching is opt-in; when off the card keeps its initialData/demo behaviour.
const LIVE_FETCH_ENABLED = import.meta.env.VITE_OPENYURT_LIVE_FETCH === 'true'

export type UseOpenYurtStatusResult = UseCacheResult<OpenYurtStatus>

export function useOpenYurtStatus(cluster?: string): UseOpenYurtStatusResult {
  const {
    data,
    isLoading,
    isRefreshing,
    isFailed,
    isDemoFallback,
    consecutiveFailures,
    lastRefresh,
    refetch,
  } = useCache<OpenYurtStatus>({
    key: cluster ? `${CACHE_KEY}:${cluster}` : CACHE_KEY,
    fetcher: () => fetchOpenYurtStatus(cluster),
    demoData: OPENYURT_DEMO_DATA,
    initialData: INITIAL_DATA,
    category: 'default',
    persist: true,
    live: LIVE_FETCH_ENABLED,
    demoWhenEmpty: true,
  })

  return {
    data,
    isLoading,
    isRefreshing,
    isFailed,
    isDemoFallback,
    consecutiveFailures,
    lastRefresh,
    refetch,
  }
}
