/**
 * Extra coverage for the remaining uncovered arms of `formatTime` in
 * `web/src/components/cards/openkruise_status/index.tsx` (around line 366-372):
 *
 *   if (diff < MS_PER_MINUTE) return `<1m ${ago}`
 *   if (diff < MS_PER_HOUR)   return `Xm ${ago}`   // <-- untested arm
 *   if (diff < MS_PER_DAY)    return `Xh ${ago}`   // <-- untested arm
 *   return `Xd ${ago}`                             // <-- untested arm
 *
 * The sibling `OpenKruiseStatus.skeleton-and-cluster-filter-branches.test.tsx`
 * suite locks only the `<1m` arm. The minute, hour, and day arms are silent
 * dead code as far as the current test set is concerned — a common refactor
 * bug (e.g. swapping MS_PER_HOUR for MS_PER_MINUTE, or dropping a
 * Math.max(1, ...) that the minute-arm uses but the hour/day arms do not)
 * would go unnoticed. Locking each arm with a distinct timestamp offset
 * prevents that.
 *
 * The Math.max(1, floor(diff / MS_PER_MINUTE)) guard on the minute arm is
 * also exercised: at exactly `MS_PER_MINUTE + 1ms` above the boundary, the
 * raw floor would be 1 (not 0), so the guard is not the *reason* the value
 * comes back as "1m". A second sub-boundary case (`MS_PER_MINUTE * 1.5`)
 * confirms rounding-down behavior.
 *
 * Structure mirrors OpenKruiseStatus.skeleton-and-cluster-filter-branches.test.tsx
 * exactly (same mocks, same helpers) so the two suites can be maintained
 * together.
 */

import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { OPENKRUISE_DEMO_DATA } from './demoData'

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

vi.mock('../../ui/Skeleton', () => ({
  Skeleton: () => <div data-testid="openkruise-skeleton" />,
}))

vi.mock('../../ui/Select', () => ({
  Select: ({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <select {...props}>{children}</select>
  ),
}))

vi.mock('../../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => (
    <span data-testid="openkruise-cluster-badge">{cluster}</span>
  ),
}))

vi.mock('../../../lib/cards/CardComponents', () => ({
  CardSearchInput: ({ value, placeholder }: { value: string; placeholder: string }) => (
    <input data-testid="openkruise-search" value={value} placeholder={placeholder} readOnly />
  ),
  CardControlsRow: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CardPaginationFooter: () => <div data-testid="openkruise-pagination" />,
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
    t: (key: string, vars?: { count?: number }) =>
      vars?.count !== undefined ? `${vars.count} clusters` : key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

import { OpenKruiseStatus } from './index'

const MS_PER_MINUTE = 60_000
const MS_PER_HOUR = 60 * MS_PER_MINUTE
const MS_PER_DAY = 24 * MS_PER_HOUR

function makeCardDataResult(items: AnyItem[]) {
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
      availableClusters: [...new Set(items.map((item) => String(item.cluster)))],
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

function goodItem(overrides: Partial<AnyItem> = {}): AnyItem {
  return {
    cluster: 'gke-staging',
    id: 'ok-1',
    name: 'frontend-web',
    namespace: 'apps',
    category: 'cloneset',
    status: 'healthy',
    primaryDetail: 'primary',
    secondaryDetail: 'secondary',
    timestamp: '2026-05-31T00:00:00.000Z',
    ...overrides,
  }
}

describe('OpenKruiseStatus — formatTime minute/hour/day arms', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseClusters.mockReturnValue({ isLoading: false })
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
    mockUseGlobalFilters.mockReturnValue({ selectedClusters: [] })
    mockUseOpenKruiseStatus.mockReturnValue({
      data: OPENKRUISE_DEMO_DATA,
      isLoading: false,
      isRefreshing: false,
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
    mockUseCardData.mockReturnValue(makeCardDataResult([goodItem()]))
  })

  it('renders the "Xm ago" minute arm for a timestamp 5 minutes old', () => {
    // 5 minutes ago -> falls into `diff < MS_PER_HOUR` arm; floor(5min/1min)=5.
    const fiveMinutesAgo = new Date(Date.now() - 5 * MS_PER_MINUTE).toISOString()
    mockUseCardData.mockReturnValue(
      makeCardDataResult([goodItem({ timestamp: fiveMinutesAgo })]),
    )

    render(<OpenKruiseStatus />)

    expect(screen.getByText('5m openkruiseStatus.ago')).toBeTruthy()
    // The `<1m` arm must NOT fire and the hour arm must NOT fire.
    expect(screen.queryByText('<1m openkruiseStatus.ago')).toBeNull()
    expect(screen.queryByText(/h openkruiseStatus.ago$/)).toBeNull()
  })

  it('renders the "Xh ago" hour arm for a timestamp 3 hours old', () => {
    // 3h -> `diff < MS_PER_DAY` arm; floor(3h/1h)=3.
    const threeHoursAgo = new Date(Date.now() - 3 * MS_PER_HOUR).toISOString()
    mockUseCardData.mockReturnValue(
      makeCardDataResult([goodItem({ timestamp: threeHoursAgo })]),
    )

    render(<OpenKruiseStatus />)

    expect(screen.getByText('3h openkruiseStatus.ago')).toBeTruthy()
    expect(screen.queryByText(/<1m openkruiseStatus.ago/)).toBeNull()
    expect(screen.queryByText(/m openkruiseStatus.ago$/)).toBeNull()
    expect(screen.queryByText(/d openkruiseStatus.ago$/)).toBeNull()
  })

  it('renders the "Xd ago" day arm for a timestamp 4 days old (final return)', () => {
    // 4d -> the final `return` arm (past all if guards); floor(4d/1d)=4.
    const fourDaysAgo = new Date(Date.now() - 4 * MS_PER_DAY).toISOString()
    mockUseCardData.mockReturnValue(
      makeCardDataResult([goodItem({ timestamp: fourDaysAgo })]),
    )

    render(<OpenKruiseStatus />)

    expect(screen.getByText('4d openkruiseStatus.ago')).toBeTruthy()
    expect(screen.queryByText(/h openkruiseStatus.ago$/)).toBeNull()
  })

  it('rounds down inside the minute arm — 90 seconds becomes "1m ago"', () => {
    // 90s -> above 1min so avoids the `<1m` arm; floor(90s/60s)=1.
    // Also validates that the Math.max(1, ...) guard does not spuriously
    // bump the label to "2m" (a common off-by-one refactor risk).
    const ninetySecondsAgo = new Date(Date.now() - 90_000).toISOString()
    mockUseCardData.mockReturnValue(
      makeCardDataResult([goodItem({ timestamp: ninetySecondsAgo })]),
    )

    render(<OpenKruiseStatus />)

    expect(screen.getByText('1m openkruiseStatus.ago')).toBeTruthy()
  })
})
