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
})
