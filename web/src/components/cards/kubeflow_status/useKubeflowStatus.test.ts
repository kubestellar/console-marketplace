import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { KUBEFLOW_DEMO_DATA } from './demoData'
import { useKubeflowStatus, type KubeflowStatus } from './useKubeflowStatus'
import { createCacheMocks } from '../../../test/cacheMock'

const EMPTY_STATUS: KubeflowStatus = {
  pipelineRuns: [],
  experiments: [],
  notebooks: [],
  trainingJobs: [],
  totalPipelines: 0,
  totalActiveRuns: 0,
  totalExperiments: 0,
  overallSuccessRate: 0,
  lastCheckTime: '',
}

const defaultCacheResult = {
  data: KUBEFLOW_DEMO_DATA,
  isLoading: false,
  isRefreshing: false,
  isFailed: false,
  isDemoFallback: true,
  consecutiveFailures: 0,
  lastRefresh: 1_725_000_000_000,
  refetch: vi.fn(),
}

const { mockUseCache, lastCacheOptions } = createCacheMocks<KubeflowStatus>()

vi.mock('../../../lib/cache', () => ({
  useCache: (options: unknown) => mockUseCache(options),
}))

describe('useKubeflowStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCache.mockReturnValue(defaultCacheResult)
  })

  it('returns the cache result and configures Kubeflow defaults', () => {
    const { result } = renderHook(() => useKubeflowStatus())

    expect(result.current).toEqual(defaultCacheResult)
    expect(lastCacheOptions()).toMatchObject({
      key: 'kubeflow-status',
      demoData: KUBEFLOW_DEMO_DATA,
      initialData: EMPTY_STATUS,
      category: 'default',
      persist: true,
      demoWhenEmpty: true,
    })
  })

  it('returns the empty payload from the stub fetcher (never demo — see kubestellar/console-marketplace#802 Slice B)', async () => {
    renderHook(() => useKubeflowStatus())

    await expect(lastCacheOptions().fetcher()).resolves.toEqual(EMPTY_STATUS)
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
        data: KUBEFLOW_DEMO_DATA,
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
      const { result, unmount } = renderHook(() => useKubeflowStatus())

      expect(result.current).toEqual(cacheResult)
      unmount()
    }
  })
})
