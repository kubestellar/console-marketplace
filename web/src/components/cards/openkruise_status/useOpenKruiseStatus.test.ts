import { describe, expect, it, vi } from 'vitest'
import { useOpenKruiseStatus } from './useOpenKruiseStatus'
import { OPENKRUISE_DEMO_DATA } from './demoData'

const mockUseCache = vi.fn()

vi.mock('../../../lib/cache', () => ({
  useCache: (options: unknown) => mockUseCache(options),
}))

describe('useOpenKruiseStatus', () => {
  it('configures cache with OpenKruise defaults for initial state', () => {
    mockUseCache.mockReturnValue({
      data: {
        cloneSets: [],
        advancedStatefulSets: [],
        advancedDaemonSets: [],
        sidecarSets: [],
        broadcastJobs: [],
        advancedCronJobs: [],
        controllerVersion: '',
        totalInjectedPods: 0,
        lastCheckTime: '',
      },
      isLoading: true,
      isRefreshing: false,
      isFailed: false,
      isDemoFallback: false,
      consecutiveFailures: 0,
      lastRefresh: null,
      refetch: vi.fn(),
    })

    useOpenKruiseStatus()

    expect(mockUseCache).toHaveBeenCalledWith(expect.objectContaining({
      key: 'openkruise-status',
      category: 'default',
      persist: true,
      demoWhenEmpty: true,
      demoData: OPENKRUISE_DEMO_DATA,
    }))
  })

  const stateCases = [
    {
      name: 'loading',
      cacheResult: {
        data: {
          ...OPENKRUISE_DEMO_DATA,
          cloneSets: [],
          advancedStatefulSets: [],
          advancedDaemonSets: [],
          sidecarSets: [],
          broadcastJobs: [],
          advancedCronJobs: [],
        },
        isLoading: true,
        isRefreshing: false,
        isFailed: false,
        isDemoFallback: false,
        consecutiveFailures: 0,
        lastRefresh: null,
        refetch: vi.fn(),
      },
    },
    {
      name: 'success',
      cacheResult: {
        data: OPENKRUISE_DEMO_DATA,
        isLoading: false,
        isRefreshing: false,
        isFailed: false,
        isDemoFallback: false,
        consecutiveFailures: 0,
        lastRefresh: 1_725_000_000_000,
        refetch: vi.fn(),
      },
    },
    {
      name: 'error fallback',
      cacheResult: {
        data: OPENKRUISE_DEMO_DATA,
        isLoading: false,
        isRefreshing: false,
        isFailed: true,
        isDemoFallback: true,
        consecutiveFailures: 2,
        lastRefresh: null,
        refetch: vi.fn(),
      },
    },
  ] as const

  for (const tc of stateCases) {
    it(`returns cache state for ${tc.name} behavior`, () => {
      mockUseCache.mockReturnValue(tc.cacheResult)

      const result = useOpenKruiseStatus()

      expect(result).toEqual(tc.cacheResult)
    })
  }
})
