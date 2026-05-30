import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

interface DisplayItem {
  cluster: string
}

const mockUseClusters = vi.fn()
const mockUseDemoMode = vi.fn()
const mockUseGlobalFilters = vi.fn()
const mockUseCardLoadingState = vi.fn()
const mockUseCardData = vi.fn()

vi.mock('../../hooks/useMCP', () => ({
  useClusters: () => mockUseClusters(),
}))

vi.mock('../ui/Skeleton', () => ({
  Skeleton: () => <div data-testid="kubeflow-skeleton" />,
}))

vi.mock('../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => <span>{cluster}</span>,
}))

vi.mock('../../lib/cards/CardComponents', () => ({
  CardSearchInput: ({ value, onChange, placeholder }: {
    value: string
    onChange: (value: string) => void
    placeholder: string
    className?: string
  }) => (
    <input
      data-testid="kubeflow-search"
      value={value}
      placeholder={placeholder}
      onChange={event => onChange(event.target.value)}
    />
  ),
  CardControlsRow: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CardPaginationFooter: () => <div data-testid="kubeflow-pagination" />,
  CardAIActions: () => <div data-testid="kubeflow-ai-actions" />,
}))

vi.mock('../../lib/cards/cardHooks', () => ({
  useCardData: (items: unknown, options: unknown) => mockUseCardData(items, options),
}))

vi.mock('./CardDataContext', () => ({
  useCardLoadingState: (options: unknown) => mockUseCardLoadingState(options),
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

import { KubeflowStatus } from './index'

function createCardDataResult(items: DisplayItem[]) {
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

describe('KubeflowStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseClusters.mockReturnValue({ isLoading: false })
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
    mockUseGlobalFilters.mockReturnValue({ selectedClusters: [] })
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: false,
      showEmptyState: false,
    })
    mockUseCardData.mockImplementation((items: DisplayItem[]) => createCardDataResult(items))
  })

  it('renders demo-backed items and reports demo loading state', () => {
    render(<KubeflowStatus />)

    expect(mockUseCardLoadingState).toHaveBeenCalledWith(expect.objectContaining({
      isDemoData: true,
      hasAnyData: true,
    }))
    expect(screen.getByText('train-fraud-detector-v3')).toBeTruthy()
    expect(screen.getByTestId('kubeflow-pagination')).toBeTruthy()
  })

  it('filters items by the global cluster selection before pagination', () => {
    mockUseGlobalFilters.mockReturnValue({ selectedClusters: ['gke-staging'] })

    render(<KubeflowStatus />)

    const filteredItems = mockUseCardData.mock.calls[0]?.[0] as DisplayItem[]
    expect(filteredItems.length).toBeGreaterThan(0)
    expect(filteredItems.every(item => item.cluster === 'gke-staging')).toBe(true)
  })

  it('renders the skeleton state when the loading helper requests it', () => {
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: true,
      showEmptyState: false,
    })

    render(<KubeflowStatus />)

    expect(screen.getByTestId('kubeflow-skeleton')).toBeTruthy()
  })
})
