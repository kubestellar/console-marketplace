/**
 * BuildpacksStatus.unlimited-itemsPerPage-branch.test.tsx
 *
 * Targets the previously-uncovered `itemsPerPage !== 'unlimited'` arm (and
 * the `typeof itemsPerPage === 'number' ? itemsPerPage : 10` ternary) that
 * guard `CardPaginationFooter` on line ~120 of
 * `src/components/cards/buildpacks-status/index.tsx`.
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
import { mockCardComponents, mockClusterBadgeModule, mockSkeletonModule } from '../../../test/cardTestHelpers'

interface BuildpacksRow extends Record<string, unknown> {
  cluster: string
}

const mockUseDemoMode = vi.fn()
const mockUseGlobalFilters = vi.fn()
const mockUseCardLoadingState = vi.fn()
const mockUseCardData = vi.fn()

vi.mock('../ui/Skeleton', () => mockSkeletonModule('buildpacks-skeleton'))

vi.mock('../../ui/ClusterBadge', () => mockClusterBadgeModule())

vi.mock('../../../lib/cards/CardComponents', () => mockCardComponents('buildpacks'))

vi.mock('../../../lib/cards/cardHooks', () => ({
  useCardData: (items: unknown) => mockUseCardData(items),
}))

vi.mock('../CardDataContext', () => ({
  useCardLoadingState: () => mockUseCardLoadingState(),
}))

vi.mock('./useBuildpacksStatus', () => ({
  useBuildpacksStatus: () => ({
    data: { images: [], lastCheckTime: new Date().toISOString() },
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

import { BuildpacksStatus } from './index'

function makeCardDataResult(items: BuildpacksRow[]) {
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

describe('BuildpacksStatus unlimited itemsPerPage branch', () => {
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
    const row: BuildpacksRow = {
      id: 'test-cluster/rogue-unlimited',
      cluster: 'test-cluster',
      name: 'rogue-unlimited',
      namespace: 'apps',
      status: 'succeeded',
      image: 'ghcr.io/example/app@sha256:deadbeef',
    }

    mockUseCardData.mockReturnValue(makeCardDataResult([row]))

    render(<BuildpacksStatus />)

    expect(screen.getByTestId('buildpacks-pagination')).toBeInTheDocument()
    expect(screen.queryByTestId('buildpacks-next-page')).not.toBeInTheDocument()
  })
})
