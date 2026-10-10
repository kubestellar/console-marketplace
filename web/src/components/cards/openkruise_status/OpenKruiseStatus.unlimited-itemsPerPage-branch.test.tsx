/**
 * OpenKruiseStatus.unlimited-itemsPerPage-branch.test.tsx
 *
 * Targets the previously-uncovered `itemsPerPage !== 'unlimited'` arm (and
 * the `typeof itemsPerPage === 'number' ? itemsPerPage : 10` ternary) that
 * guard `CardPaginationFooter` on line ~308 of
 * `src/components/cards/openkruise_status/index.tsx`.
 *
 * Every existing suite only ever sets `itemsPerPage` to a number, so the
 * `'unlimited'` arm of both expressions was never reached. When
 * `useCardData` reports `itemsPerPage: 'unlimited'`, the card must suppress
 * pagination regardless of what the hook's own `needsPagination` flag says —
 * this test sets `needsPagination: true` from the hook to prove the card's
 * own guard (not just the hook) is what hides the "next page" control.
 */
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { mockCardComponents, mockClusterBadgeModule, mockSkeletonModule } from '../../../test/cardTestHelpers'

interface AnyItem extends Record<string, unknown> {
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

vi.mock('../ui/Skeleton', () => mockSkeletonModule('openkruise-skeleton'))

vi.mock('../../ui/Select', () => ({
  Select: ({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <select {...props}>{children}</select>
  ),
}))

vi.mock('../../ui/ClusterBadge', () => mockClusterBadgeModule())

vi.mock('../../../lib/cards/CardComponents', () => ({
  ...mockCardComponents('openkruise'),
  CardControlsRow: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
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

function makeCardDataResult(items: AnyItem[]) {
  return {
    items,
    totalItems: items.length,
    currentPage: 1,
    totalPages: 1,
    itemsPerPage: 'unlimited' as const,
    setItemsPerPage: vi.fn(),
    goToPage: vi.fn(),
    // The hook itself thinks pagination is needed; the card must still
    // suppress it because itemsPerPage is 'unlimited'.
    needsPagination: true,
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

describe('OpenKruiseStatus unlimited itemsPerPage branch', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseClusters.mockReturnValue({ isLoading: false })
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
    mockUseGlobalFilters.mockReturnValue({ selectedClusters: [] })
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: false,
      showEmptyState: false,
    })
    mockUseOpenKruiseStatus.mockReturnValue({
      data: {
        cloneSets: [],
        advancedStatefulSets: [],
        advancedDaemonSets: [],
        sidecarSets: [],
        broadcastJobs: [],
        advancedCronJobs: [],
        controllerVersion: 'v1.6.0',
        totalInjectedPods: 0,
        lastCheckTime: new Date().toISOString(),
      },
      isLoading: false,
      isRefreshing: false,
      isFailed: false,
      isDemoFallback: true,
      consecutiveFailures: 0,
      lastRefresh: 1_725_000_000_000,
      refetch: vi.fn(),
    })
  })

  it('suppresses pagination when itemsPerPage is "unlimited" even if needsPagination is true', () => {
    const item: AnyItem = {
      cluster: 'gke-staging',
      id: 'cs-1',
      name: 'workload-unlimited',
      namespace: 'apps',
      category: 'cloneset',
      status: 'running',
      primaryDetail: 'detail-a',
      secondaryDetail: 'detail-b',
      timestamp: '2026-05-31T00:00:00.000Z',
    }

    mockUseCardData.mockReturnValue(makeCardDataResult([item]))

    render(<OpenKruiseStatus />)

    expect(screen.getByTestId('openkruise-pagination')).toBeInTheDocument()
    expect(screen.queryByTestId('openkruise-next-page')).not.toBeInTheDocument()
  })
})
