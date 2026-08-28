import { describe, expect, it } from 'vitest'
import { useCardData } from './cardHooks'

// useCardData is a pure hook wrapper around resolveItemsPerPage +
// slice/count derivations. All branches are synchronous, so we exercise
// them by direct invocation instead of react-hooks-testing-library.

interface Item {
  id: number
}

const items: Item[] = Array.from({ length: 12 }, (_, i) => ({ id: i }))

describe('useCardData', () => {
  it('defaults to 5 items per page when no options are provided', () => {
    const r = useCardData(items)
    expect(r.itemsPerPage).toBe(5)
    expect(r.items).toHaveLength(5)
    expect(r.totalItems).toBe(12)
    expect(r.currentPage).toBe(1)
    expect(r.totalPages).toBe(Math.ceil(12 / 5))
    expect(r.needsPagination).toBe(true)
  })

  it('respects a valid positive integer defaultLimit', () => {
    const r = useCardData(items, { defaultLimit: 4 })
    expect(r.itemsPerPage).toBe(4)
    expect(r.items).toHaveLength(4)
    expect(r.totalPages).toBe(3)
    expect(r.needsPagination).toBe(true)
  })

  it('falls back to 5 for a non-integer defaultLimit', () => {
    const r = useCardData(items, { defaultLimit: 3.7 as unknown as number })
    expect(r.itemsPerPage).toBe(5)
  })

  it('falls back to 5 for a zero or negative defaultLimit', () => {
    expect(useCardData(items, { defaultLimit: 0 }).itemsPerPage).toBe(5)
    expect(useCardData(items, { defaultLimit: -3 }).itemsPerPage).toBe(5)
  })

  it('treats defaultLimit "unlimited" as no cap', () => {
    const r = useCardData(items, { defaultLimit: 'unlimited' })
    expect(r.itemsPerPage).toBe('unlimited')
    expect(r.items).toHaveLength(12)
    expect(r.totalPages).toBe(1)
    expect(r.needsPagination).toBe(false)
  })

  it('reports needsPagination=false when items fit in one page', () => {
    const r = useCardData(items.slice(0, 5), { defaultLimit: 5 })
    expect(r.needsPagination).toBe(false)
  })

  it('reports needsPagination=false when items count is below the page size', () => {
    const r = useCardData(items.slice(0, 3))
    expect(r.needsPagination).toBe(false)
    expect(r.totalPages).toBe(1)
  })

  it('handles an empty item list without throwing', () => {
    const r = useCardData<Item>([])
    expect(r.totalItems).toBe(0)
    expect(r.items).toHaveLength(0)
    expect(r.totalPages).toBe(0)
    expect(r.needsPagination).toBe(false)
  })

  it('exposes the default sort field and direction when not configured', () => {
    const r = useCardData(items)
    expect(r.sorting.sortBy).toBe('status')
    expect(r.sorting.sortDirection).toBe('asc')
  })

  it('exposes the caller-supplied sort field and direction', () => {
    const r = useCardData(items, {
      sort: { defaultField: 'name', defaultDirection: 'desc' },
    })
    expect(r.sorting.sortBy).toBe('name')
    expect(r.sorting.sortDirection).toBe('desc')
  })

  it('exposes empty filter and cluster state by default', () => {
    const r = useCardData(items)
    expect(r.filters.search).toBe('')
    expect(r.filters.localClusterFilter).toEqual([])
    expect(r.filters.availableClusters).toEqual([])
    expect(r.filters.showClusterFilter).toBe(false)
    expect(r.filters.clusterFilterRef.current).toBeNull()
  })

  it('exposes no-op state setters that do not throw', () => {
    const r = useCardData(items)
    expect(() => r.setItemsPerPage()).not.toThrow()
    expect(() => r.goToPage()).not.toThrow()
    expect(() => r.filters.setSearch()).not.toThrow()
    expect(() => r.filters.toggleClusterFilter()).not.toThrow()
    expect(() => r.filters.clearClusterFilter()).not.toThrow()
    expect(() => r.filters.setShowClusterFilter()).not.toThrow()
    expect(() => r.sorting.setSortBy()).not.toThrow()
    expect(() => r.sorting.setSortDirection()).not.toThrow()
  })

  it('exposes a null containerRef and empty containerStyle', () => {
    const r = useCardData(items)
    expect(r.containerRef.current).toBeNull()
    expect(r.containerStyle).toEqual({})
  })
})
