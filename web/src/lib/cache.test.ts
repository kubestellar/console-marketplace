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

describe('useCache (stub hook)', () => {
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
    const result = useCache<string>({ ...baseOptions })
    expect(result.data).toBe('initial')
  })

  it('returns the cached value when one is present under the key', () => {
    setCacheValue<string>(baseOptions.key, 'cached')
    const result = useCache<string>({ ...baseOptions })
    expect(result.data).toBe('cached')
  })

  it('returns the fixed-shape stub flags expected by consumers', () => {
    const result = useCache<string>({ ...baseOptions })
    expect(result).toMatchObject({
      isLoading: false,
      isRefreshing: false,
      isFailed: false,
      isDemoFallback: false,
      consecutiveFailures: 0,
      lastRefresh: null,
    })
    expect(typeof result.refetch).toBe('function')
  })

  it('refetch resolves without throwing (stub is a no-op)', async () => {
    const result = useCache<string>({ ...baseOptions })
    await expect(result.refetch()).resolves.toBeUndefined()
  })
})
