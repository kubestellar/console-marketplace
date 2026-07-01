import { useEffect, useMemo, useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

interface CoreDNSServer extends Record<string, unknown> {
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

const mockUseDemoMode = vi.fn()
const mockUseGlobalFilters = vi.fn()
const mockUseCardLoadingState = vi.fn()
const mockUseCardData = vi.fn()

vi.mock('../ui/Skeleton', () => ({
  Skeleton: () => <div data-testid="coredns-skeleton" />,
}))

vi.mock('../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => <span>{cluster}</span>,
}))

vi.mock('../../lib/cards/CardComponents', () => ({
  CardSearchInput: ({ value, onChange, placeholder }: {
    value: string
    onChange: (value: string) => void
    placeholder: string
  }) => (
    <input
      data-testid="coredns-search"
      value={value}
      placeholder={placeholder}
      onChange={event => onChange(event.target.value)}
    />
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
    <div data-testid="coredns-pagination">
      <span data-testid="coredns-page-indicator">
        {currentPage}/{totalPages}
      </span>
      {needsPagination && onPageChange && (
        <button
          data-testid="coredns-next-page"
          onClick={() => onPageChange(currentPage === totalPages ? 1 : (currentPage ?? 1) + 1)}
          type="button"
        >
          next page
        </button>
      )}
    </div>
  ),
}))

vi.mock('../../lib/cards/cardHooks', () => ({
  useCardData: (items: unknown) => mockUseCardData(items),
}))

vi.mock('./CardDataContext', () => ({
  useCardLoadingState: () => mockUseCardLoadingState(),
}))

vi.mock('../../hooks/useDemoMode', () => ({
  useDemoMode: () => mockUseDemoMode(),
}))

vi.mock('../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => mockUseGlobalFilters(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

import { CoreDNSStatus } from './index'

function createCardDataResult(items: CoreDNSServer[]) {
  return {
    items,
    totalItems: items.length,
    currentPage: 1,
    totalPages: 1,
    itemsPerPage: 5,
    goToPage: vi.fn(),
    needsPagination: false,
    setItemsPerPage: vi.fn(),
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

function useInteractiveCardData<T extends CoreDNSServer>(
  items: T[],
  options: CardDataOptions<T> = {},
) {
  const searchFields = options.filter?.searchFields ?? []
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState(options.sort?.defaultField ?? 'status')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(
    options.sort?.defaultDirection ?? 'asc',
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

    const comparator = options.sort?.comparators?.[sortBy]
    if (!comparator) return searched

    return [...searched].sort((a, b) =>
      sortDirection === 'desc' ? comparator(b, a) : comparator(a, b),
    )
  }, [items, search, searchFields, sortBy, sortDirection, options.sort?.comparators])

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
    goToPage: (page: number) => setCurrentPage(Math.min(Math.max(page, 1), totalPages)),
    needsPagination: visibleItems.length > itemsPerPage,
    setItemsPerPage: vi.fn(),
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

describe('CoreDNSStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
    mockUseGlobalFilters.mockReturnValue({ selectedClusters: [] })
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: false,
      showEmptyState: false,
    })
    mockUseCardData.mockImplementation((items: CoreDNSServer[]) => createCardDataResult(items))
  })

  it('renders demo data with CoreDNS servers', () => {
    render(<CoreDNSStatus />)

    expect(mockUseCardLoadingState).toHaveBeenCalled()
    expect(screen.getByText('coredns-7d8f9b6c4-xk2p9')).toBeTruthy()
    expect(screen.getByTestId('coredns-pagination')).toBeTruthy()
  })

  it('filters servers by global cluster selection', () => {
    mockUseGlobalFilters.mockReturnValue({ selectedClusters: ['gke-staging'] })

    render(<CoreDNSStatus />)

    const filteredItems = mockUseCardData.mock.calls[0]?.[0] as CoreDNSServer[]
    expect(filteredItems.length).toBeGreaterThan(0)
    expect(filteredItems.every(item => item.cluster === 'gke-staging')).toBe(true)
  })

  it('searches CoreDNS servers through the card hook', () => {
    mockUseCardData.mockImplementation((items: CoreDNSServer[]) =>
      useInteractiveCardData(items, {
        filter: {
          searchFields: ['name', 'namespace', 'version', 'status'],
        },
        sort: {
          defaultField: 'status',
          defaultDirection: 'asc',
          comparators: {
            status: (a: CoreDNSServer, b: CoreDNSServer) => 0,
            name: (a: CoreDNSServer, b: CoreDNSServer) =>
              String(a.name ?? '').localeCompare(String(b.name ?? '')),
          },
        },
      }),
    )

    render(<CoreDNSStatus />)

    fireEvent.change(screen.getByTestId('coredns-search'), {
      target: { value: 'degraded' },
    })

    expect(screen.getByText('coredns-5c9a4e7f1-hr8w3')).toBeTruthy()
    expect(screen.queryByText('coredns-7d8f9b6c4-xk2p9')).toBeNull()
  })

  it('renders the skeleton state when loading', () => {
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: true,
      showEmptyState: false,
    })

    render(<CoreDNSStatus />)

    expect(screen.getAllByTestId('coredns-skeleton').length).toBeGreaterThan(0)
  })

  it('renders empty state when no data available', () => {
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: false,
      showEmptyState: true,
    })

    render(<CoreDNSStatus />)

    expect(screen.getByText('corednsStatus.noServers')).toBeTruthy()
  })

  it('displays aggregated metrics for all servers', () => {
    render(<CoreDNSStatus />)

    expect(screen.getByText('corednsStatus.totalQueries')).toBeTruthy()
    expect(screen.getByText('corednsStatus.overallCacheHitRate')).toBeTruthy()
  })
})
