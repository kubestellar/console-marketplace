import { fireEvent, render, screen } from '@testing-library/react'
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
          <CardPaginationFooter />
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

      const result = useCardData(items, { defaultLimit: CUSTOM_PAGE_SIZE })

      expect(result.items).toStrictEqual(items.slice(0, CUSTOM_PAGE_SIZE))
      expect(result.totalItems).toBe(TOTAL_ITEMS)
      expect(result.totalPages).toBe(SECOND_PAGE_COUNT)
      expect(result.itemsPerPage).toBe(CUSTOM_PAGE_SIZE)
      expect(result.needsPagination).toBe(true)
    })

    it('returns all items when pagination is disabled explicitly', () => {
      const items = [{ name: 'open-cluster-management' }, { name: 'kyverno' }]

      const result = useCardData(items, { defaultLimit: 'unlimited' })

      expect(result.items).toStrictEqual(items)
      expect(result.totalPages).toBe(1)
      expect(result.itemsPerPage).toBe('unlimited')
      expect(result.needsPagination).toBe(false)
    })

    it('falls back to the default page size for malformed numeric limits', () => {
      const items = Array.from({ length: PAGED_ITEM_COUNT }, (_, index) => ({ name: `card-${index}` }))

      const zeroLimit = useCardData(items, { defaultLimit: 0 })
      const negativeLimit = useCardData(items, { defaultLimit: -3 })

      expect(zeroLimit.itemsPerPage).toBe(DEFAULT_PAGE_SIZE)
      expect(zeroLimit.items).toHaveLength(DEFAULT_PAGE_SIZE)
      expect(zeroLimit.totalPages).toBe(SECOND_PAGE_COUNT)
      expect(negativeLimit.itemsPerPage).toBe(DEFAULT_PAGE_SIZE)
      expect(negativeLimit.items).toHaveLength(DEFAULT_PAGE_SIZE)
      expect(negativeLimit.totalPages).toBe(SECOND_PAGE_COUNT)
    })

    it('honors custom sort defaults while keeping filter state initialized', () => {
      const result = useCardData([], {
        sort: {
          defaultField: 'name',
          defaultDirection: 'desc',
        },
      })

      expect(result.sorting.sortBy).toBe('name')
      expect(result.sorting.sortDirection).toBe('desc')
      expect(result.filters.search).toBe('')
      expect(result.filters.availableClusters).toStrictEqual([])
      expect(result.filters.clusterFilterRef).toEqual({ current: null })
    })
  })
})
