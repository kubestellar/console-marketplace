import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { OPENKRUISE_DEMO_DATA } from './demoData'
import { useOpenKruiseStatus, type OpenKruiseStatus } from './useOpenKruiseStatus'

interface CacheOptions<T> {
  key: string
  fetcher: () => Promise<T>
  demoData: T
  initialData: T
  category: string
  persist: boolean
  demoWhenEmpty: boolean
}

const EMPTY_STATUS: OpenKruiseStatus = {
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

const defaultCacheResult = {
  data: OPENKRUISE_DEMO_DATA,
  isLoading: false,
  isRefreshing: false,
  isFailed: false,
  isDemoFallback: true,
  consecutiveFailures: 0,
  lastRefresh: 1_725_000_000_000,
  refetch: vi.fn(),
}

const mockUseCache = vi.fn()

vi.mock('../../../lib/cache', () => ({
  useCache: (options: unknown) => mockUseCache(options),
}))

function lastCacheOptions(): CacheOptions<OpenKruiseStatus> {
  return mockUseCache.mock.calls.at(-1)?.[0] as CacheOptions<OpenKruiseStatus>
}

describe('useOpenKruiseStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCache.mockReturnValue(defaultCacheResult)
  })

  it('returns the cache result and configures OpenKruise defaults', () => {
    const { result } = renderHook(() => useOpenKruiseStatus())

    expect(result.current).toEqual(defaultCacheResult)
    expect(lastCacheOptions()).toMatchObject({
      key: 'openkruise-status',
      demoData: OPENKRUISE_DEMO_DATA,
      initialData: EMPTY_STATUS,
      category: 'default',
      persist: true,
      demoWhenEmpty: true,
    })
  })

  it('uses the demo payload as the fetch result', async () => {
    renderHook(() => useOpenKruiseStatus())

    await expect(lastCacheOptions().fetcher()).resolves.toEqual(OPENKRUISE_DEMO_DATA)
  })

  it('passes through loading and failed cache states unchanged', () => {
    const stateCases = [
      {
        data: EMPTY_STATUS,
        isLoading: true,
        isRefreshing: false,
        isFailed: false,
        isDemoFallback: false,
        consecutiveFailures: 0,
        lastRefresh: null,
        refetch: vi.fn(),
      },
      {
        data: OPENKRUISE_DEMO_DATA,
        isLoading: false,
        isRefreshing: true,
        isFailed: true,
        isDemoFallback: true,
        consecutiveFailures: 2,
        lastRefresh: null,
        refetch: vi.fn(),
      },
    ]

    for (const cacheResult of stateCases) {
      mockUseCache.mockReturnValueOnce(cacheResult)
      const { result, unmount } = renderHook(() => useOpenKruiseStatus())

      expect(result.current).toEqual(cacheResult)
      unmount()
    }
  })
})
