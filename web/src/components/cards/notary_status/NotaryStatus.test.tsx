import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

interface DisplayRow {
  cluster: string
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
  CardPaginationFooter: () => <div data-testid="notary-pagination" />,
}))

vi.mock('../../lib/cards/cardHooks', () => ({
  useCardData: (rows: unknown, options: unknown) => mockUseCardData(rows, options),
}))

vi.mock('./CardDataContext', () => ({
  useCardLoadingState: (options: unknown) => mockUseCardLoadingState(options),
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

    expect(mockUseCardLoadingState).toHaveBeenCalledWith(expect.objectContaining({
      isDemoData: true,
      hasAnyData: true,
    }))
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

  it('renders the empty state when the loading helper reports no data', () => {
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: false,
      showEmptyState: true,
    })

    render(<NotaryStatus />)

    expect(screen.getByText('notaryStatus.notInstalled')).toBeTruthy()
  })
})
