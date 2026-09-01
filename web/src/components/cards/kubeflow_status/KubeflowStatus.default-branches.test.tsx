/**
 * Coverage for the two exhaustive-switch `default` arms in
 * `getCategoryIcon` (line ~275: `default: return Server`) and
 * `getCategoryLabel` (line ~290: `default: return category`) inside
 * `web/src/components/cards/kubeflow_status/index.tsx`.
 *
 * The `category` field on `KubeflowDisplayItem` is a strict union
 * (`'pipeline' | 'experiment' | 'notebook' | 'training'`) so the
 * default arms are unreachable through normal usage. They act as
 * defensive fallbacks: if a future demo-data row or upstream loader
 * hands the card a category outside the union, the row must still
 * render (falling back to the generic Server icon and echoing the
 * raw category string as its label) instead of crashing.
 *
 * We reach those arms by having `useCardData` return an item with
 * an unrecognised category. The default arms are the ONLY paths that
 * do not throw / do not require an `import { Cpu | Play | ... }`
 * lookup, so a regression would either drop rendered rows or throw
 * on `React.createElement(undefined)`.
 */

import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const mockUseClusters = vi.fn()
const mockUseDemoMode = vi.fn()
const mockUseGlobalFilters = vi.fn()
const mockUseCardLoadingState = vi.fn()
const mockUseCardData = vi.fn()

vi.mock('../../hooks/useMCP', () => ({
  useClusters: () => mockUseClusters(),
}))

vi.mock('../ui/Skeleton', () => ({
  Skeleton: () => <div data-testid="kubeflow-skeleton" />,
}))

vi.mock('../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => <span>{cluster}</span>,
}))

vi.mock('../../lib/cards/CardComponents', () => ({
  CardSearchInput: ({ value, placeholder }: { value: string; placeholder: string }) => (
    <input data-testid="kubeflow-search" value={value} placeholder={placeholder} readOnly />
  ),
  CardControlsRow: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CardPaginationFooter: () => <div data-testid="kubeflow-pagination" />,
  CardAIActions: () => <div data-testid="kubeflow-ai-actions" />,
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

describe('KubeflowStatus — getCategoryIcon/getCategoryLabel default arms', () => {
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
      namespace: 'ml',
      category: 'quantum-training',
      status: 'running',
      primaryDetail: 'rogue-primary',
      secondaryDetail: 'rogue-secondary',
      timestamp: '2026-05-31T00:00:00.000Z',
    }
    mockUseCardData.mockReturnValue(makeCardDataResult([rogueItem]))

    render(<KubeflowStatus />)

    // Label default arm returns the raw category string verbatim.
    expect(screen.getAllByText('quantum-training').length).toBeGreaterThan(0)
    // Row rendered at all — proves getCategoryIcon default (Server) resolved
    // to a real component instead of undefined (which would throw).
    expect(screen.getByText('rogue-workload')).toBeTruthy()
  })

  it('renders the raw category text for a second unknown category value', () => {
    const rogueItem: AnyItem = {
      cluster: 'aks-dev-eu',
      id: 'rogue-2',
      name: 'legacy-serving',
      namespace: 'ml',
      category: 'serving',
      status: 'succeeded',
      primaryDetail: 'legacy-primary',
      secondaryDetail: 'legacy-secondary',
      timestamp: '2026-05-31T00:00:00.000Z',
    }
    mockUseCardData.mockReturnValue(makeCardDataResult([rogueItem]))

    render(<KubeflowStatus />)

    expect(screen.getAllByText('serving').length).toBeGreaterThan(0)
    expect(screen.getByText('legacy-serving')).toBeTruthy()
  })
})
