/**
 * BuildpacksStatus.default-branches.test.tsx
 *
 * Targets the previously-uncovered `STATUS_COLORS[row.status] ?? 'text-muted-foreground'`
 * fallback arm on line 110 of `src/components/cards/buildpacks-status/index.tsx`.
 *
 * The known keys (`succeeded`, `failed`, `building`, `unknown`) all hit the map;
 * only a status value NOT present in the map exercises the `??` fallback that
 * paints an unrecognised build state in muted text. The existing suite only
 * seeds demo data whose statuses are all in the map, so the fallback is
 * unreached. Injecting a synthetic row with a rogue status value covers it
 * without touching the demo data module.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const mockUseDemoMode = vi.fn()
const mockUseGlobalFilters = vi.fn()
const mockUseCardLoadingState = vi.fn()
const mockUseCardData = vi.fn()

vi.mock('../ui/Skeleton', () => ({
  Skeleton: () => <div data-testid="buildpacks-skeleton" />,
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
      data-testid="buildpacks-search"
      value={value}
      placeholder={placeholder}
      onChange={event => onChange(event.target.value)}
    />
  ),
  CardPaginationFooter: () => <div data-testid="buildpacks-pagination" />,
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

import { BuildpacksStatus } from './index'

type BuildpacksRow = {
  id: string
  cluster: string
  name: string
  namespace: string
  status: string
  image: string
}

function makeCardDataResult(items: BuildpacksRow[]) {
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

describe('BuildpacksStatus default STATUS_COLORS branch', () => {
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
    const rogueRow: BuildpacksRow = {
      id: 'test-cluster/rogue-status-image',
      cluster: 'test-cluster',
      name: 'rogue-status-image',
      namespace: 'default',
      // "quarantined" is deliberately NOT in STATUS_COLORS —
      // it exercises the `?? 'text-muted-foreground'` fallback on line 110.
      status: 'quarantined',
      image: 'ghcr.io/example/rogue@sha256:deadbeef',
    }

    mockUseCardData.mockReturnValue(makeCardDataResult([rogueRow]))

    render(<BuildpacksStatus />)

    // The status text is rendered inside the fallback-classed span.
    const statusEl = screen.getByText('quarantined')
    expect(statusEl.className).toContain('text-muted-foreground')
    // And it must NOT accidentally pick up one of the known colour classes.
    expect(statusEl.className).not.toContain('text-green-400')
    expect(statusEl.className).not.toContain('text-red-400')
    expect(statusEl.className).not.toContain('text-yellow-400')
  })

  it('still renders the mapped classes for known statuses (regression guard)', () => {
    const rows: BuildpacksRow[] = [
      {
        id: 'c1/succeeded-image',
        cluster: 'c1',
        name: 'succeeded-image',
        namespace: 'default',
        status: 'succeeded',
        image: 'ghcr.io/example/ok@sha256:1',
      },
    ]

    mockUseCardData.mockReturnValue(makeCardDataResult(rows))

    render(<BuildpacksStatus />)

    const statusEl = screen.getByText('succeeded')
    expect(statusEl.className).toContain('text-green-400')
  })
})
