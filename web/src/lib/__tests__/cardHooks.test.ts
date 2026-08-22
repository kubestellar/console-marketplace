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

  it('enables pagination and computes totalPages when items exceed the default page size', () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ name: `item-${i}` }))

    const result = useCardData(items)

    expect(result.needsPagination).toBe(true)
    expect(result.itemsPerPage).toBe(5)
    expect(result.items).toHaveLength(5)
    expect(result.totalItems).toBe(12)
    expect(result.totalPages).toBe(3)
  })

  it('honors a positive numeric defaultLimit', () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ name: `item-${i}` }))

    const result = useCardData(items, { defaultLimit: 4 })

    expect(result.itemsPerPage).toBe(4)
    expect(result.items).toHaveLength(4)
    expect(result.totalPages).toBe(3)
    expect(result.needsPagination).toBe(true)
  })

  it.each([
    ['zero', 0],
    ['negative', -5],
    ['non-integer', 2.5],
  ])('falls back to the default page size for a %s defaultLimit', (_label, defaultLimit) => {
    const items = Array.from({ length: 3 }, (_, i) => ({ name: `item-${i}` }))

    const result = useCardData(items, { defaultLimit })

    expect(result.itemsPerPage).toBe(5)
    expect(result.needsPagination).toBe(false)
  })

  it('short-circuits pagination when defaultLimit is "unlimited"', () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ name: `item-${i}` }))

    const result = useCardData(items, { defaultLimit: 'unlimited' })

    expect(result.itemsPerPage).toBe('unlimited')
    expect(result.items).toHaveLength(20)
    expect(result.needsPagination).toBe(false)
    expect(result.totalPages).toBe(1)
  })

  it('overrides sort defaults with sort.defaultField and sort.defaultDirection', () => {
    const result = useCardData([], {
      sort: { defaultField: 'name', defaultDirection: 'desc' },
    })

    expect(result.sorting.sortBy).toBe('name')
    expect(result.sorting.sortDirection).toBe('desc')
  })
})
