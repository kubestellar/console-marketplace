import { useCache } from '../../../lib/cache'
import { BUILDPACKS_DEMO_DATA, type BuildpacksDemoData } from './demoData'

export type BuildpacksStatus = BuildpacksDemoData

const CACHE_KEY = 'buildpacks-status'

export const EMPTY_BUILDPACKS_DATA: BuildpacksStatus = {
  images: [],
  lastCheckTime: new Date(0).toISOString(),
}

// No stable backend endpoint exists for this card yet. Returning the empty
// shape lets useCache select the demo payload without presenting it as live.
async function fetchBuildpacksStatus(): Promise<BuildpacksStatus> {
  return EMPTY_BUILDPACKS_DATA
}

export interface UseBuildpacksStatusResult {
  data: BuildpacksStatus
  isLoading: boolean
  isRefreshing: boolean
  isFailed: boolean
  isDemoFallback: boolean
  consecutiveFailures: number
  lastRefresh: number | null
  refetch: () => Promise<void>
}

export function useBuildpacksStatus(): UseBuildpacksStatusResult {
  return useCache<BuildpacksStatus>({
    key: CACHE_KEY,
    fetcher: fetchBuildpacksStatus,
    demoData: BUILDPACKS_DEMO_DATA,
    initialData: EMPTY_BUILDPACKS_DATA,
    category: 'default',
    persist: true,
    demoWhenEmpty: true,
  })
}
