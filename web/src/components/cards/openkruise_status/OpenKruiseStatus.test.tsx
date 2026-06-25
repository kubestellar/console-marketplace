import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { OPENKRUISE_DEMO_DATA } from './demoData'

interface DisplayItem extends Record<string, unknown> {
  cluster: string
}

interface CardDataOptions<T> {
  filter?: {
    searchFields?: (keyof T)[]
  }
  sort?: {
    defaultField?: string
    defaultDirection?: 'asc' | 'desc'
    comparators?: Record<string, (a: T, b: T) => number>
  }
}

const mockUseClusters = vi.fn()
const mockUseDemoMode = vi.fn()
const mockUseGlobalFilters = vi.fn()
const mockUseCardLoadingState = vi.fn()
const mockUseCardData = vi.fn()
const mockUseOpenKruiseStatus = vi.fn()

vi.mock('../../../hooks/useMCP', () => ({
  useClusters: () => mockUseClusters(),
}))

vi.mock('../../ui/Skeleton', () => ({
  Skeleton: () => <div data-testid="openkruise-skeleton" />,
}))

vi.mock('../../ui/Select', () => ({
  Select: ({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <select {...props}>{children}</select>
  ),
}))

vi.mock('../../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => <span>{cluster}</span>,
}))

vi.mock('../../../lib/cards/CardComponents', () => ({
  CardSearchInput: ({ value, onChange, placeholder }: {
    value: string
    onChange: (value: string) => void
    placeholder: string
    className?: string
  }) => (
    <input
      data-testid="openkruise-search"
      value={value}
      placeholder={placeholder}
      onChange={event => onChange(event.target.value)}
    />
  ),
  CardControlsRow: ({
    children,
    cardControls,
  }: {
    children?: ReactNode
    cardControls?: {
      sortBy: string
      sortDirection: 'asc' | 'desc'
      sortOptions: Array<{ value: string; label: string }>
      onSortChange: (value: string) => void
      onSortDirectionChange: (direction: 'asc' | 'desc') => void
    }
  }) => (
    <div>
      {cardControls && (
        <>
          <select
            data-testid="openkruise-sort"
            value={cardControls.sortBy}
            onChange={event => cardControls.onSortChange(event.target.value)}
          >
            {cardControls.sortOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            data-testid="openkruise-sort-direction"
            onClick={() =>
              cardControls.onSortDirectionChange(
                cardControls.sortDirection === 'asc' ? 'desc' : 'asc',
              )
            }
            type="button"
          >
            toggle sort
          </button>
        </>
      )}
      {children}
    </div>
  ),
  CardPaginationFooter: ({
    currentPage,
    totalPages,
    onPageChange,
    needsPagination,
  }: {
    currentPage?: number
    totalPages?: number
    onPageChange?: (page: number) => void
    needsPagination?: boolean
  }) => (
    <div data-testid="openkruise-pagination">
      <span data-testid="openkruise-page-indicator">
        {currentPage}/{totalPages}
      </span>
      {needsPagination && onPageChange && (
        <button
          data-testid="openkruise-next-page"
          onClick={() => onPageChange(currentPage === totalPages ? 1 : (currentPage ?? 1) + 1)}
          type="button"
        >
          next page
        </button>
      )}
    </div>
  ),
  CardAIActions: () => <div data-testid="openkruise-ai-actions" />,
}))

vi.mock('../../../lib/cards/cardHooks', () => ({
  useCardData: (items: unknown) => mockUseCardData(items),
}))

vi.mock('../CardDataContext', () => ({
  useCardLoadingState: () => mockUseCardLoadingState(),
}))

vi.mock('../../../hooks/useDemoMode', () => ({
  useDemoMode: () => mockUseDemoMode(),
}))

vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => mockUseGlobalFilters(),
}))

vi.mock('./useOpenKruiseStatus', () => ({
  useOpenKruiseStatus: () => mockUseOpenKruiseStatus(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: { count?: number }) => vars?.count ?? key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

import { OpenKruiseStatus } from './index'

function createCardDataResult(items: DisplayItem[]) {
  return {
    items,
    totalItems: items.length,
    currentPage: 1,
    totalPages: 1,
    itemsPerPage: 5,
    setItemsPerPage: vi.fn(),
    goToPage: vi.fn(),
    needsPagination: false,
    filters: {
      search: '',
      setSearch: vi.fn(),
      localClusterFilter: [],
      toggleClusterFilter: vi.fn(),
      clearClusterFilter: vi.fn(),
      availableClusters: ['eks-prod-us-east-1', 'gke-staging', 'aks-dev-eu'],
      showClusterFilter: false,
      setShowClusterFilter: vi.fn(),
      clusterFilterRef: { current: null },
    },
    sorting: {
      sortBy: 'status',
      setSortBy: vi.fn(),
      sortDirection: 'asc',
      setSortDirection: vi.fn(),
    },
    containerRef: { current: null },
    containerStyle: {},
  }
}

function useInteractiveCardData<T extends DisplayItem>(
  items: T[],
  options: CardDataOptions<T> = {},
) {
  const stableOptionsRef = useRef(options)
  const searchFields = stableOptionsRef.current.filter?.searchFields ?? []
  const comparators = stableOptionsRef.current.sort?.comparators
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState(stableOptionsRef.current.sort?.defaultField ?? 'status')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(
    stableOptionsRef.current.sort?.defaultDirection ?? 'asc',
  )
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 1

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase()
    const searched = !query
      ? items
      : items.filter(item =>
          searchFields.some(field =>
            String(item[field] ?? '').toLowerCase().includes(query),
          ),
        )

    const comparator = comparators?.[sortBy]
    if (!comparator) return searched

    return [...searched].sort((a, b) =>
      sortDirection === 'desc' ? comparator(b, a) : comparator(a, b),
    )
  }, [comparators, items, search, searchFields, sortBy, sortDirection])

  useEffect(() => {
    setCurrentPage(1)
  }, [items, search, sortBy, sortDirection])

  const totalPages = Math.max(1, Math.ceil(visibleItems.length / itemsPerPage))
  const safePage = Math.min(currentPage, totalPages)
  const pageItems = visibleItems.slice(
    (safePage - 1) * itemsPerPage,
    safePage * itemsPerPage,
  )

  return {
    items: pageItems,
    totalItems: visibleItems.length,
    currentPage: safePage,
    totalPages,
    itemsPerPage,
    setItemsPerPage: vi.fn(),
    goToPage: (page: number) => setCurrentPage(Math.min(Math.max(page, 1), totalPages)),
    needsPagination: visibleItems.length > itemsPerPage,
    filters: {
      search,
      setSearch,
      localClusterFilter: [],
      toggleClusterFilter: vi.fn(),
      clearClusterFilter: vi.fn(),
      availableClusters: [...new Set(items.map(item => item.cluster))],
      showClusterFilter: false,
      setShowClusterFilter: vi.fn(),
      clusterFilterRef: { current: null },
    },
    sorting: {
      sortBy,
      setSortBy,
      sortDirection,
      setSortDirection,
    },
    containerRef: { current: null },
    containerStyle: {},
  }
}

describe('OpenKruiseStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseClusters.mockReturnValue({ isLoading: false })
    mockUseDemoMode.mockReturnValue({ isDemoMode: false })
    mockUseGlobalFilters.mockReturnValue({ selectedClusters: [] })
    mockUseOpenKruiseStatus.mockReturnValue({
      data: OPENKRUISE_DEMO_DATA,
      isLoading: false,
      isRefreshing: true,
      isFailed: false,
      isDemoFallback: true,
      consecutiveFailures: 0,
      lastRefresh: 1_725_000_000_000,
      refetch: vi.fn(),
    })
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: false,
      showEmptyState: false,
    })
    mockUseCardData.mockImplementation((items: DisplayItem[]) => createCardDataResult(items))
  })

  it('renders hook-backed items and forwards demo fallback state', () => {
    render(<OpenKruiseStatus />)

    expect(mockUseCardLoadingState).toHaveBeenCalledWith(expect.objectContaining({
      isDemoData: true,
      isRefreshing: true,
      hasAnyData: true,
      lastRefresh: 1_725_000_000_000,
    }))
    expect(screen.getByText('frontend-web')).toBeTruthy()
    expect(screen.getByTestId('openkruise-pagination')).toBeTruthy()
  })

  it('filters resources by the selected global clusters before pagination', () => {
    mockUseGlobalFilters.mockReturnValue({ selectedClusters: ['gke-staging'] })

    render(<OpenKruiseStatus />)

    const filteredItems = mockUseCardData.mock.calls[0]?.[0] as DisplayItem[]
    expect(filteredItems.length).toBeGreaterThan(0)
    expect(filteredItems.every(item => item.cluster === 'gke-staging')).toBe(true)
  })

  it('filters visible resources when the category selector changes', () => {
    render(<OpenKruiseStatus />)

    fireEvent.change(screen.getByLabelText('openkruiseStatus.filterByResource'), {
      target: { value: 'sidecarset' },
    })

    expect(screen.getByText('log-collector-sidecar')).toBeTruthy()
    expect(screen.queryByText('frontend-web')).toBeNull()
  })

  it('searches OpenKruise resources through the shared card hook', () => {
    mockUseCardData.mockImplementation((items: DisplayItem[], options: CardDataOptions<DisplayItem>) =>
      useInteractiveCardData(items, options),
    )

    render(<OpenKruiseStatus />)

    fireEvent.change(screen.getByTestId('openkruise-search'), {
      target: { value: 'redis' },
    })

    expect(screen.getByText('redis-cluster')).toBeTruthy()
    expect(screen.queryByText('frontend-web')).toBeNull()
  })

  it('wires sorting, sort direction, and pagination actions through the card controls', () => {
    const setSortBy = vi.fn()
    const setSortDirection = vi.fn()
    const goToPage = vi.fn()
    const cardDataResult = createCardDataResult([
      {
        cluster: 'gke-staging',
        id: 'clone-set-1',
        name: 'frontend-web',
        namespace: 'apps',
        category: 'cloneset',
        status: 'healthy',
        primaryDetail: 'apps',
        secondaryDetail: '10',
        timestamp: '2026-05-31T00:00:00.000Z',
      },
    ])

    mockUseCardData.mockReturnValue({
      ...cardDataResult,
      totalPages: 22,
      needsPagination: true,
      goToPage,
      sorting: {
        ...cardDataResult.sorting,
        setSortBy,
        setSortDirection,
      },
    })

    render(<OpenKruiseStatus />)

    fireEvent.change(screen.getByTestId('openkruise-sort'), {
      target: { value: 'name' },
    })
    expect(setSortBy).toHaveBeenCalledWith('name')

    fireEvent.click(screen.getByTestId('openkruise-next-page'))
    expect(goToPage).toHaveBeenCalledWith(2)

    fireEvent.click(screen.getByTestId('openkruise-sort-direction'))
    expect(setSortDirection).toHaveBeenCalledWith('desc')
  })

  it('renders the empty state when the loading helper reports no resources', () => {
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: false,
      showEmptyState: true,
    })

    render(<OpenKruiseStatus />)

    expect(screen.getByText('openkruiseStatus.noResources')).toBeTruthy()
  })
})
