import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OPENKRUISE_DEMO_DATA } from './demoData'

interface DisplayItem {
  cluster: string
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
  CardControlsRow: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CardPaginationFooter: () => <div data-testid="openkruise-pagination" />,
  CardAIActions: () => <div data-testid="openkruise-ai-actions" />,
}))

vi.mock('../../../lib/cards/cardHooks', () => ({
  useCardData: (items: unknown, options: unknown) => mockUseCardData(items, options),
}))

vi.mock('../CardDataContext', () => ({
  useCardLoadingState: (options: unknown) => mockUseCardLoadingState(options),
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

  it('renders the empty state when the loading helper reports no resources', () => {
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: false,
      showEmptyState: true,
    })

    render(<OpenKruiseStatus />)

    expect(screen.getByText('openkruiseStatus.noResources')).toBeTruthy()
  })
})
