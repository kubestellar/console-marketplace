import { type UseCacheResult } from '../../../lib/cache'
import { useDemoOnlyCard } from '../../../lib/cards/useDemoOnlyCard'
import { BUILDPACKS_DEMO_DATA, type BuildpacksDemoData } from './demoData'

export type BuildpacksStatus = BuildpacksDemoData

const CACHE_KEY = 'buildpacks-status'

export const EMPTY_BUILDPACKS_DATA: BuildpacksStatus = {
  images: [],
  lastCheckTime: new Date(0).toISOString(),
}

export type UseBuildpacksStatusResult = UseCacheResult<BuildpacksStatus>

export function useBuildpacksStatus(): UseBuildpacksStatusResult {
  return useDemoOnlyCard<BuildpacksStatus>({
    key: CACHE_KEY,
    demoData: BUILDPACKS_DEMO_DATA,
    emptyData: EMPTY_BUILDPACKS_DATA,
  })
}
