import { useCache, type UseCacheResult } from '../../../lib/cache'
import { COREDNS_DEMO_DATA, type CoreDNSDemoData } from './demoData'

export type CoreDNSStatus = CoreDNSDemoData

const CACHE_KEY = 'coredns-status'

export const EMPTY_COREDNS_DATA: CoreDNSStatus = {
  servers: [],
  zones: [],
  totalQueries: 0,
  overallCacheHitRate: 0,
  lastCheckTime: new Date(0).toISOString(),
}

// No stable backend endpoint exists for this card yet. Returning the empty
// shape lets useCache select the demo payload without presenting it as live.
async function fetchCoreDNSStatus(): Promise<CoreDNSStatus> {
  return EMPTY_COREDNS_DATA
}

export type UseCoreDNSStatusResult = UseCacheResult<CoreDNSStatus>

export function useCoreDNSStatus(): UseCoreDNSStatusResult {
  return useCache<CoreDNSStatus>({
    key: CACHE_KEY,
    fetcher: fetchCoreDNSStatus,
    demoData: COREDNS_DEMO_DATA,
    initialData: EMPTY_COREDNS_DATA,
    category: 'default',
    persist: true,
    demoWhenEmpty: true,
  })
}
