/**
 * Coverage for the remaining uncovered branches in
 * `web/src/components/cards/openkruise_status/index.tsx` that neither
 * `OpenKruiseStatus.test.tsx` (happy path) nor
 * `OpenKruiseStatus.default-branches.test.tsx` (switch defaults) reach:
 *
 *   - line 386-387: `if (showSkeleton) return (<skeleton>)` early return
 *   - line 434:     controls-row cluster-count badge (`localClusterFilter.length > 0`)
 *   - line 497:     `availableClusters.length === 0` -> "no clusters" placeholder
 *   - line 505:     scope badge `localClusterFilter.length === 1` -> ClusterBadge
 *   - line 507:     scope badge `localClusterFilter.length > 1` -> "n clusters" text
 *   - line 368:     `formatTime` `<1m` arm (timestamp within one minute of now)
 *
 * All arms are reachable by adjusting the mocked returns of
 * `useCardLoadingState`, `useCardData`, and (for formatTime) supplying
 * a fresh timestamp on the sole card-data item.
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

function makeCardDataResult(
  items: AnyItem[],
  overrides: {
    availableClusters?: string[]
    localClusterFilter?: string[]
  } = {},
) {
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
      localClusterFilter: overrides.localClusterFilter ?? [],
      toggleClusterFilter: vi.fn(),
      clearClusterFilter: vi.fn(),
      availableClusters:
        overrides.availableClusters ?? [...new Set(items.map((item) => String(item.cluster)))],
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

describe('OpenKruiseStatus — skeleton / cluster-filter / formatTime branches', () => {
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
    // Default: not skeleton, not empty state.
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: false,
      showEmptyState: false,
    })
    mockUseCardData.mockReturnValue(makeCardDataResult([goodItem()]))
  })

  it('renders the skeleton block when showSkeleton is true (line 386-387)', () => {
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: true,
      showEmptyState: false,
    })

    render(<OpenKruiseStatus />)

    // Skeleton mock renders `<div data-testid="openkruise-skeleton">`; the
    // early-return block renders many of them. Getting at least one proves
    // the `if (showSkeleton)` true arm fired instead of the main render.
    expect(screen.getAllByTestId('openkruise-skeleton').length).toBeGreaterThan(0)
    // Main-render sentinels must be absent.
    expect(screen.queryByText('frontend-web')).toBeNull()
    expect(screen.queryByTestId('openkruise-pagination')).toBeNull()
  })

  it('renders the "no clusters" placeholder when availableClusters is empty (line 497)', () => {
    mockUseCardData.mockReturnValue(
      makeCardDataResult([goodItem()], { availableClusters: [] }),
    )

    render(<OpenKruiseStatus />)

    // The `availableClusters.length === 0 ? (...) : (...)` ternary picks the
    // left branch; the placeholder key is echoed by our t() mock.
    expect(screen.getByText('openkruiseStatus.noClusters')).toBeTruthy()
    // Scope badge / search / summary belong to the else branch and must not render.
    expect(screen.queryByTestId('openkruise-cluster-badge')).toBeNull()
    expect(screen.queryByTestId('openkruise-search')).toBeNull()
  })

  it('renders a ClusterBadge when localClusterFilter is exactly one (line 505 + line 434 badge)', () => {
    mockUseCardData.mockReturnValue(
      makeCardDataResult([goodItem()], {
        availableClusters: ['gke-staging', 'aks-dev-eu'],
        localClusterFilter: ['gke-staging'],
      }),
    )

    render(<OpenKruiseStatus />)

    // Line 505 arm: exactly one cluster -> a scope ClusterBadge is mounted
    // in addition to the per-row ClusterBadge on the item row (2 badges total).
    const badges = screen.getAllByTestId('openkruise-cluster-badge')
    expect(badges.length).toBe(2)
    expect(badges.every((b) => b.textContent === 'gke-staging')).toBe(true)
    // Line 434 arm: the small "n/total" cluster-count chip in the controls row
    // fires whenever localClusterFilter.length > 0 (here: "1/2").
    expect(screen.getByText('1/2')).toBeTruthy()
  })

  it('renders the "n clusters" scope text when localClusterFilter has more than one (line 507)', () => {
    mockUseCardData.mockReturnValue(
      makeCardDataResult([goodItem()], {
        availableClusters: ['gke-staging', 'aks-dev-eu', 'eks-prod-us-east-1'],
        localClusterFilter: ['gke-staging', 'aks-dev-eu'],
      }),
    )

    render(<OpenKruiseStatus />)

    // Line 507 arm: > 1 selected -> the t('common:common.nClusters', {count})
    // path is taken. Our mocked t() returns "<count> clusters".
    expect(screen.getByText('2 clusters')).toBeTruthy()
    // Scope ClusterBadge (line 505 arm) must NOT be rendered — the only
    // badge present should be the per-row one for the single item.
    const badges = screen.getAllByTestId('openkruise-cluster-badge')
    expect(badges.length).toBe(1)
    expect(badges[0].textContent).toBe('gke-staging')
    // Line 434 controls-row count chip: "2/3".
    expect(screen.getByText('2/3')).toBeTruthy()
  })

  it('shows the "<1m ago" formatTime arm for a timestamp within the last minute (line 368)', () => {
    // `formatTime` runs against `item.timestamp`. To hit the `<1m` arm we
    // hand it a timestamp 10 seconds before now.
    const tenSecondsAgo = new Date(Date.now() - 10_000).toISOString()
    mockUseCardData.mockReturnValue(
      makeCardDataResult([goodItem({ timestamp: tenSecondsAgo })]),
    )

    render(<OpenKruiseStatus />)

    // The mocked t() returns the raw i18n key for keys without a count, so
    // the rendered text is `<1m openkruiseStatus.ago`.
    expect(screen.getByText('<1m openkruiseStatus.ago')).toBeTruthy()
  })
})
