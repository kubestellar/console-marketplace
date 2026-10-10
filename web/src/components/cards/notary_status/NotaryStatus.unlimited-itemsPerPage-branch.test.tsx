/**
 * NotaryStatus.unlimited-itemsPerPage-branch.test.tsx
 *
 * Targets the previously-uncovered `itemsPerPage !== 'unlimited'` arm (and
 * the `typeof itemsPerPage === 'number' ? itemsPerPage : 10` ternary) that
 * guard `CardPaginationFooter` on line ~276 of
 * `src/components/cards/notary_status/index.tsx`.
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

interface DisplayRow extends Record<string, unknown> {
  cluster: string
}

const mockUseDemoMode = vi.fn()
const mockUseGlobalFilters = vi.fn()
const mockUseCardLoadingState = vi.fn()
const mockUseCardData = vi.fn()

vi.mock('../ui/Skeleton', () => mockSkeletonModule('notary-skeleton'))

vi.mock('../../ui/ClusterBadge', () => mockClusterBadgeModule())

vi.mock('../../../lib/cards/CardComponents', () => mockCardComponents('notary'))

vi.mock('../../../lib/cards/cardHooks', () => ({
  useCardData: (rows: unknown) => mockUseCardData(rows),
}))

vi.mock('../CardDataContext', () => ({
  useCardLoadingState: () => mockUseCardLoadingState(),
}))

vi.mock('./useNotaryStatus', () => ({
  useNotaryStatus: () => ({
    data: { clusters: [], lastCheckTime: new Date().toISOString() },
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

import { NotaryStatus } from './index'

function makeCardDataResult(rows: DisplayRow[]) {
  return {
    items: rows,
    totalItems: rows.length,
    currentPage: 1,
    totalPages: 1,
    itemsPerPage: 'unlimited' as const,
    goToPage: vi.fn(),
    // The hook itself thinks pagination is needed; the card must still
    // suppress it because itemsPerPage is 'unlimited'.
    needsPagination: true,
    containerRef: { current: null },
    containerStyle: {},
  }
}

describe('NotaryStatus unlimited itemsPerPage branch', () => {
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
    const row: DisplayRow = {
      id: 'test-cluster',
      cluster: 'test-cluster',
      installed: true,
      signedImages: 5,
      unsignedImages: 1,
      trustPolicies: [],
    }

    mockUseCardData.mockReturnValue(makeCardDataResult([row]))

    render(<NotaryStatus />)

    expect(screen.getByTestId('notary-pagination')).toBeInTheDocument()
    expect(screen.queryByTestId('notary-next-page')).not.toBeInTheDocument()
  })
})
