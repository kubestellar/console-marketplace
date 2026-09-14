import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { COREDNS_DEMO_DATA } from './demoData'
import { EMPTY_COREDNS_DATA, useCoreDNSStatus, type CoreDNSStatus } from './useCoreDNSStatus'

interface CacheOptions<T> {
  key: string
  fetcher: () => Promise<T>
  demoData: T
  initialData: T
  category: string
  persist: boolean
  demoWhenEmpty: boolean
}

const mockUseCache = vi.fn()

vi.mock('../../../lib/cache', () => ({
  useCache: (options: unknown) => mockUseCache(options),
}))

function lastCacheOptions(): CacheOptions<CoreDNSStatus> {
  return mockUseCache.mock.calls.at(-1)?.[0] as CacheOptions<CoreDNSStatus>
}

describe('useCoreDNSStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCache.mockReturnValue({
      data: COREDNS_DEMO_DATA,
      isLoading: false,
      isRefreshing: false,
      isFailed: false,
      isDemoFallback: true,
      consecutiveFailures: 0,
      lastRefresh: 1_725_000_000_000,
      refetch: vi.fn(),
    })
  })

  it('configures the cache with an empty live result and demo fallback', () => {
    renderHook(() => useCoreDNSStatus())

    expect(lastCacheOptions()).toMatchObject({
      key: 'coredns-status',
      demoData: COREDNS_DEMO_DATA,
      initialData: EMPTY_COREDNS_DATA,
      category: 'default',
      persist: true,
      demoWhenEmpty: true,
    })
  })

  it('returns the empty live shape so demo data is never presented as live', async () => {
    renderHook(() => useCoreDNSStatus())

    await expect(lastCacheOptions().fetcher()).resolves.toEqual(EMPTY_COREDNS_DATA)
  })

  it('passes through cache status and refresh controls', () => {
    const cacheResult = {
      data: EMPTY_COREDNS_DATA,
      isLoading: true,
      isRefreshing: false,
      isFailed: true,
      isDemoFallback: false,
      consecutiveFailures: 2,
      lastRefresh: null,
      refetch: vi.fn(),
    }
    mockUseCache.mockReturnValueOnce(cacheResult)

    const { result } = renderHook(() => useCoreDNSStatus())

    expect(result.current).toBe(cacheResult)
  })
})
