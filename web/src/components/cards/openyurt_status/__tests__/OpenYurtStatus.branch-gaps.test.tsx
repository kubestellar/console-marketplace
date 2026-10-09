// Covers branches left unexercised by OpenYurtStatus.render.test.tsx /
// OpenYurtStatus.relativeTime.test.tsx: the 'pods' resource arm of the
// hard-error message, the soft-error banner (fetchError present while
// cached data still renders), the search-yields-no-results empty state,
// and the nodePools/gateways/controllerPods fallback defaults.

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

const ONE_POOL_DATA: OpenYurtDemoData = {
  health: 'healthy',
  controllerPods: { ready: 2, total: 2 },
  nodePools: [
    {
      name: 'edge-hangzhou-4',
      type: 'edge',
      status: 'ready',
      nodeCount: 4,
      readyNodes: 4,
      autonomyEnabled: true,
    },
  ],
  gateways: [],
  totalNodes: 4,
  autonomousNodes: 4,
  lastCheckTime: new Date(0).toISOString(),
  fetchError: null,
}

const defaultHookResult = {
  data: ONE_POOL_DATA,
  isLoading: false,
  isRefreshing: false,
  isFailed: false,
  isDemoFallback: false,
  consecutiveFailures: 0,
  lastRefresh: Date.now(),
  refetch: vi.fn(),
}

describe('OpenYurtStatus branch gaps', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDemoMode.mockReturnValue({
      isDemoMode: false,
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

  it('renders the generic pods error message when fetchError.resource=pods and no data', () => {
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: false,
      showEmptyState: true,
      hasData: false,
      isRefreshing: false,
    })
    mockUseOpenYurtStatus.mockReturnValue({
      ...defaultHookResult,
      isFailed: true,
      data: {
        ...EMPTY_DATA,
        fetchError: { resource: 'pods', message: 'HTTP 500' },
      },
    })
    const { getByTestId } = render(<OpenYurtStatus />)
    const err = getByTestId('openyurt-error')
    expect(err.textContent).toContain('Failed to fetch OpenYurt pods')
  })

  it('shows the nodepools soft-error banner alongside cached data', () => {
    mockUseOpenYurtStatus.mockReturnValue({
      ...defaultHookResult,
      data: { ...ONE_POOL_DATA, fetchError: { resource: 'nodepools', message: 'HTTP 403' } },
    })
    const { container } = render(<OpenYurtStatus />)
    expect(container.textContent).toContain('Failed to list nodepools.apps.openyurt.io')
  })

  it('shows the gateways soft-error banner alongside cached data', () => {
    mockUseOpenYurtStatus.mockReturnValue({
      ...defaultHookResult,
      data: { ...ONE_POOL_DATA, fetchError: { resource: 'gateways', message: 'HTTP 403' } },
    })
    const { container } = render(<OpenYurtStatus />)
    expect(container.textContent).toContain('Failed to list gateways.raven.openyurt.io')
  })

  it('shows the pods soft-error banner alongside cached data', () => {
    mockUseOpenYurtStatus.mockReturnValue({
      ...defaultHookResult,
      data: { ...ONE_POOL_DATA, fetchError: { resource: 'pods', message: 'HTTP 500' } },
    })
    const { container } = render(<OpenYurtStatus />)
    expect(container.textContent).toContain('Failed to fetch OpenYurt pods')
  })

  it('hides the soft-error banner while in demo mode even if fetchError is set', () => {
    mockUseDemoMode.mockReturnValue({
      isDemoMode: true,
      toggleDemoMode: vi.fn(),
      setDemoMode: vi.fn(),
    })
    mockUseOpenYurtStatus.mockReturnValue({
      ...defaultHookResult,
      isDemoFallback: true,
      data: { ...ONE_POOL_DATA, fetchError: { resource: 'nodepools', message: 'HTTP 403' } },
    })
    const { container } = render(<OpenYurtStatus />)
    expect(container.textContent).not.toContain('Failed to list nodepools.apps.openyurt.io')
  })

  it('shows the no-search-results message when the search query matches no pools', () => {
    render(<OpenYurtStatus />)

    fireEvent.change(screen.getByTestId('card-search'), {
      target: { value: 'no-such-pool' },
    })

    expect(screen.getByText('No node pools match your search.')).toBeTruthy()
    expect(screen.queryByText('edge-hangzhou-4')).toBeNull()
  })

  it('renders the generic fetch-error message when no fetchError is set but the hook reports failure', () => {
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: false,
      showEmptyState: true,
      hasData: false,
      isRefreshing: false,
    })
    mockUseOpenYurtStatus.mockReturnValue({
      ...defaultHookResult,
      isFailed: true,
      data: { ...EMPTY_DATA, fetchError: null },
    })
    const { getByTestId } = render(<OpenYurtStatus />)
    const err = getByTestId('openyurt-error')
    expect(err.textContent).toContain('Failed to fetch OpenYurt status')
  })

  it('spins the refresh icon while isRefreshing is true', () => {
    const { container } = render(<OpenYurtStatus />)
    mockUseOpenYurtStatus.mockReturnValue({ ...defaultHookResult, isRefreshing: true })
    const { container: refreshingContainer } = render(<OpenYurtStatus />)
    expect(container.querySelector('.animate-spin')).toBeNull()
    expect(refreshingContainer.querySelector('.animate-spin')).not.toBeNull()
  })

  it('falls back to empty collections/defaults when nodePools, gateways, and controllerPods are absent', () => {
    mockUseOpenYurtStatus.mockReturnValue({
      ...defaultHookResult,
      data: {
        ...ONE_POOL_DATA,
        nodePools: undefined,
        gateways: undefined,
        controllerPods: undefined,
      },
    })
    const { container } = render(<OpenYurtStatus />)
    // With no node pools, the "Controller running" empty state renders
    // instead of a crash from calling .length/.filter on undefined.
    expect(container.textContent).toContain('Controller running')
    expect(container.textContent).toContain('0/0')
  })
})
