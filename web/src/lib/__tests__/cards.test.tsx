import { fireEvent, render, renderHook, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  CardAIActions,
  CardControlsRow,
  CardPaginationFooter,
  CardSearchInput,
} from '../cards/CardComponents'
import { useCardData } from '../cards/cardHooks'

const DEFAULT_PAGE_SIZE = 5
const CUSTOM_PAGE_SIZE = 2
const TOTAL_ITEMS = 3
const PAGED_ITEM_COUNT = 6
const SECOND_PAGE_COUNT = 2

describe('lib/cards', () => {
  describe('CardComponents', () => {
    it('renders a controlled search input and forwards special-character value changes', () => {
      const onChange = vi.fn()

      render(
        <CardSearchInput
          value="helm"
          onChange={onChange}
          placeholder="Search marketplace cards"
          className="marketplace-search"
        />,
      )

      const input = screen.getByTestId('card-search') as HTMLInputElement
      expect(input.value).toBe('helm')
      expect(input.placeholder).toBe('Search marketplace cards')
      expect(input.className).toContain('marketplace-search')

      fireEvent.change(input, { target: { value: 'gpu/ops?*' } })

      expect(onChange).toHaveBeenCalledWith('gpu/ops?*')
    })

    it('renders layout helpers and stable smoke-test markers', () => {
      render(
        <>
          <CardControlsRow>
            <span>install actions</span>
          </CardControlsRow>
          <CardPaginationFooter
            currentPage={1}
            totalPages={1}
            totalItems={0}
            itemsPerPage={DEFAULT_PAGE_SIZE}
            onPageChange={() => {}}
            needsPagination={false}
          />
          <CardAIActions />
        </>,
      )

      expect(screen.getByText('install actions')).toBeInTheDocument()
      expect(screen.getByTestId('card-pagination')).toBeInTheDocument()
      expect(screen.getByTestId('card-ai-actions')).toBeInTheDocument()
    })
  })

  describe('useCardData', () => {
    it('limits items to the configured page size and reports pagination metadata', () => {
      const items = [
        { name: 'argo-cd' },
        { name: 'crossplane' },
        { name: 'gpu/ops?*' },
      ]

      const { result } = renderHook(() => useCardData(items, { defaultLimit: CUSTOM_PAGE_SIZE }))

      expect(result.current.items).toStrictEqual(items.slice(0, CUSTOM_PAGE_SIZE))
      expect(result.current.totalItems).toBe(TOTAL_ITEMS)
      expect(result.current.totalPages).toBe(SECOND_PAGE_COUNT)
      expect(result.current.itemsPerPage).toBe(CUSTOM_PAGE_SIZE)
      expect(result.current.needsPagination).toBe(true)
    })

    it('returns all items when pagination is disabled explicitly', () => {
      const items = [{ name: 'open-cluster-management' }, { name: 'kyverno' }]

      const { result } = renderHook(() => useCardData(items, { defaultLimit: 'unlimited' }))

      expect(result.current.items).toStrictEqual(items)
      expect(result.current.totalPages).toBe(1)
      expect(result.current.itemsPerPage).toBe('unlimited')
      expect(result.current.needsPagination).toBe(false)
    })

    it('falls back to the default page size for malformed numeric limits', () => {
      const items = Array.from({ length: PAGED_ITEM_COUNT }, (_, index) => ({ name: `card-${index}` }))

      const { result: zeroLimit } = renderHook(() => useCardData(items, { defaultLimit: 0 }))
      const { result: negativeLimit } = renderHook(() => useCardData(items, { defaultLimit: -3 }))

      expect(zeroLimit.current.itemsPerPage).toBe(DEFAULT_PAGE_SIZE)
      expect(zeroLimit.current.items).toHaveLength(DEFAULT_PAGE_SIZE)
      expect(zeroLimit.current.totalPages).toBe(SECOND_PAGE_COUNT)
      expect(negativeLimit.current.itemsPerPage).toBe(DEFAULT_PAGE_SIZE)
      expect(negativeLimit.current.items).toHaveLength(DEFAULT_PAGE_SIZE)
      expect(negativeLimit.current.totalPages).toBe(SECOND_PAGE_COUNT)
    })

    it('honors custom sort defaults while keeping filter state initialized', () => {
      const { result } = renderHook(() =>
        useCardData([], {
          sort: {
            defaultField: 'name',
            defaultDirection: 'desc',
          },
        }),
      )

      expect(result.current.sorting.sortBy).toBe('name')
      expect(result.current.sorting.sortDirection).toBe('desc')
      expect(result.current.filters.search).toBe('')
      expect(result.current.filters.availableClusters).toStrictEqual([])
      expect(result.current.filters.clusterFilterRef).toEqual({ current: null })
    })
  })
})
