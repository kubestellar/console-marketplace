import { useEffect, useMemo, useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

interface DisplayRow extends Record<string, unknown> {
  cluster: string
}

interface CardDataOptions<T> {
  sort?: {
    defaultField?: string
    defaultDirection?: 'asc' | 'desc'
    comparators?: Record<string, (a: T, b: T) => number>
  }
}

const mockUseDemoMode = vi.fn()
const mockUseGlobalFilters = vi.fn()
const mockUseCardLoadingState = vi.fn()
const mockUseCardData = vi.fn()

vi.mock('../ui/Skeleton', () => ({
  Skeleton: () => <div data-testid="notary-skeleton" />,
}))

vi.mock('../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => <span>{cluster}</span>,
}))

vi.mock('../../lib/cards/CardComponents', () => ({
  CardPaginationFooter: ({
    currentPage,
    totalPages,
    onPageChange,
    needsPagination,
  }: {
    currentPage?: number
    totalPages?: number
    onPageChange?: (page: number) => void
    needsPagination?: boolean
  }) => (
    <div data-testid="notary-pagination">
      <span data-testid="notary-page-indicator">
        {currentPage}/{totalPages}
      </span>
      {needsPagination && onPageChange && (
        <button
          data-testid="notary-next-page"
          onClick={() => onPageChange(currentPage === totalPages ? 1 : (currentPage ?? 1) + 1)}
          type="button"
        >
          next page
        </button>
      )}
    </div>
  ),
}))

vi.mock('../../lib/cards/cardHooks', () => ({
  useCardData: (rows: unknown) => mockUseCardData(rows),
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

import { NotaryStatus } from './index'

function createCardDataResult(rows: DisplayRow[]) {
  return {
    items: rows,
    totalItems: rows.length,
    currentPage: 1,
    totalPages: 1,
    itemsPerPage: 5,
    goToPage: vi.fn(),
    needsPagination: false,
    containerRef: { current: null },
    containerStyle: {},
  }
}

function useInteractiveCardData<T extends DisplayRow>(
  items: T[],
  options: CardDataOptions<T> = {},
) {
  const [sortDirection] = useState<'asc' | 'desc'>(
    options.sort?.defaultDirection ?? 'asc',
  )
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 1

  const visibleItems = useMemo(() => {
    const comparator = options.sort?.comparators?.[options.sort?.defaultField ?? 'cluster']
    if (!comparator) return items
    return [...items].sort((a, b) =>
      sortDirection === 'desc' ? comparator(b, a) : comparator(a, b),
    )
  }, [items, options.sort?.comparators, options.sort?.defaultField, sortDirection])

  useEffect(() => {
    setCurrentPage(1)
  }, [items])

  const totalPages = Math.max(1, Math.ceil(visibleItems.length / itemsPerPage))
  const safePage = Math.min(currentPage, totalPages)
  const pageItems = visibleItems.slice(
    (safePage - 1) * itemsPerPage,
    safePage * itemsPerPage,
  )

  return {
    items: pageItems,
    totalItems: visibleItems.length,
    currentPage: safePage,
    totalPages,
    itemsPerPage,
    goToPage: (page: number) => setCurrentPage(Math.min(Math.max(page, 1), totalPages)),
    needsPagination: visibleItems.length > itemsPerPage,
    containerRef: { current: null },
    containerStyle: {},
  }
}

describe('NotaryStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
    mockUseGlobalFilters.mockReturnValue({ selectedClusters: [] })
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: false,
      showEmptyState: false,
    })
    mockUseCardData.mockImplementation((rows: DisplayRow[]) => createCardDataResult(rows))
  })

  it('renders demo data and forwards demo state to the loading helper', () => {
    render(<NotaryStatus />)

    expect(mockUseCardLoadingState).toHaveBeenCalled()
    expect(screen.getByText('eks-prod-us-east-1')).toBeTruthy()
    expect(screen.getByTestId('notary-pagination')).toBeTruthy()
  })

  it('filters cluster rows before pagination when a global cluster is selected', () => {
    mockUseGlobalFilters.mockReturnValue({ selectedClusters: ['gke-staging'] })

    render(<NotaryStatus />)

    const filteredRows = mockUseCardData.mock.calls[0]?.[0] as DisplayRow[]
    expect(filteredRows).toHaveLength(1)
    expect(filteredRows[0]?.cluster).toBe('gke-staging')
  })

  it('renders the aggregated signed, unsigned, and cluster totals', () => {
    render(<NotaryStatus />)

    expect(screen.getByText('60')).toBeTruthy()
    expect(screen.getByText('10')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('paginates cluster rows through the shared card hook footer', () => {
    mockUseCardData.mockImplementation((rows: DisplayRow[]) =>
      useInteractiveCardData(rows, {
        sort: {
          defaultField: 'cluster',
          defaultDirection: 'asc',
          comparators: {
            cluster: (a: DisplayRow, b: DisplayRow) => a.cluster.localeCompare(b.cluster),
          },
        },
      }),
    )

    render(<NotaryStatus />)

    expect(screen.getByText('aks-dev-eu')).toBeTruthy()
    expect(screen.getByText('notaryStatus.notInstalledShort')).toBeTruthy()

    fireEvent.click(screen.getByTestId('notary-next-page'))

    expect(screen.getByText('eks-prod-us-east-1')).toBeTruthy()
    expect(screen.getByTestId('notary-page-indicator').textContent).toContain('2/')
  })

  it('omits the signed % bar and uses signedPct=0 when the filtered set has zero signed and zero unsigned images', () => {
    // aks-dev-eu carries signedImages=0 + unsignedImages=0 in the demo
    // fixture. Filtering to that cluster reduces totals to 0, which
    // exercises the `signedPct = ... : 0` else-arm of the ternary at
    // index.tsx:99-106 and hides the signed % bar via the
    // `totalSigned + totalUnsigned > 0` guard on line 176.
    mockUseGlobalFilters.mockReturnValue({ selectedClusters: ['aks-dev-eu'] })

    render(<NotaryStatus />)

    const filteredRows = mockUseCardData.mock.calls[0]?.[0] as DisplayRow[]
    expect(filteredRows).toHaveLength(1)
    expect(filteredRows[0]?.cluster).toBe('aks-dev-eu')

    // The signed-percent i18n key must NOT render when the guard hides
    // the bar. If either it or its "N total" sibling renders, the
    // totalSigned+totalUnsigned>0 guard has been unintentionally
    // loosened.
    expect(screen.queryByText('notaryStatus.signedPct')).toBeNull()
    expect(screen.queryByText(/^0 total$/)).toBeNull()
  })

  it('renders the empty state when the loading helper reports no data', () => {
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: false,
      showEmptyState: true,
    })

    render(<NotaryStatus />)

    expect(screen.getByText('notaryStatus.notInstalled')).toBeTruthy()
  })
})
