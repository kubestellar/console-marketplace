import { describe, expect, it } from 'vitest'

import { useCardData } from '../cards/cardHooks'

describe('useCardData', () => {
  it('returns the provided items with a derived total count', () => {
    const items = [{ name: 'argo' }, { name: 'flux' }]

    const result = useCardData(items)

    expect(result.items).toStrictEqual(items)
    expect(result.totalItems).toBe(2)
    expect(result.currentPage).toBe(1)
    expect(result.totalPages).toBe(1)
    expect(result.itemsPerPage).toBe(5)
    expect(result.needsPagination).toBe(false)
  })

  it('exposes the default filter, sorting, and ref values used by cards', () => {
    const result = useCardData([])

    expect(result.filters).toEqual({
      search: '',
      setSearch: expect.any(Function),
      localClusterFilter: [],
      toggleClusterFilter: expect.any(Function),
      clearClusterFilter: expect.any(Function),
      availableClusters: [],
      showClusterFilter: false,
      setShowClusterFilter: expect.any(Function),
      clusterFilterRef: { current: null },
    })
    expect(result.sorting).toEqual({
      sortBy: 'status',
      setSortBy: expect.any(Function),
      sortDirection: 'asc',
      setSortDirection: expect.any(Function),
    })
    expect(result.containerRef).toEqual({ current: null })
    expect(result.containerStyle).toEqual({})
  })

  it('provides no-op handlers that can be invoked safely', () => {
    const result = useCardData(['karmada'])

    expect(result.setItemsPerPage()).toBeUndefined()
    expect(result.goToPage()).toBeUndefined()
    expect(result.filters.setSearch()).toBeUndefined()
    expect(result.filters.toggleClusterFilter()).toBeUndefined()
    expect(result.filters.clearClusterFilter()).toBeUndefined()
    expect(result.filters.setShowClusterFilter()).toBeUndefined()
    expect(result.sorting.setSortBy()).toBeUndefined()
    expect(result.sorting.setSortDirection()).toBeUndefined()
  })
})
