import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useCardData } from '../../lib/cards/cardHooks'

interface TestItem {
  name: string
  cluster: string
}

describe('useCardData', () => {
  it('returns the provided items with marketplace pagination defaults', () => {
    const items: TestItem[] = [
      { name: 'argo-cd', cluster: 'hub-east' },
      { name: 'kyverno', cluster: 'edge-west' },
    ]

    const { result } = renderHook(() => useCardData(items))

    expect(result.current.items).toEqual(items)
    expect(result.current.totalItems).toBe(2)
    expect(result.current.currentPage).toBe(1)
    expect(result.current.totalPages).toBe(1)
    expect(result.current.itemsPerPage).toBe(5)
    expect(result.current.needsPagination).toBe(false)
    expect(result.current.filters).toMatchObject({
      search: '',
      localClusterFilter: [],
      availableClusters: ['edge-west', 'hub-east'],
      showClusterFilter: false,
    })
    expect(result.current.filters.clusterFilterRef).toEqual({ current: null })
    expect(result.current.sorting).toMatchObject({
      sortBy: 'status',
      sortDirection: 'asc',
    })
    expect(result.current.containerRef).toEqual({ current: null })
    expect(result.current.containerStyle).toEqual({})
  })

  it('exposes callbacks that are safe to invoke and update state', () => {
    const { result } = renderHook(() => useCardData<TestItem>([]))

    expect(() => {
      act(() => {
        result.current.setItemsPerPage(5)
        result.current.goToPage(1)
        result.current.filters.setSearch('')
        result.current.filters.toggleClusterFilter('hub-east')
        result.current.filters.clearClusterFilter()
        result.current.filters.setShowClusterFilter(false)
        result.current.sorting.setSortBy('status')
        result.current.sorting.setSortDirection('asc')
      })
    }).not.toThrow()

    expect(result.current.totalItems).toBe(0)
    expect(result.current.filters.search).toBe('')
    expect(result.current.sorting.sortBy).toBe('status')
    expect(result.current.sorting.sortDirection).toBe('asc')
  })
})
