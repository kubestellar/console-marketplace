/**
 * CoreDNSStatus.default-branches.test.tsx
 *
 * Targets the previously-uncovered `STATUS_COLORS[row.status] ?? 'text-muted-foreground'`
 * fallback arm on line 129 of `src/components/cards/coredns_status/index.tsx`.
 *
 * The known keys (`running`, `degraded`, `down`, `unknown`) all hit the map;
 * only a status value NOT present in the map exercises the `??` fallback that
 * paints an unrecognised DNS-server state in muted text. The existing suite
 * only seeds demo data whose statuses are all in the map, so the fallback
 * branch stays unreached. Injecting a synthetic row with a rogue status value
 * covers it without touching the demo data module.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const mockUseDemoMode = vi.fn()
const mockUseGlobalFilters = vi.fn()
const mockUseCardLoadingState = vi.fn()
const mockUseCardData = vi.fn()

vi.mock('../ui/Skeleton', () => ({
  Skeleton: () => <div data-testid="coredns-skeleton" />,
}))

vi.mock('../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => <span>{cluster}</span>,
}))

vi.mock('../../lib/cards/CardComponents', () => ({
  CardSearchInput: ({ value, onChange, placeholder }: {
    value: string
    onChange: (value: string) => void
    placeholder: string
  }) => (
    <input
      data-testid="coredns-search"
      value={value}
      placeholder={placeholder}
      onChange={event => onChange(event.target.value)}
    />
  ),
  CardPaginationFooter: () => <div data-testid="coredns-pagination" />,
}))

vi.mock('../../lib/cards/cardHooks', () => ({
  useCardData: (items: unknown) => mockUseCardData(items),
}))

vi.mock('./CardDataContext', () => ({
  useCardLoadingState: () => mockUseCardLoadingState(),
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

import { CoreDNSStatus } from './index'

type CoreDNSRow = {
  id: string
  name: string
  namespace: string
  cluster: string
  version: string
  status: string
  queriesPerSecond: number
  cacheHitRate: number
  upstreamLatencyMs: number
  errorRate: number
  uptime: string
}

function makeCardDataResult(items: CoreDNSRow[]) {
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
      availableClusters: [...new Set(items.map(r => r.cluster))],
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

function makeRow(overrides: Partial<CoreDNSRow>): CoreDNSRow {
  return {
    id: 'test/row',
    name: 'coredns-test',
    namespace: 'kube-system',
    cluster: 'test-cluster',
    version: '1.11.0',
    status: 'running',
    queriesPerSecond: 100,
    cacheHitRate: 0.9,
    upstreamLatencyMs: 5,
    errorRate: 0.01,
    uptime: '1d',
    ...overrides,
  }
}

describe('CoreDNSStatus default STATUS_COLORS branch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
    mockUseGlobalFilters.mockReturnValue({ selectedClusters: [] })
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: false,
      showEmptyState: false,
    })
  })

  it('paints an unrecognised status with the muted-foreground fallback class', () => {
    const rogueRow = makeRow({
      id: 'test-cluster/rogue-coredns',
      name: 'rogue-coredns',
      // "quarantined" is deliberately NOT in STATUS_COLORS —
      // exercises the `?? 'text-muted-foreground'` fallback on line 129.
      status: 'quarantined',
    })

    mockUseCardData.mockReturnValue(makeCardDataResult([rogueRow]))

    render(<CoreDNSStatus />)

    const statusEl = screen.getByText('quarantined')
    expect(statusEl.className).toContain('text-muted-foreground')
    // And it must NOT accidentally pick up any known status colour class.
    expect(statusEl.className).not.toContain('text-green-400')
    expect(statusEl.className).not.toContain('text-yellow-400')
    expect(statusEl.className).not.toContain('text-red-400')
  })

  it('still renders the mapped classes for known statuses (regression guard)', () => {
    const rows = [
      makeRow({ id: 'c1/ok', name: 'ok', status: 'running' }),
    ]

    mockUseCardData.mockReturnValue(makeCardDataResult(rows))

    render(<CoreDNSStatus />)

    const statusEl = screen.getByText('running')
    expect(statusEl.className).toContain('text-green-400')
  })
})
