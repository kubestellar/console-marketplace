import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { KUBEFLOW_DEMO_DATA } from './demoData'
import type { CardDataOptions } from '../../../test/cardTestHelpers'
import { mockCardComponents, mockClusterBadgeModule, mockSkeletonModule } from '../../../test/cardTestHelpers'

interface DisplayItem extends Record<string, unknown> {
  cluster: string
}

const mockUseClusters = vi.fn()
const mockUseDemoMode = vi.fn()
const mockUseGlobalFilters = vi.fn()
const mockUseCardLoadingState = vi.fn()
const mockUseCardData = vi.fn()
const mockUseKubeflowStatus = vi.fn()

vi.mock('../../../hooks/useMCP', () => ({
  useClusters: () => mockUseClusters(),
}))

vi.mock('../ui/Skeleton', () => mockSkeletonModule('kubeflow-skeleton'))

vi.mock('../ui/ClusterBadge', () => mockClusterBadgeModule())

vi.mock('../../../lib/cards/CardComponents', () => ({
  ...mockCardComponents('kubeflow'),
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
            data-testid="kubeflow-sort"
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
            data-testid="kubeflow-sort-direction"
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
  CardAIActions: () => <div data-testid="kubeflow-ai-actions" />,
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

vi.mock('./useKubeflowStatus', () => ({
  useKubeflowStatus: () => mockUseKubeflowStatus(),
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

describe('KubeflowStatus', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseClusters.mockReturnValue({ isLoading: false })
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
    mockUseGlobalFilters.mockReturnValue({ selectedClusters: [] })
    mockUseKubeflowStatus.mockReturnValue({
      data: KUBEFLOW_DEMO_DATA,
      isLoading: false,
      isRefreshing: false,
      isFailed: false,
      isDemoFallback: false,
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

  it('renders demo-backed items and reports demo loading state', () => {
    render(<KubeflowStatus />)

    expect(mockUseCardLoadingState).toHaveBeenCalled()
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

  it('filters visible resources when the category selector changes', () => {
    render(<KubeflowStatus />)

    fireEvent.change(screen.getByTitle('kubeflowStatus.filterByResource'), {
      target: { value: 'notebook' },
    })

    expect(screen.getByText('fraud-research-notebook')).toBeTruthy()
    expect(screen.queryByText('train-fraud-detector-v3')).toBeNull()
  })

  it('searches demo rows through the shared card hook', () => {
    mockUseCardData.mockImplementation((items: DisplayItem[]) =>
      useInteractiveCardData(items, {
        filter: {
          searchFields: ['name', 'namespace', 'primaryDetail', 'secondaryDetail'],
        },
        sort: {
          defaultField: 'status',
          defaultDirection: 'asc',
          comparators: {
            status: (a: DisplayItem, b: DisplayItem) => 0,
            name: (a: DisplayItem, b: DisplayItem) => String(a.name ?? '').localeCompare(String(b.name ?? '')),
          },
        },
      }),
    )

    render(<KubeflowStatus />)

    fireEvent.change(screen.getByTestId('kubeflow-search'), {
      target: { value: 'research' },
    })

    expect(screen.getByText('fraud-research-notebook')).toBeTruthy()
    expect(screen.queryByText('train-fraud-detector-v3')).toBeNull()
  })

  it('wires sorting and pagination actions through the shared card controls', () => {
    const setSortBy = vi.fn()
    const goToPage = vi.fn()
    const cardDataResult = createCardDataResult([
      {
        cluster: 'gke-staging',
        id: 'pipeline-1',
        name: 'pipeline-alpha',
        namespace: 'ml',
        category: 'pipeline',
        status: 'running',
        primaryDetail: 'pipeline-alpha',
        secondaryDetail: 'experiment-alpha',
        timestamp: '2026-05-31T00:00:00.000Z',
      },
    ])

    mockUseCardData.mockReturnValue({
      ...cardDataResult,
      totalPages: 23,
      needsPagination: true,
      goToPage,
      sorting: {
        ...cardDataResult.sorting,
        setSortBy,
      },
    })

    render(<KubeflowStatus />)

    fireEvent.change(screen.getByTestId('kubeflow-sort'), {
      target: { value: 'name' },
    })
    expect(setSortBy).toHaveBeenCalledWith('name')

    fireEvent.click(screen.getByTestId('kubeflow-next-page'))
    expect(goToPage).toHaveBeenCalledWith(2)
  })

  it('renders the skeleton state when the loading helper requests it', () => {
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: true,
      showEmptyState: false,
    })

    render(<KubeflowStatus />)

    expect(screen.getAllByTestId('kubeflow-skeleton').length).toBeGreaterThan(0)
  })

  it('renders the empty state when the loading helper requests it', () => {
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: false,
      showEmptyState: true,
    })

    render(<KubeflowStatus />)

    expect(screen.getByText('kubeflowStatus.noResources')).toBeTruthy()
  })

  it('renders training-job rows with the training icon and label', () => {
    render(<KubeflowStatus />)

    fireEvent.change(screen.getByTitle('kubeflowStatus.filterByResource'), {
      target: { value: 'training' },
    })

    expect(screen.getByText('fraud-detector-distributed')).toBeTruthy()
    expect(screen.getAllByText('kubeflowStatus.trainingJob').length).toBeGreaterThan(0)
    expect(screen.queryByText('fraud-research-notebook')).toBeNull()
  })
})
