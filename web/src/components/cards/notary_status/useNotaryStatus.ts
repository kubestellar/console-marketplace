import { useCache } from '../../../lib/cache'
import { NOTARY_DEMO_DATA, type NotaryDemoData } from './demoData'

export type NotaryStatus = NotaryDemoData

const CACHE_KEY = 'notary-status'

export const EMPTY_NOTARY_DATA: NotaryStatus = {
  clusters: [],
  lastCheckTime: new Date(0).toISOString(),
}

// No stable backend endpoint exists for this card yet. Returning the empty
// shape lets useCache select the demo payload without presenting it as live.
async function fetchNotaryStatus(): Promise<NotaryStatus> {
  return EMPTY_NOTARY_DATA
}

export interface UseNotaryStatusResult {
  data: NotaryStatus
  isLoading: boolean
  isRefreshing: boolean
  isFailed: boolean
  isDemoFallback: boolean
  consecutiveFailures: number
  lastRefresh: number | null
  refetch: () => Promise<void>
}

export function useNotaryStatus(): UseNotaryStatusResult {
  return useCache<NotaryStatus>({
    key: CACHE_KEY,
    fetcher: fetchNotaryStatus,
    demoData: NOTARY_DEMO_DATA,
    initialData: EMPTY_NOTARY_DATA,
    category: 'default',
    persist: true,
    demoWhenEmpty: true,
  })
}
