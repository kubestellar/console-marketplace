/**
 * CoreDNSStatus.unlimited-itemsPerPage-branch.test.tsx
 *
 * Targets the previously-uncovered `itemsPerPage !== 'unlimited'` arm (and
 * the `typeof itemsPerPage === 'number' ? itemsPerPage : 10` ternary) that
 * guard `CardPaginationFooter` on line ~143 of
 * `src/components/cards/coredns_status/index.tsx`.
 *
 * Every existing suite only ever sets `itemsPerPage` to a number, so the
 * `'unlimited'` arm of both expressions was never reached. When
 * `useCardData` reports `itemsPerPage: 'unlimited'`, the card must suppress
 * pagination regardless of what the hook's own `needsPagination` flag says —
 * this test sets `needsPagination: true` from the hook to prove the card's
 * own guard (not just the hook) is what hides the "next page" control.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { COREDNS_DEMO_DATA } from './demoData'
import { mockCardComponents, mockClusterBadgeModule, mockSkeletonModule } from '../../../test/cardTestHelpers'

interface CoreDNSServer extends Record<string, unknown> {
  cluster: string
}

const mockUseDemoMode = vi.fn()
const mockUseGlobalFilters = vi.fn()
const mockUseCardLoadingState = vi.fn()
const mockUseCardData = vi.fn()

vi.mock('../ui/Skeleton', () => mockSkeletonModule('coredns-skeleton'))

vi.mock('../../ui/ClusterBadge', () => mockClusterBadgeModule())

vi.mock('../../../lib/cards/CardComponents', () => mockCardComponents('coredns'))

vi.mock('../../../lib/cards/cardHooks', () => ({
  useCardData: (items: unknown) => mockUseCardData(items),
}))

vi.mock('../CardDataContext', () => ({
  useCardLoadingState: () => mockUseCardLoadingState(),
}))

vi.mock('./useCoreDNSStatus', () => ({
  useCoreDNSStatus: () => ({
    data: COREDNS_DEMO_DATA,
    isLoading: false,
    isRefreshing: false,
    isFailed: false,
    isDemoFallback: true,
  }),
}))

vi.mock('../../../hooks/useDemoMode', () => ({
  useDemoMode: () => mockUseDemoMode(),
}))

vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => mockUseGlobalFilters(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

import { CoreDNSStatus } from './index'

function makeCardDataResult(items: CoreDNSServer[]) {
  return {
    items,
    totalItems: items.length,
    currentPage: 1,
    totalPages: 1,
    itemsPerPage: 'unlimited' as const,
    goToPage: vi.fn(),
    // The hook itself thinks pagination is needed; the card must still
    // suppress it because itemsPerPage is 'unlimited'.
    needsPagination: true,
    setItemsPerPage: vi.fn(),
    filters: {
      search: '',
      setSearch: vi.fn(),
      localClusterFilter: [],
      toggleClusterFilter: vi.fn(),
      clearClusterFilter: vi.fn(),
      availableClusters: [...new Set(items.map(item => item.cluster))],
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

describe('CoreDNSStatus unlimited itemsPerPage branch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
    mockUseGlobalFilters.mockReturnValue({ selectedClusters: [] })
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: false,
      showEmptyState: false,
    })
  })

  it('suppresses pagination when itemsPerPage is "unlimited" even if needsPagination is true', () => {
    const row: CoreDNSServer = {
      id: 'test-cluster/coredns-unlimited',
      cluster: 'test-cluster',
      name: 'coredns-unlimited',
      namespace: 'kube-system',
      version: '1.11.0',
      status: 'running',
      queriesPerSecond: 100,
      cacheHitRate: 0.9,
      upstreamLatencyMs: 5,
      errorRate: 0.01,
      uptime: '1d',
    }

    mockUseCardData.mockReturnValue(makeCardDataResult([row]))

    render(<CoreDNSStatus />)

    expect(screen.getByTestId('coredns-pagination')).toBeInTheDocument()
    expect(screen.queryByTestId('coredns-next-page')).not.toBeInTheDocument()
  })
})
