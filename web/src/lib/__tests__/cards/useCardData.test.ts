import { describe, expect, it } from 'vitest'

import { useCardData } from '../../cards/cardHooks'

describe('useCardData — pagination', () => {
  it('defaults to 5 items per page', () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ id: i }))
    const result = useCardData(items)

    expect(result.itemsPerPage).toBe(5)
    expect(result.items).toHaveLength(5)
    expect(result.totalItems).toBe(12)
    expect(result.totalPages).toBe(3)
    expect(result.needsPagination).toBe(true)
  })

  it('uses custom defaultLimit when provided', () => {
    const items = Array.from({ length: 8 }, (_, i) => ({ id: i }))
    const result = useCardData(items, { defaultLimit: 3 })

    expect(result.itemsPerPage).toBe(3)
    expect(result.items).toHaveLength(3)
    expect(result.totalPages).toBe(3) // ceil(8/3)
    expect(result.needsPagination).toBe(true)
  })

  it('returns all items when defaultLimit is "unlimited"', () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ id: i }))
    const result = useCardData(items, { defaultLimit: 'unlimited' })

    expect(result.itemsPerPage).toBe('unlimited')
    expect(result.items).toHaveLength(20)
    expect(result.totalPages).toBe(1)
    expect(result.needsPagination).toBe(false)
  })

  it('does not paginate when items fit on one page', () => {
    const items = [{ id: 1 }, { id: 2 }]
    const result = useCardData(items)

    expect(result.needsPagination).toBe(false)
    expect(result.totalPages).toBe(1)
    expect(result.items).toHaveLength(2)
  })

  it('handles empty item list', () => {
    const result = useCardData([])

    expect(result.items).toHaveLength(0)
    expect(result.totalItems).toBe(0)
    expect(result.totalPages).toBe(0)
    expect(result.needsPagination).toBe(false)
    expect(result.currentPage).toBe(1)
  })

  it('handles exactly one page of items (boundary)', () => {
    const items = Array.from({ length: 5 }, (_, i) => ({ id: i }))
    const result = useCardData(items)

    expect(result.items).toHaveLength(5)
    expect(result.totalPages).toBe(1)
    expect(result.needsPagination).toBe(false)
  })

  it('handles one more than a page (boundary)', () => {
    const items = Array.from({ length: 6 }, (_, i) => ({ id: i }))
    const result = useCardData(items)

    expect(result.items).toHaveLength(5)
    expect(result.totalPages).toBe(2)
    expect(result.needsPagination).toBe(true)
  })
})

describe('useCardData — sorting defaults', () => {
  it('defaults sortBy to "status" and direction to "asc"', () => {
    const result = useCardData([])

    expect(result.sorting.sortBy).toBe('status')
    expect(result.sorting.sortDirection).toBe('asc')
  })

  it('uses custom sort defaults when provided', () => {
    const result = useCardData([], {
      sort: { defaultField: 'name', defaultDirection: 'desc' },
    })

    expect(result.sorting.sortBy).toBe('name')
    expect(result.sorting.sortDirection).toBe('desc')
  })

  it('falls back to "status" when sort option has no defaultField', () => {
    const result = useCardData([], { sort: {} })

    expect(result.sorting.sortBy).toBe('status')
  })

  it('falls back to "asc" when sort option has no defaultDirection', () => {
    const result = useCardData([], { sort: {} })

    expect(result.sorting.sortDirection).toBe('asc')
  })
})

describe('useCardData — filter defaults', () => {
  it('initializes search as empty string', () => {
    const result = useCardData([{ name: 'test' }])

    expect(result.filters.search).toBe('')
  })

  it('initializes cluster filter as empty array', () => {
    const result = useCardData([])

    expect(result.filters.localClusterFilter).toEqual([])
    expect(result.filters.availableClusters).toEqual([])
  })

  it('initializes showClusterFilter as false', () => {
    const result = useCardData([])

    expect(result.filters.showClusterFilter).toBe(false)
  })

  it('provides a null ref for cluster filter', () => {
    const result = useCardData([])

    expect(result.filters.clusterFilterRef).toEqual({ current: null })
  })
})

describe('useCardData — container', () => {
  it('provides a null container ref', () => {
    const result = useCardData([])

    expect(result.containerRef).toEqual({ current: null })
  })

  it('provides an empty container style object', () => {
    const result = useCardData([])

    expect(result.containerStyle).toEqual({})
  })
})

describe('useCardData — type safety', () => {
  it('preserves item type in returned items', () => {
    interface Card { name: string; version: number }
    const items: Card[] = [{ name: 'argo', version: 3 }]
    const result = useCardData(items)

    expect(result.items[0].name).toBe('argo')
    expect(result.items[0].version).toBe(3)
  })

  it('works with primitive types', () => {
    const result = useCardData(['a', 'b', 'c'])

    expect(result.items).toEqual(['a', 'b', 'c'])
    expect(result.totalItems).toBe(3)
  })
})
