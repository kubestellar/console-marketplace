import { type UseCacheResult } from '../../../lib/cache'
import { useDemoOnlyCard } from '../../../lib/cards/useDemoOnlyCard'
import { OPENKRUISE_DEMO_DATA, type OpenKruiseDemoData } from './demoData'

export type OpenKruiseStatus = OpenKruiseDemoData

const CACHE_KEY = 'openkruise-status'

export const EMPTY_OPENKRUISE_DATA: OpenKruiseStatus = {
  cloneSets: [],
  advancedStatefulSets: [],
  advancedDaemonSets: [],
  sidecarSets: [],
  broadcastJobs: [],
  advancedCronJobs: [],
  controllerVersion: '',
  totalInjectedPods: 0,
  lastCheckTime: '',
}

export type UseOpenKruiseStatusResult = UseCacheResult<OpenKruiseStatus>

export function useOpenKruiseStatus(): UseOpenKruiseStatusResult {
  return useDemoOnlyCard<OpenKruiseStatus>({
    key: CACHE_KEY,
    demoData: OPENKRUISE_DEMO_DATA,
    emptyData: EMPTY_OPENKRUISE_DATA,
  })
}
