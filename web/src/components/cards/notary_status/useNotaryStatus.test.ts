import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NOTARY_DEMO_DATA } from './demoData'
import { EMPTY_NOTARY_DATA, useNotaryStatus, type NotaryStatus } from './useNotaryStatus'
import { createCacheMocks } from '../../../test/cacheMock'

const { mockUseCache, lastCacheOptions } = createCacheMocks<NotaryStatus>()

vi.mock('../../../lib/cache', () => ({
  useCache: (options: unknown) => mockUseCache(options),
}))

describe('useNotaryStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCache.mockReturnValue({
      data: NOTARY_DEMO_DATA,
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
    renderHook(() => useNotaryStatus())

    expect(lastCacheOptions()).toMatchObject({
      key: 'notary-status',
      demoData: NOTARY_DEMO_DATA,
      initialData: EMPTY_NOTARY_DATA,
      category: 'default',
      persist: true,
      demoWhenEmpty: true,
    })
  })

  it('returns the empty live shape so demo data is never presented as live', async () => {
    renderHook(() => useNotaryStatus())

    await expect(lastCacheOptions().fetcher()).resolves.toEqual(EMPTY_NOTARY_DATA)
  })

  it('passes through cache status and refresh controls', () => {
    const cacheResult = {
      data: EMPTY_NOTARY_DATA,
      isLoading: true,
      isRefreshing: false,
      isFailed: true,
      isDemoFallback: false,
      consecutiveFailures: 2,
      lastRefresh: null,
      refetch: vi.fn(),
    }
    mockUseCache.mockReturnValueOnce(cacheResult)

    const { result } = renderHook(() => useNotaryStatus())

    expect(result.current).toBe(cacheResult)
  })
})
