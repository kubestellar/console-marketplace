import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { clearCacheValue, setCacheValue } from '../cache'
import { useDemoOnlyCard } from './useDemoOnlyCard'

interface FakeStatus {
  items: string[]
  lastCheckTime: string
}

const EMPTY: FakeStatus = { items: [], lastCheckTime: new Date(0).toISOString() }
const DEMO: FakeStatus = { items: ['a', 'b'], lastCheckTime: '2026-01-01T00:00:00Z' }

describe('useDemoOnlyCard', () => {
  it('returns the empty shape when the cache has no entry', () => {
    clearCacheValue('demo-only-card-test/empty')
    const { result } = renderHook(() =>
      useDemoOnlyCard<FakeStatus>({
        key: 'demo-only-card-test/empty',
        demoData: DEMO,
        emptyData: EMPTY,
      }),
    )
    expect(result.current.data).toEqual(EMPTY)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isFailed).toBe(false)
  })

  it('returns the cached value when one exists', () => {
    const cached: FakeStatus = { items: ['cached'], lastCheckTime: '2026-05-01T00:00:00Z' }
    setCacheValue('demo-only-card-test/cached', cached)
    const { result } = renderHook(() =>
      useDemoOnlyCard<FakeStatus>({
        key: 'demo-only-card-test/cached',
        demoData: DEMO,
        emptyData: EMPTY,
      }),
    )
    expect(result.current.data).toEqual(cached)
  })

  it('exposes the full UseCacheResult shape', () => {
    clearCacheValue('demo-only-card-test/shape')
    const { result } = renderHook(() =>
      useDemoOnlyCard<FakeStatus>({
        key: 'demo-only-card-test/shape',
        demoData: DEMO,
        emptyData: EMPTY,
      }),
    )
    expect(result.current).toEqual(
      expect.objectContaining({
        data: expect.anything(),
        isLoading: expect.any(Boolean),
        isRefreshing: expect.any(Boolean),
        isFailed: expect.any(Boolean),
        isDemoFallback: expect.any(Boolean),
        consecutiveFailures: expect.any(Number),
        lastRefresh: null,
        refetch: expect.any(Function),
      }),
    )
  })
})
