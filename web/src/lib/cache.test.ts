import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearCacheValue,
  getCacheValue,
  setCacheValue,
  useCache,
} from './cache'

describe('lib/cache module store', () => {
  beforeEach(() => {
    clearCacheValue()
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    clearCacheValue()
  })

  describe('setCacheValue / getCacheValue', () => {
    it('returns undefined for a missing key', () => {
      expect(getCacheValue<string>('missing')).toBeUndefined()
    })

    it('round-trips a value without a TTL', () => {
      setCacheValue<{ n: number }>('k', { n: 1 })
      expect(getCacheValue<{ n: number }>('k')).toEqual({ n: 1 })
    })

    it('preserves reference equality (no cloning) for stored objects', () => {
      const value = { list: [1, 2, 3] }
      setCacheValue('ref', value)
      expect(getCacheValue<typeof value>('ref')).toBe(value)
    })

    it('overwrites a previously-stored value under the same key', () => {
      setCacheValue<string>('k', 'first')
      setCacheValue<string>('k', 'second')
      expect(getCacheValue<string>('k')).toBe('second')
    })

    it('returns the stored value while its TTL has not elapsed', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
      setCacheValue<number>('k', 42, 1_000)
      vi.setSystemTime(new Date('2026-01-01T00:00:00.500Z'))
      expect(getCacheValue<number>('k')).toBe(42)
    })

    it('drops the entry and returns undefined once the TTL has elapsed', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
      setCacheValue<number>('k', 42, 1_000)
      vi.setSystemTime(new Date('2026-01-01T00:00:02Z'))

      expect(getCacheValue<number>('k')).toBeUndefined()
      // A second read confirms the expired entry was actually removed from
      // the underlying store (not just skipped once).
      expect(getCacheValue<number>('k')).toBeUndefined()
    })

    it('treats an entry as expired exactly at expiresAt (boundary is inclusive)', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
      setCacheValue<number>('k', 7, 1_000)
      vi.setSystemTime(new Date('2026-01-01T00:00:01Z'))
      expect(getCacheValue<number>('k')).toBeUndefined()
    })

    it('never expires when no TTL was supplied, even after arbitrary time passes', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
      setCacheValue<string>('forever', 'value')
      vi.setSystemTime(new Date('2036-01-01T00:00:00Z'))
      expect(getCacheValue<string>('forever')).toBe('value')
    })

    it('treats a ttlMs of 0 as immediately expired', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
      setCacheValue<string>('zero-ttl', 'value', 0)
      expect(getCacheValue<string>('zero-ttl')).toBeUndefined()
    })
  })

  describe('clearCacheValue', () => {
    it('removes a single key when a key is supplied, leaving others intact', () => {
      setCacheValue<string>('a', '1')
      setCacheValue<string>('b', '2')

      clearCacheValue('a')

      expect(getCacheValue<string>('a')).toBeUndefined()
      expect(getCacheValue<string>('b')).toBe('2')
    })

    it('is a no-op when the supplied key is not present', () => {
      setCacheValue<string>('a', '1')
      clearCacheValue('missing')
      expect(getCacheValue<string>('a')).toBe('1')
    })

    it('clears every entry when called with no arguments', () => {
      setCacheValue<string>('a', '1')
      setCacheValue<string>('b', '2')

      clearCacheValue()

      expect(getCacheValue<string>('a')).toBeUndefined()
      expect(getCacheValue<string>('b')).toBeUndefined()
    })
  })
})

describe('useCache ', () => {
  const baseOptions = {
    key: 'demo-key',
    fetcher: async () => 'live',
    demoData: 'demo',
    initialData: 'initial',
    category: 'default',
    persist: true,
  } as const

  beforeEach(() => {
    clearCacheValue()
  })

  it('returns initialData when no cached value exists for the key', () => {
    const { result } = renderHook(() => useCache<string>({ ...baseOptions }))
    expect(result.current.data).toBe('initial')
  })

  it('returns the cached value when one is present under the key', () => {
    setCacheValue<string>(baseOptions.key, 'cached')
    const { result } = renderHook(() => useCache<string>({ ...baseOptions }))
    expect(result.current.data).toBe('cached')
  })

  it('returns the fixed-shape stub flags expected by consumers', () => {
    const { result } = renderHook(() => useCache<string>({ ...baseOptions }))
    expect(result.current).toMatchObject({
      isLoading: false,
      isRefreshing: false,
      isFailed: false,
      isDemoFallback: false,
      consecutiveFailures: 0,
      lastRefresh: null,
    })
    expect(typeof result.current.refetch).toBe('function')
  })

  it('refetch resolves without throwing (live off is a no-op)', async () => {
    const { result } = renderHook(() => useCache<string>({ ...baseOptions }))
    await expect(result.current.refetch()).resolves.toBeUndefined()
  })

  it('does not call fetcher when live is off', () => {
    const fetcher = vi.fn(async () => 'live')
    renderHook(() => useCache<string>({ ...baseOptions, fetcher }))
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('invokes fetcher and surfaces its data when live is on', async () => {
    const fetcher = vi.fn(async () => 'live')
    const { result } = renderHook(() => useCache<string>({ ...baseOptions, fetcher, live: true }))
    await waitFor(() => expect(result.current.data).toBe('live'))
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(result.current.lastRefresh).not.toBeNull()

    fetcher.mockResolvedValueOnce('refreshed')
    await result.current.refetch()
    await waitFor(() => expect(result.current.data).toBe('refreshed'))
  })

  it('counts failures when the live fetcher rejects', async () => {
    const fetcher = vi.fn(async () => { throw new Error('boom') })
    const { result } = renderHook(() => useCache<string>({ ...baseOptions, fetcher, live: true }))
    await waitFor(() => expect(result.current.isFailed).toBe(true))
    expect(result.current.data).toBe('initial')
  })

  it('skips cache and state updates when unmounted before the fetcher resolves', async () => {
    let resolveFetch: (value: string) => void = () => {}
    const fetcher = vi.fn(
      () => new Promise<string>(resolve => { resolveFetch = resolve }),
    )
    const { unmount } = renderHook(() =>
      useCache<string>({ ...baseOptions, fetcher, live: true }),
    )
    expect(fetcher).toHaveBeenCalledTimes(1)

    unmount()
    resolveFetch('late')
    await new Promise(resolve => setTimeout(resolve, 0))

    // The unmounted guard returns before setCacheValue, so nothing is cached.
    expect(getCacheValue<string>(baseOptions.key)).toBeUndefined()
  })

  it('skips failure bookkeeping when unmounted before the fetcher rejects', async () => {
    let rejectFetch: (error: Error) => void = () => {}
    const fetcher = vi.fn(
      () => new Promise<string>((_resolve, reject) => { rejectFetch = reject }),
    )
    const { unmount } = renderHook(() =>
      useCache<string>({ ...baseOptions, fetcher, live: true }),
    )
    expect(fetcher).toHaveBeenCalledTimes(1)

    unmount()
    rejectFetch(new Error('late failure'))
    // Settling after unmount must not throw or leak a state update; this
    // exercises the unmounted arms of the catch/finally guards.
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('ignores a live value fetched under a previous key after the key changes', async () => {
    const fetcher = vi.fn(async () => 'live')
    const { result, rerender } = renderHook(
      ({ key }: { key: string }) => useCache<string>({ ...baseOptions, key, fetcher, live: true }),
      { initialProps: { key: 'first-key' } },
    )
    await waitFor(() => expect(result.current.data).toBe('live'))

    rerender({ key: 'second-key' })

    // fetched.key ('first-key') !== 'second-key', so the stale live value is
    // ignored and data falls back to cache/initialData for the new key.
    expect(result.current.data).toBe('initial')

    // Let the refetch for the new key settle to avoid act() warnings.
    await waitFor(() => expect(result.current.data).toBe('live'))
  })
})
