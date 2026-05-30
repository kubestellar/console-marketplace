import { useCache } from '../../../lib/cache'
import { OPENKRUISE_DEMO_DATA, type OpenKruiseDemoData } from './demoData'

export type OpenKruiseStatus = OpenKruiseDemoData

const CACHE_KEY = 'openkruise-status'

const INITIAL_DATA: OpenKruiseStatus = {
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

async function fetchOpenKruiseStatus(): Promise<OpenKruiseStatus> {
  return OPENKRUISE_DEMO_DATA
}

export function useOpenKruiseStatus() {
  return useCache<OpenKruiseStatus>({
    key: CACHE_KEY,
    fetcher: fetchOpenKruiseStatus,
    demoData: OPENKRUISE_DEMO_DATA,
    initialData: INITIAL_DATA,
    category: 'default',
    persist: true,
    demoWhenEmpty: true,
  })
}
