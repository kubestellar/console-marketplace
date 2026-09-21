import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useCardData } from './cardHooks'

interface Item {
  id: number
  name?: string
  status?: string
  cluster?: string
}

const items: Item[] = Array.from({ length: 12 }, (_, i) => ({ id: i }))

describe('useCardData', () => {
  it('defaults to 5 items per page when no options are provided', () => {
    const { result } = renderHook(() => useCardData(items))
    expect(result.current.itemsPerPage).toBe(5)
    expect(result.current.items).toHaveLength(5)
    expect(result.current.totalItems).toBe(12)
    expect(result.current.currentPage).toBe(1)
    expect(result.current.totalPages).toBe(Math.ceil(12 / 5))
    expect(result.current.needsPagination).toBe(true)
  })

  it('respects a valid positive integer defaultLimit', () => {
    const { result } = renderHook(() => useCardData(items, { defaultLimit: 4 }))
    expect(result.current.itemsPerPage).toBe(4)
    expect(result.current.items).toHaveLength(4)
    expect(result.current.totalPages).toBe(3)
    expect(result.current.needsPagination).toBe(true)
  })

  it('falls back to 5 for a non-integer defaultLimit', () => {
    const { result } = renderHook(() =>
      useCardData(items, { defaultLimit: 3.7 as unknown as number }),
    )
    expect(result.current.itemsPerPage).toBe(5)
  })

  it('falls back to 5 for a zero or negative defaultLimit', () => {
    expect(renderHook(() => useCardData(items, { defaultLimit: 0 })).result.current.itemsPerPage).toBe(5)
    expect(renderHook(() => useCardData(items, { defaultLimit: -3 })).result.current.itemsPerPage).toBe(5)
  })

  it('treats defaultLimit "unlimited" as no cap', () => {
    const { result } = renderHook(() => useCardData(items, { defaultLimit: 'unlimited' }))
    expect(result.current.itemsPerPage).toBe('unlimited')
    expect(result.current.items).toHaveLength(12)
    expect(result.current.totalPages).toBe(1)
    expect(result.current.needsPagination).toBe(false)
  })

  it('reports needsPagination=false when items fit in one page', () => {
    const { result } = renderHook(() => useCardData(items.slice(0, 5), { defaultLimit: 5 }))
    expect(result.current.needsPagination).toBe(false)
  })

  it('reports needsPagination=false when items count is below the page size', () => {
    const { result } = renderHook(() => useCardData(items.slice(0, 3)))
    expect(result.current.needsPagination).toBe(false)
    expect(result.current.totalPages).toBe(1)
  })

  it('handles exactly one page of items (boundary)', () => {
    const { result } = renderHook(() => useCardData(items.slice(0, 5)))
    expect(result.current.items).toHaveLength(5)
    expect(result.current.totalPages).toBe(1)
    expect(result.current.needsPagination).toBe(false)
  })

  it('handles one more item than a page (boundary)', () => {
    const { result } = renderHook(() => useCardData(items.slice(0, 6)))
    expect(result.current.items).toHaveLength(5)
    expect(result.current.totalPages).toBe(2)
    expect(result.current.needsPagination).toBe(true)
  })

  it('returns the provided items unchanged when they fit on one page', () => {
    const small = [{ id: 100 }, { id: 200 }]
    const { result } = renderHook(() => useCardData(small))
    expect(result.current.items).toStrictEqual(small)
  })

  it('works with primitive item types', () => {
    const { result } = renderHook(() => useCardData(['a', 'b', 'c']))
    expect(result.current.items).toEqual(['a', 'b', 'c'])
    expect(result.current.totalItems).toBe(3)
  })

  it('handles an empty item list without throwing', () => {
    const { result } = renderHook(() => useCardData<Item>([]))
    expect(result.current.totalItems).toBe(0)
    expect(result.current.items).toHaveLength(0)
    expect(result.current.totalPages).toBe(0)
    expect(result.current.needsPagination).toBe(false)
  })

  it('exposes the default sort field and direction when not configured', () => {
    const { result } = renderHook(() => useCardData(items))
    expect(result.current.sorting.sortBy).toBe('status')
    expect(result.current.sorting.sortDirection).toBe('asc')
  })

  it('exposes the caller-supplied sort field and direction', () => {
    const { result } = renderHook(() =>
      useCardData(items, { sort: { defaultField: 'name', defaultDirection: 'desc' } }),
    )
    expect(result.current.sorting.sortBy).toBe('name')
    expect(result.current.sorting.sortDirection).toBe('desc')
  })

  it('falls back to "status" when sort option has no defaultField', () => {
    const { result } = renderHook(() => useCardData(items, { sort: {} }))
    expect(result.current.sorting.sortBy).toBe('status')
  })

  it('falls back to "asc" when sort option has no defaultDirection', () => {
    const { result } = renderHook(() => useCardData(items, { sort: {} }))
    expect(result.current.sorting.sortDirection).toBe('asc')
  })

  it('exposes empty filter and cluster state by default', () => {
    const { result } = renderHook(() => useCardData(items))
    expect(result.current.filters.search).toBe('')
    expect(result.current.filters.localClusterFilter).toEqual([])
    expect(result.current.filters.availableClusters).toEqual([])
    expect(result.current.filters.showClusterFilter).toBe(false)
    expect(result.current.filters.clusterFilterRef.current).toBeNull()
  })

  it('exposes a null containerRef and empty containerStyle', () => {
    const { result } = renderHook(() => useCardData(items))
    expect(result.current.containerRef.current).toBeNull()
    expect(result.current.containerStyle).toEqual({})
  })

  it('setSearch filters items by every field when no searchFields are given', () => {
    const named: Item[] = [
      { id: 1, name: 'alpha', status: 'running' },
      { id: 2, name: 'beta', status: 'failed' },
    ]
    const { result } = renderHook(() => useCardData(named))

    act(() => result.current.filters.setSearch('alpha'))

    expect(result.current.filters.search).toBe('alpha')
    expect(result.current.items).toEqual([{ id: 1, name: 'alpha', status: 'running' }])
    expect(result.current.totalItems).toBe(1)
  })

  it('setSearch restricts matching to the configured searchFields', () => {
    const named: Item[] = [
      { id: 1, name: 'alpha', status: 'running' },
      { id: 2, name: 'beta', status: 'alpha-ish' },
    ]
    const { result } = renderHook(() =>
      useCardData(named, { filter: { searchFields: ['name'] } }),
    )

    act(() => result.current.filters.setSearch('alpha'))

    expect(result.current.items).toEqual([{ id: 1, name: 'alpha', status: 'running' }])
  })

  it('setSearch is case-insensitive and resets to page 1', () => {
    const { result } = renderHook(() => useCardData(items, { defaultLimit: 4 }))

    act(() => result.current.goToPage(2))
    expect(result.current.currentPage).toBe(2)

    act(() => result.current.filters.setSearch('SOMETHING-THAT-MATCHES-NOTHING'))
    expect(result.current.currentPage).toBe(1)
    expect(result.current.items).toHaveLength(0)
  })

  it('clearing the search text restores the full item set', () => {
    const named: Item[] = [
      { id: 1, name: 'alpha' },
      { id: 2, name: 'beta' },
    ]
    const { result } = renderHook(() => useCardData(named))

    act(() => result.current.filters.setSearch('alpha'))
    expect(result.current.totalItems).toBe(1)

    act(() => result.current.filters.setSearch(''))
    expect(result.current.totalItems).toBe(2)
  })

  it('goToPage moves to the requested page and clamps to valid bounds', () => {
    const { result } = renderHook(() => useCardData(items, { defaultLimit: 5 }))

    act(() => result.current.goToPage(2))
    expect(result.current.currentPage).toBe(2)
    expect(result.current.items).toHaveLength(5)

    act(() => result.current.goToPage(999))
    expect(result.current.currentPage).toBe(result.current.totalPages)

    act(() => result.current.goToPage(-5))
    expect(result.current.currentPage).toBe(1)
  })

  it('setItemsPerPage changes the page size and resets to page 1', () => {
    const { result } = renderHook(() => useCardData(items, { defaultLimit: 5 }))

    act(() => result.current.goToPage(2))
    act(() => result.current.setItemsPerPage(3))

    expect(result.current.itemsPerPage).toBe(3)
    expect(result.current.currentPage).toBe(1)
    expect(result.current.items).toHaveLength(3)
    expect(result.current.totalPages).toBe(4)
  })

  it('toggleClusterFilter narrows items to the selected clusters and clearClusterFilter restores them', () => {
    const clustered: Item[] = [
      { id: 1, cluster: 'east' },
      { id: 2, cluster: 'west' },
      { id: 3, cluster: 'east' },
    ]
    const { result } = renderHook(() => useCardData(clustered))

    expect(result.current.filters.availableClusters).toEqual(['east', 'west'])

    act(() => result.current.filters.toggleClusterFilter('east'))
    expect(result.current.filters.localClusterFilter).toEqual(['east'])
    expect(result.current.totalItems).toBe(2)

    act(() => result.current.filters.toggleClusterFilter('east'))
    expect(result.current.filters.localClusterFilter).toEqual([])
    expect(result.current.totalItems).toBe(3)

    act(() => result.current.filters.toggleClusterFilter('west'))
    act(() => result.current.filters.clearClusterFilter())
    expect(result.current.filters.localClusterFilter).toEqual([])
    expect(result.current.totalItems).toBe(3)
  })

  it('setShowClusterFilter toggles the dropdown-open state', () => {
    const { result } = renderHook(() => useCardData(items))
    expect(result.current.filters.showClusterFilter).toBe(false)

    act(() => result.current.filters.setShowClusterFilter(true))
    expect(result.current.filters.showClusterFilter).toBe(true)
  })

  it('setSortBy / setSortDirection reorder items using the default comparator', () => {
    const named: Item[] = [
      { id: 1, name: 'charlie' },
      { id: 2, name: 'alpha' },
      { id: 3, name: 'bravo' },
    ]
    const { result } = renderHook(() =>
      useCardData(named, { sort: { defaultField: 'name', defaultDirection: 'asc' } }),
    )

    expect(result.current.items.map(i => i.name)).toEqual(['alpha', 'bravo', 'charlie'])

    act(() => result.current.sorting.setSortDirection('desc'))
    expect(result.current.items.map(i => i.name)).toEqual(['charlie', 'bravo', 'alpha'])
  })

  it('setSortBy switches the sorted field using a custom comparator', () => {
    const rows = [
      { id: 1, priority: 2 },
      { id: 2, priority: 0 },
      { id: 3, priority: 1 },
    ]
    const { result } = renderHook(() =>
      useCardData(rows, {
        sort: {
          defaultField: 'id',
          comparators: { priority: (a, b) => (a as number) - (b as number) },
        },
      }),
    )

    act(() => result.current.sorting.setSortBy('priority'))
    expect(result.current.items.map(i => i.id)).toEqual([2, 3, 1])
  })
})
