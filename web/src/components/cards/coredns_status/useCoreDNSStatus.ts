import { type UseCacheResult } from '../../../lib/cache'
import { useDemoOnlyCard } from '../../../lib/cards/useDemoOnlyCard'
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

export type UseCoreDNSStatusResult = UseCacheResult<CoreDNSStatus>

export function useCoreDNSStatus(): UseCoreDNSStatusResult {
  return useDemoOnlyCard<CoreDNSStatus>({
    key: CACHE_KEY,
    demoData: COREDNS_DEMO_DATA,
    emptyData: EMPTY_COREDNS_DATA,
  })
}
