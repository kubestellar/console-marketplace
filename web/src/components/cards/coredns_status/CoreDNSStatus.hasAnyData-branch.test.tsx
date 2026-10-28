/**
 * CoreDNSStatus.hasAnyData-branch.test.tsx
 *
 * Targets the previously-uncovered second operand of
 * `raw.servers.length > 0 || raw.zones.length > 0` on line 34 of
 * `src/components/cards/coredns_status/index.tsx`.
 *
 * The existing suite always supplies demo data with both non-empty
 * `servers` and non-empty `zones`, so `hasAnyData` short-circuits on the
 * first operand and the `zones.length > 0` check never runs. Rendering
 * with an empty `servers` array and a non-empty `zones` array forces
 * evaluation of the second operand.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { mockCardComponents, mockClusterBadgeModule, mockSkeletonModule } from '../../../test/cardTestHelpers'

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

vi.mock('../../../lib/cards/cardLoadingState', () => ({
  useCardLoadingState: () => mockUseCardLoadingState(),
}))

vi.mock('./useCoreDNSStatus', () => ({
  useCoreDNSStatus: () => ({
    data: {
      servers: [],
      zones: [
        {
          zone: 'cluster.local',
          queryCount: 100,
          nxdomainCount: 1,
          servfailCount: 0,
          avgLatencyMs: 2,
        },
      ],
      totalQueries: 100,
      overallCacheHitRate: 0.5,
      lastCheckTime: '2026-01-01T00:00:00.000Z',
    },
    isLoading: false,
    isRefreshing: false,
    isFailed: false,
    isDemoFallback: false,
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

describe('CoreDNSStatus hasAnyData branch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDemoMode.mockReturnValue({ isDemoMode: false })
    mockUseGlobalFilters.mockReturnValue({ selectedClusters: [] })
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: false,
      showEmptyState: false,
    })
    mockUseCardData.mockReturnValue(makeEmptyCardDataResult())
  })

  it('still renders the content view when servers is empty but zones has data', () => {
    render(<CoreDNSStatus />)

    // No server rows, but the aggregate metrics section (driven by
    // `rawData`, not `displayRows`) still renders — proving the component
    // took the "has data" path rather than the (mocked-false, but still
    // reachable) empty state, and that `hasAnyData` was evaluated against
    // a raw payload where only `zones` is non-empty.
    expect(screen.getByText('corednsStatus.totalQueries')).toBeTruthy()
  })
})
