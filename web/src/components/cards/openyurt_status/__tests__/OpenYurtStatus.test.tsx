import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { OpenYurtDemoData } from '../demoData'

vi.mock('../../../../lib/demoMode', () => ({
  isDemoMode: () => true,
  getDemoMode: () => true,
  isNetlifyDeployment: false,
  isDemoModeForced: false,
  canToggleDemoMode: () => true,
  setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(),
  subscribeDemoMode: () => () => {},
  isDemoToken: () => true,
  hasRealToken: () => false,
  setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

const mockUseDemoMode = vi.fn()
vi.mock('../../../../hooks/useDemoMode', () => ({
  getDemoMode: () => true,
  default: () => true,
  useDemoMode: () => mockUseDemoMode(),
  hasRealToken: () => false,
  isDemoModeForced: false,
  isNetlifyDeployment: false,
  canToggleDemoMode: () => true,
  isDemoToken: () => true,
  setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: unknown) => {
      if (vars && typeof vars === 'object' && 'defaultValue' in (vars as Record<string, unknown>)) {
        return String((vars as Record<string, unknown>).defaultValue ?? key)
      }
      if (typeof vars === 'string') return vars
      return key
    },
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('../../CardDataContext', () => ({
  useReportCardDataState: vi.fn(),
  useCardLoadingState: (opts: unknown) => mockUseCardLoadingState(opts),
}))

vi.mock('../../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({ selectedClusters: [] }),
}))

vi.mock('../../../../lib/cards/CardComponents', () => ({
  CardSearchInput: ({ value, onChange, placeholder }: {
    value: string
    onChange: (v: string) => void
    placeholder: string
  }) => (
    <input
      data-testid="card-search"
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
    />
  ),
}))

vi.mock('../../../ui/Skeleton', () => ({
  Skeleton: () => <div data-testid="openyurt-skeleton" />,
  SkeletonStats: () => <div data-testid="skeleton-stats" />,
  SkeletonList: () => <div data-testid="skeleton-list" />,
}))

const mockUseOpenYurtStatus = vi.fn()
vi.mock('../useOpenYurtStatus', () => ({
  useOpenYurtStatus: (cluster?: string) => mockUseOpenYurtStatus(cluster),
}))

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

function lastLoadingStateCall() {
  const calls = mockUseCardLoadingState.mock.calls
  return calls[calls.length - 1][0]
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

  it('marks data as demo when either isDemoMode or isDemoFallback is true', () => {
    mockUseDemoMode.mockReturnValue({
      isDemoMode: false,
      toggleDemoMode: vi.fn(),
      setDemoMode: vi.fn(),
    })
    mockUseOpenYurtStatus.mockReturnValue({
      ...defaultHookResult,
      isDemoFallback: true,
    })
    render(<OpenYurtStatus />)
    expect(lastLoadingStateCall().isDemoData).toBe(true)
  })

  it('reports isDemoData=false when neither flag is set', () => {
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
    render(<OpenYurtStatus />)
    expect(lastLoadingStateCall().isDemoData).toBe(false)
  })

  it('passes isRefreshing from the cache hook to useCardLoadingState', () => {
    mockUseOpenYurtStatus.mockReturnValue({
      ...defaultHookResult,
      isRefreshing: true,
    })
    render(<OpenYurtStatus />)
    expect(lastLoadingStateCall()).toMatchObject({ isRefreshing: true })
  })

  it('forwards isFailed and consecutiveFailures from the hook', () => {
    mockUseOpenYurtStatus.mockReturnValue({
      ...defaultHookResult,
      isFailed: true,
      consecutiveFailures: 4,
    })
    render(<OpenYurtStatus />)
    expect(lastLoadingStateCall()).toMatchObject({
      isFailed: true,
      consecutiveFailures: 4,
    })
  })

  it('reports hasAnyData=true when node pools are present', () => {
    render(<OpenYurtStatus />)
    expect(lastLoadingStateCall().hasAnyData).toBe(true)
  })

  it('reports hasAnyData=false when the hook returns empty data', () => {
    mockUseOpenYurtStatus.mockReturnValue({
      ...defaultHookResult,
      data: EMPTY_DATA,
      isDemoFallback: false,
    })
    render(<OpenYurtStatus />)
    expect(lastLoadingStateCall().hasAnyData).toBe(false)
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

  it('passes config.cluster through to the hook for multi-cluster contexts', () => {
    render(<OpenYurtStatus config={{ cluster: 'edge-shenzhen' }} />)
    expect(mockUseOpenYurtStatus).toHaveBeenCalledWith('edge-shenzhen')
  })
})
