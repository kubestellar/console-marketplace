// Render/badge/skeleton/error-state coverage for OpenYurtStatus, plus
// search-filter and cluster-selection behavior. Split out of the former
// __tests__/OpenYurtStatus.test.tsx (513 lines) alongside
// OpenYurtStatus.relativeTime.test.tsx (see issue #571).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { OpenYurtDemoData } from '../demoData'
import {
  mockCardDataContextModule,
  mockCardSearchInputModule,
  mockDemoModeLibModule,
  mockGlobalFiltersModule,
  mockOpenYurtSkeletonModule,
  mockReactI18nextModule,
  mockUseDemoModeHookModule,
  mockUseOpenYurtStatusModule,
} from './openYurtStatusTestSetup'

vi.mock('../../../../lib/demoMode', () => mockDemoModeLibModule())

const mockUseDemoMode = vi.fn()
vi.mock('../../../../hooks/useDemoMode', () => mockUseDemoModeHookModule(() => mockUseDemoMode()))

vi.mock('react-i18next', () => mockReactI18nextModule())

const mockUseCardLoadingState = vi.fn()
const mockUseGlobalFilters = vi.fn()
vi.mock('../../CardDataContext', () => mockCardDataContextModule(() => mockUseCardLoadingState()))

vi.mock('../../../../hooks/useGlobalFilters', () => mockGlobalFiltersModule(() => mockUseGlobalFilters()))

vi.mock('../../../../lib/cards/CardComponents', () => mockCardSearchInputModule())

vi.mock('../../../ui/Skeleton', () => mockOpenYurtSkeletonModule())

const mockUseOpenYurtStatus = vi.fn()
vi.mock('../useOpenYurtStatus', () => mockUseOpenYurtStatusModule((cluster?: string) => mockUseOpenYurtStatus(cluster)))

import { OpenYurtStatus } from '../index'
import { OPENYURT_DEMO_DATA } from '../demoData'

const EMPTY_DATA: OpenYurtDemoData = {
  health: 'not-installed',
  controllerPods: { ready: 0, total: 0 },
  nodePools: [],
  gateways: [],
  totalNodes: 0,
  autonomousNodes: 0,
  lastCheckTime: new Date(0).toISOString(),
  fetchError: null,
}

const defaultHookResult = {
  data: OPENYURT_DEMO_DATA,
  isLoading: false,
  isRefreshing: false,
  isFailed: false,
  isDemoFallback: true,
  consecutiveFailures: 0,
  lastRefresh: Date.now(),
  refetch: vi.fn(),
}

describe('OpenYurtStatus', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDemoMode.mockReturnValue({
      isDemoMode: true,
      toggleDemoMode: vi.fn(),
      setDemoMode: vi.fn(),
    })
    mockUseGlobalFilters.mockReturnValue({ selectedClusters: [] })
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: false,
      showEmptyState: false,
      hasData: true,
      isRefreshing: false,
    })
    mockUseOpenYurtStatus.mockReturnValue(defaultHookResult)
  })

  it('renders without crashing with demo data', () => {
    const { container } = render(<OpenYurtStatus />)
    expect(container.innerHTML.length).toBeGreaterThan(0)
  })

  it('renders the Demo badge when isDemoFallback is true and demo mode is off', () => {
    mockUseDemoMode.mockReturnValue({
      isDemoMode: false,
      toggleDemoMode: vi.fn(),
      setDemoMode: vi.fn(),
    })
    mockUseOpenYurtStatus.mockReturnValue({
      ...defaultHookResult,
      isDemoFallback: true,
    })
    const { queryByTestId } = render(<OpenYurtStatus />)
    expect(queryByTestId('openyurt-demo-badge')).not.toBeNull()
  })

  it('hides the Demo badge when neither isDemoMode nor isDemoFallback is set', () => {
    mockUseDemoMode.mockReturnValue({
      isDemoMode: false,
      toggleDemoMode: vi.fn(),
      setDemoMode: vi.fn(),
    })
    mockUseOpenYurtStatus.mockReturnValue({
      ...defaultHookResult,
      isDemoFallback: false,
    })
    const { queryByTestId } = render(<OpenYurtStatus />)
    expect(queryByTestId('openyurt-demo-badge')).toBeNull()
  })

  it('computes isDemoData from isDemoMode or isDemoFallback', () => {
    mockUseDemoMode.mockReturnValue({
      isDemoMode: false,
      toggleDemoMode: vi.fn(),
      setDemoMode: vi.fn(),
    })
    mockUseOpenYurtStatus.mockReturnValue({
      ...defaultHookResult,
      isDemoFallback: true,
    })
    const { queryByTestId } = render(<OpenYurtStatus />)
    // When isDemoFallback is true, the demo badge should be shown
    expect(queryByTestId('openyurt-demo-badge')).not.toBeNull()
  })

  it('computes hasAnyData from the data content', () => {
    mockUseDemoMode.mockReturnValue({
      isDemoMode: false,
      toggleDemoMode: vi.fn(),
      setDemoMode: vi.fn(),
    })
    mockUseOpenYurtStatus.mockReturnValue({
      ...defaultHookResult,
      data: EMPTY_DATA,
      isDemoFallback: false,
    })
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: false,
      showEmptyState: false,
      hasData: false,
      isRefreshing: false,
    })
    const { container } = render(<OpenYurtStatus />)
    // With empty data and no demo mode, should show not-installed state
    expect(container.textContent).toContain('OpenYurt not detected')
  })

  it('renders skeleton when useCardLoadingState returns showSkeleton=true', () => {
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: true,
      showEmptyState: false,
      hasData: false,
      isRefreshing: false,
    })
    const { queryAllByTestId } = render(<OpenYurtStatus />)
    expect(queryAllByTestId('openyurt-skeleton').length).toBeGreaterThan(0)
  })

  it('renders scoped nodepool error when fetchError.resource=nodepools and no data', () => {
    mockUseDemoMode.mockReturnValue({
      isDemoMode: false,
      toggleDemoMode: vi.fn(),
      setDemoMode: vi.fn(),
    })
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: false,
      showEmptyState: true,
      hasData: false,
      isRefreshing: false,
    })
    mockUseOpenYurtStatus.mockReturnValue({
      ...defaultHookResult,
      isFailed: true,
      isDemoFallback: false,
      data: {
        ...EMPTY_DATA,
        fetchError: { resource: 'nodepools', message: 'HTTP 403 Forbidden' },
      },
    })
    const { getByTestId } = render(<OpenYurtStatus />)
    const err = getByTestId('openyurt-error')
    expect(err.textContent).toContain('nodepools.apps.openyurt.io')
  })

  it('renders scoped gateway error when fetchError.resource=gateways and no data', () => {
    mockUseDemoMode.mockReturnValue({
      isDemoMode: false,
      toggleDemoMode: vi.fn(),
      setDemoMode: vi.fn(),
    })
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: false,
      showEmptyState: true,
      hasData: false,
      isRefreshing: false,
    })
    mockUseOpenYurtStatus.mockReturnValue({
      ...defaultHookResult,
      isFailed: true,
      isDemoFallback: false,
      data: {
        ...EMPTY_DATA,
        fetchError: { resource: 'gateways', message: 'HTTP 403 Forbidden' },
      },
    })
    const { getByTestId } = render(<OpenYurtStatus />)
    const err = getByTestId('openyurt-error')
    expect(err.textContent).toContain('gateways.raven.openyurt.io')
  })

  it('renders not-installed state when no controller pods are present and not in demo mode', () => {
    mockUseDemoMode.mockReturnValue({
      isDemoMode: false,
      toggleDemoMode: vi.fn(),
      setDemoMode: vi.fn(),
    })
    mockUseOpenYurtStatus.mockReturnValue({
      ...defaultHookResult,
      isDemoFallback: false,
      data: EMPTY_DATA,
    })
    const { container } = render(<OpenYurtStatus />)
    expect(container.textContent).toContain('OpenYurt not detected')
  })

  it('filters node pools with the card search input', () => {
    render(<OpenYurtStatus />)

    fireEvent.change(screen.getByTestId('card-search'), {
      target: { value: 'hangzhou' },
    })

    expect(screen.getByText('edge-hangzhou-4')).toBeTruthy()
    expect(screen.queryByText('cloud-pool')).toBeNull()
  })

  it('falls back to the first global cluster when config.cluster is not provided', () => {
    mockUseGlobalFilters.mockReturnValue({ selectedClusters: ['edge-global-cluster'] })

    render(<OpenYurtStatus />)

    expect(mockUseOpenYurtStatus).toHaveBeenCalledWith('edge-global-cluster')
  })

  it('prefers config.cluster over the global cluster selection', () => {
    mockUseGlobalFilters.mockReturnValue({ selectedClusters: ['ignored-global-cluster'] })

    render(<OpenYurtStatus config={{ cluster: 'edge-shenzhen' }} />)

    expect(mockUseOpenYurtStatus).toHaveBeenCalledWith('edge-shenzhen')
  })
})
