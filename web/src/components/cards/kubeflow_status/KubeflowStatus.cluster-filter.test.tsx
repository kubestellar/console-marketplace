/** Renders KubeflowStatus against the real CardControlsRow (not a mock) and asserts the cluster filter and controls appear. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { mockClusterBadgeModule, mockSkeletonModule } from '../../../test/cardTestHelpers'
import { KUBEFLOW_DEMO_DATA } from './demoData'

const mockUseDemoMode = vi.fn()
const mockUseGlobalFilters = vi.fn()
const mockUseCardLoadingState = vi.fn()
const mockUseCardData = vi.fn()
const mockUseKubeflowStatus = vi.fn()

vi.mock('../ui/Skeleton', () => mockSkeletonModule('kubeflow-skeleton'))

vi.mock('../../../lib/ui/ClusterBadge', () => mockClusterBadgeModule())

vi.mock('../../../lib/cards/CardComponents', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../lib/cards/CardComponents')>()),
  CardAIActions: () => <div data-testid="kubeflow-ai-actions" />,
}))

vi.mock('../../../lib/cards/cardHooks', () => ({
  useCardData: (items: unknown) => mockUseCardData(items),
}))

vi.mock('../../../lib/cards/cardLoadingState', () => ({
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

interface AnyItem extends Record<string, unknown> {
  cluster: string
}

function makeCardDataResult(items: AnyItem[]) {
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
      availableClusters: [...new Set(items.map(item => String(item.cluster)))],
      showClusterFilter: false,
      setShowClusterFilter: vi.fn(),
      clusterFilterRef: { current: null },
    },
    sorting: {
      sortBy: 'status',
      setSortBy: vi.fn(),
      sortDirection: 'asc' as const,
      setSortDirection: vi.fn(),
    },
    containerRef: { current: null },
    containerStyle: {},
  }
}

describe('KubeflowStatus — real CardControlsRow', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
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
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false })
  })

  it('renders the cluster filter button and limit/sort controls', () => {
    const item = {
      name: 'wl',
      namespace: 'ml',
      category: 'pipeline',
      status: 'running',
      primaryDetail: 'p',
      secondaryDetail: 's',
      timestamp: '2026-05-31T00:00:00.000Z',
    }
    const result = makeCardDataResult([
      { ...item, cluster: 'gke-a', id: '1' },
      { ...item, cluster: 'gke-b', id: '2' },
    ])
    mockUseCardData.mockReturnValue(result)

    render(<KubeflowStatus />)

    expect(screen.getByTestId('card-cluster-filter-button')).toBeInTheDocument()
    expect(screen.getByTestId('card-limit')).toBeInTheDocument()
    expect(screen.getByTestId('card-sort')).toBeInTheDocument()
  })
})
