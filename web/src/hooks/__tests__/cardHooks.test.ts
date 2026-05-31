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

    const result = useCardData(items)

    expect(result.items).toBe(items)
    expect(result.totalItems).toBe(2)
    expect(result.currentPage).toBe(1)
    expect(result.totalPages).toBe(1)
    expect(result.itemsPerPage).toBe(5)
    expect(result.needsPagination).toBe(false)
    expect(result.filters).toMatchObject({
      search: '',
      localClusterFilter: [],
      availableClusters: [],
      showClusterFilter: false,
    })
    expect(result.filters.clusterFilterRef).toEqual({ current: null })
    expect(result.sorting).toMatchObject({
      sortBy: 'status',
      sortDirection: 'asc',
    })
    expect(result.containerRef).toEqual({ current: null })
    expect(result.containerStyle).toEqual({})
  })

  it('exposes no-op callbacks that are safe to invoke', () => {
    const result = useCardData<TestItem>([])

    expect(() => {
      result.setItemsPerPage()
      result.goToPage()
      result.filters.setSearch()
      result.filters.toggleClusterFilter()
      result.filters.clearClusterFilter()
      result.filters.setShowClusterFilter()
      result.sorting.setSortBy()
      result.sorting.setSortDirection()
    }).not.toThrow()

    expect(result.totalItems).toBe(0)
    expect(result.filters.search).toBe('')
    expect(result.sorting.sortBy).toBe('status')
    expect(result.sorting.sortDirection).toBe('asc')
  })
})
