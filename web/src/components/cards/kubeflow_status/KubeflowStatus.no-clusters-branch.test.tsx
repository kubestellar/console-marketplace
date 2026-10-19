/**
 * Coverage for the `availableClusters.length === 0 ? ... : ...` ternary on
 * line ~201 of `src/components/cards/kubeflow_status/index.tsx`.
 *
 * Every existing KubeflowStatus test derives `availableClusters` from a
 * non-empty item list (`[...new Set(items.map(item => item.cluster))]`), so
 * the "no clusters" empty-results arm never runs. Rendering with zero items
 * drives `availableClusters` to `[]` and exercises the true branch, which
 * shows the `kubeflowStatus.noClusters` message instead of the resource
 * list.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { mockCardComponents, mockClusterBadgeModule, mockSkeletonModule } from '../../../test/cardTestHelpers'
import { KUBEFLOW_DEMO_DATA } from './demoData'

const mockUseDemoMode = vi.fn()
const mockUseGlobalFilters = vi.fn()
const mockUseCardLoadingState = vi.fn()
const mockUseCardData = vi.fn()
const mockUseKubeflowStatus = vi.fn()

vi.mock('../ui/Skeleton', () => mockSkeletonModule('kubeflow-skeleton'))

vi.mock('../../ui/ClusterBadge', () => mockClusterBadgeModule())

vi.mock('../../../lib/cards/CardComponents', () => ({
  ...mockCardComponents('kubeflow'),
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

function makeEmptyCardDataResult() {
  return {
    items: [],
    totalItems: 0,
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
      availableClusters: [],
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

describe('KubeflowStatus — no-clusters branch', () => {
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
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: false,
      showEmptyState: false,
    })
    mockUseCardData.mockReturnValue(makeEmptyCardDataResult())
  })

  it('shows the noClusters message instead of the resource list when availableClusters is empty', () => {
    render(<KubeflowStatus />)

    expect(screen.getByText('kubeflowStatus.noClusters')).toBeTruthy()
  })
})
