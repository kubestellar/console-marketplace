import { type UseCacheResult } from '../../../lib/cache'
import { useDemoOnlyCard } from '../../../lib/cards/useDemoOnlyCard'
import { NOTARY_DEMO_DATA, type NotaryDemoData } from './demoData'

export type NotaryStatus = NotaryDemoData

const CACHE_KEY = 'notary-status'

export const EMPTY_NOTARY_DATA: NotaryStatus = {
  clusters: [],
  lastCheckTime: new Date(0).toISOString(),
}

export type UseNotaryStatusResult = UseCacheResult<NotaryStatus>

export function useNotaryStatus(): UseNotaryStatusResult {
  return useDemoOnlyCard<NotaryStatus>({
    key: CACHE_KEY,
    demoData: NOTARY_DEMO_DATA,
    emptyData: EMPTY_NOTARY_DATA,
  })
}
