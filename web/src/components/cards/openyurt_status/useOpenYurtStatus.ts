import { useCache } from '../../../lib/cache'
import { OPENYURT_DEMO_DATA } from './demoData'
import { fetchOpenYurtStatus, INITIAL_DATA, type OpenYurtStatus } from './fetch'
import type { OpenYurtFetchError } from './fetch'

export type { OpenYurtStatus, OpenYurtFetchError }

const CACHE_KEY = 'openyurt-status'

export interface UseOpenYurtStatusResult {
  data: OpenYurtStatus
  isLoading: boolean
  isRefreshing: boolean
  isFailed: boolean
  isDemoFallback: boolean
  consecutiveFailures: number
  lastRefresh: number | null
  refetch: () => Promise<void>
}

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
