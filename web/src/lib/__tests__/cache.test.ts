import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clearCacheValue, getCacheValue, setCacheValue, useCache } from '../cache'

describe('cache utilities', () => {
  beforeEach(() => {
    vi.useRealTimers()
    clearCacheValue()
  })

  it('stores entries and lets useCache read persisted values by key', () => {
    setCacheValue('marketplace-card', { total: 3 })

    expect(getCacheValue<{ total: number }>('marketplace-card')).toEqual({ total: 3 })
    expect(useCache({
      key: 'marketplace-card',
      fetcher: async () => ({ total: 0 }),
      demoData: { total: 9 },
      initialData: { total: 0 },
      category: 'default',
      persist: true,
    }).data).toEqual({ total: 3 })
  })

  it('expires stale entries and supports clearing specific keys', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'))
    setCacheValue('short-lived', 'value', 1000)
    setCacheValue('keep', 'fresh')

    vi.advanceTimersByTime(1001)

    expect(getCacheValue('short-lived')).toBeUndefined()
    expect(getCacheValue('keep')).toBe('fresh')

    clearCacheValue('keep')

    expect(getCacheValue('keep')).toBeUndefined()
  })

  it('never expires entries stored without a ttlMs', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'))
    setCacheValue('permanent', 'value')

    vi.advanceTimersByTime(1000 * 60 * 60 * 24 * 365)

    expect(getCacheValue('permanent')).toBe('value')
  })

  it('treats an entry as expired when expiresAt equals the current time', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'))
    setCacheValue('boundary', 'value', 1000)

    vi.advanceTimersByTime(1000)

    expect(getCacheValue('boundary')).toBeUndefined()
  })

  it('treats ttlMs of 0 as immediately expired', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'))
    setCacheValue('zero-ttl', 'value', 0)

    expect(getCacheValue('zero-ttl')).toBeUndefined()
  })

  it('overwrites an existing key with a new value and new ttl', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'))
    setCacheValue('overwrite', 'first', 1000)
    setCacheValue('overwrite', 'second', 5000)

    vi.advanceTimersByTime(4000)

    expect(getCacheValue('overwrite')).toBe('second')

    vi.advanceTimersByTime(1001)

    expect(getCacheValue('overwrite')).toBeUndefined()
  })

  it('clears every entry when clearCacheValue is called with no argument', () => {
    setCacheValue('a', 1)
    setCacheValue('b', 2)

    clearCacheValue()

    expect(getCacheValue('a')).toBeUndefined()
    expect(getCacheValue('b')).toBeUndefined()
  })

  it('is a no-op when clearing an unknown key', () => {
    setCacheValue('known', 'value')

    expect(() => clearCacheValue('unknown-key')).not.toThrow()
    expect(getCacheValue('known')).toBe('value')
  })

  it('returns stable defaults and a resolvable refetch from useCache', async () => {
    const result = useCache({
      key: 'stable-defaults',
      fetcher: async () => ({ total: 0 }),
      demoData: { total: 9 },
      initialData: { total: 0 },
      category: 'default',
      persist: true,
    })

    expect(result.isLoading).toBe(false)
    expect(result.isRefreshing).toBe(false)
    expect(result.isFailed).toBe(false)
    expect(result.isDemoFallback).toBe(false)
    expect(result.consecutiveFailures).toBe(0)
    expect(result.lastRefresh).toBeNull()
    await expect(result.refetch()).resolves.toBeUndefined()
  })
})
