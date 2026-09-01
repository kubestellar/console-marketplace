/**
 * Coverage for the four exhaustive-switch `default` arms inside
 * `web/src/components/cards/openkruise_status/index.tsx`:
 *
 *   - `getStatusIcon`   (`default: return AlertTriangle`)
 *   - `getStatusColor`  (`default: return 'orange'`)
 *   - `getCategoryIcon` (`default: return Server`)
 *   - `getCategoryLabel`(`default: return category`)
 *
 * The `status` field is a plain string on the wire but the `category`
 * field on `OpenKruiseDisplayItem` is a strict union
 * (`'cloneset' | 'statefulset' | 'daemonset' | 'sidecarset' |
 * 'broadcastjob' | 'cronjob'`), so the category default arm is
 * unreachable through normal usage. Both default arms act as
 * defensive fallbacks: if a future demo-data row or upstream loader
 * hands the card an unrecognised category or a status outside the
 * known set, the row must still render (using the generic Server /
 * AlertTriangle icons and the `orange` color class) instead of
 * crashing on `React.createElement(undefined)` or applying a
 * `bg-undefined/undefined` badge class.
 *
 * We reach those arms by mocking `useCardData` to hand the component
 * a display item whose `status` and `category` are outside their
 * respective known sets, and asserting that the row still renders,
 * that the raw category string is echoed verbatim, and that the
 * status badge picks up the `orange` fallback classes.
 */

import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { OPENKRUISE_DEMO_DATA } from './demoData'

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
    t: (key: string, vars?: { count?: number }) => vars?.count ?? key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

import { OpenKruiseStatus } from './index'

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
    setItemsPerPage: vi.fn(),
    goToPage: vi.fn(),
    needsPagination: false,
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

describe('OpenKruiseStatus — getStatus*/getCategory* default arms', () => {
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
      data: OPENKRUISE_DEMO_DATA,
      isLoading: false,
      isRefreshing: false,
      isFailed: false,
      isDemoFallback: true,
      consecutiveFailures: 0,
      lastRefresh: 1_725_000_000_000,
      refetch: vi.fn(),
    })
  })

  it('falls back to the raw category string as the label when the category is outside the union', () => {
    // Bogus category exercises `default: return category` (getCategoryLabel).
    // Also exercises `default: return Server` (getCategoryIcon), since a
    // row that renders without throwing means React.createElement received
    // a real component, not undefined.
    const rogueItem: AnyItem = {
      cluster: 'gke-staging',
      id: 'rogue-1',
      name: 'rogue-workload',
      namespace: 'apps',
      category: 'quantum-set',
      status: 'healthy',
      primaryDetail: 'rogue-primary',
      secondaryDetail: 'rogue-secondary',
      timestamp: '2026-05-31T00:00:00.000Z',
    }
    mockUseCardData.mockReturnValue(makeCardDataResult([rogueItem]))

    render(<OpenKruiseStatus />)

    // Label default arm returns the raw category string verbatim (used both
    // in the visible text next to the icon and as a `title` attribute).
    expect(screen.getAllByText('quantum-set').length).toBeGreaterThan(0)
    // Row rendered at all — proves getCategoryIcon default (Server) resolved
    // to a real component instead of undefined (which would throw).
    expect(screen.getByText('rogue-workload')).toBeTruthy()
  })

  it('renders the raw category text for a second unknown category value', () => {
    const rogueItem: AnyItem = {
      cluster: 'aks-dev-eu',
      id: 'rogue-2',
      name: 'legacy-workload',
      namespace: 'apps',
      category: 'legacy-set',
      status: 'succeeded',
      primaryDetail: 'legacy-primary',
      secondaryDetail: 'legacy-secondary',
      timestamp: '2026-05-31T00:00:00.000Z',
    }
    mockUseCardData.mockReturnValue(makeCardDataResult([rogueItem]))

    render(<OpenKruiseStatus />)

    expect(screen.getAllByText('legacy-set').length).toBeGreaterThan(0)
    expect(screen.getByText('legacy-workload')).toBeTruthy()
  })

  it('applies the orange fallback badge/icon classes for an unknown status', () => {
    // Bogus status exercises both `default: return AlertTriangle`
    // (getStatusIcon) and `default: return 'orange'` (getStatusColor).
    // The color feeds ICON_COLOR_CLASS and BADGE_COLOR_CLASS lookups; with
    // the 'orange' fallback the badge should carry the orange class strings.
    const rogueItem: AnyItem = {
      cluster: 'eks-prod-us-east-1',
      id: 'rogue-3',
      name: 'weird-status-workload',
      namespace: 'apps',
      category: 'cloneset',
      status: 'quantum-superposition',
      primaryDetail: 'rogue-primary',
      secondaryDetail: 'rogue-secondary',
      timestamp: '2026-05-31T00:00:00.000Z',
    }
    mockUseCardData.mockReturnValue(makeCardDataResult([rogueItem]))

    render(<OpenKruiseStatus />)

    // Status is echoed verbatim in the badge text — proves the row got
    // through the status-icon default branch (would have thrown otherwise)
    // and the color-lookup default branch (badge rendered).
    const badge = screen.getAllByText('quantum-superposition')[0]
    expect(badge).toBeTruthy()
    // BADGE_COLOR_CLASS['orange'] === 'bg-orange-500/20 text-orange-400'
    expect(badge.className).toContain('bg-orange-500/20')
    expect(badge.className).toContain('text-orange-400')
  })

  it('does not classify an unknown status as failure-like (no red row highlight)', () => {
    // `isFailedLike` is a separate check limited to failed/error/degraded —
    // an unknown status must NOT trigger the red row background or
    // the CardAIActions branch. This anchors the "unknown ≠ failed" contract
    // alongside the color/icon default fallbacks.
    const rogueItem: AnyItem = {
      cluster: 'eks-prod-us-east-1',
      id: 'rogue-4',
      name: 'not-failed-workload',
      namespace: 'apps',
      category: 'cloneset',
      status: 'quantum-superposition',
      primaryDetail: 'rogue-primary',
      secondaryDetail: 'rogue-secondary',
      timestamp: '2026-05-31T00:00:00.000Z',
    }
    mockUseCardData.mockReturnValue(makeCardDataResult([rogueItem]))

    render(<OpenKruiseStatus />)

    // CardAIActions is only rendered when isFailedLike is true.
    expect(screen.queryByTestId('openkruise-ai-actions')).toBeNull()
  })
})
