import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
const mockUseGlobalFilters = vi.fn()
vi.mock('../../CardDataContext', () => ({
  useReportCardDataState: vi.fn(),
  useCardLoadingState: () => mockUseCardLoadingState(),
}))

vi.mock('../../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => mockUseGlobalFilters(),
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

  // ─── useFormatRelativeTime branches (index.tsx:92-100) ─────────────────
  // The hook fans out into 5 arms depending on the age of data.lastCheckTime.
  // Existing tests only render with a static demo fixture, which hits either
  // one arm or the isNaN guard depending on Date.now() at run time. These
  // subtests pin Date.now() with fake timers and drive each arm deterministically.

  describe('useFormatRelativeTime arms (rendered via lastCheckTime)', () => {
    const FIXED_NOW = new Date('2026-01-15T12:00:00Z').getTime()

    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(FIXED_NOW)
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    function renderAt(lastCheckOffsetMs: number | 'invalid' | 'future') {
      let lastCheckTime: string
      if (lastCheckOffsetMs === 'invalid') {
        lastCheckTime = 'not-a-real-timestamp'
      } else if (lastCheckOffsetMs === 'future') {
        lastCheckTime = new Date(FIXED_NOW + 60_000).toISOString()
      } else {
        lastCheckTime = new Date(FIXED_NOW - lastCheckOffsetMs).toISOString()
      }
      mockUseOpenYurtStatus.mockReturnValue({
        ...defaultHookResult,
        data: { ...OPENYURT_DEMO_DATA, lastCheckTime },
      })
      return render(<OpenYurtStatus />)
    }

    it('renders syncedJustNow when the parsed date is NaN (isNaN(diff) arm)', () => {
      const { container } = renderAt('invalid')
      expect(container.textContent).toContain('openyurt.syncedJustNow')
    })

    it('renders syncedJustNow when the last check is in the future (diff < 0 arm)', () => {
      const { container } = renderAt('future')
      expect(container.textContent).toContain('openyurt.syncedJustNow')
    })

    it('renders syncedJustNow when the last check is <1 minute old (diff < minute arm)', () => {
      const { container } = renderAt(30_000)
      expect(container.textContent).toContain('openyurt.syncedJustNow')
    })

    it('renders syncedMinutesAgo when the last check is <1 hour old', () => {
      const { container } = renderAt(5 * 60_000)
      expect(container.textContent).toContain('openyurt.syncedMinutesAgo')
    })

    it('renders syncedHoursAgo when the last check is <1 day old', () => {
      const { container } = renderAt(3 * 60 * 60_000)
      expect(container.textContent).toContain('openyurt.syncedHoursAgo')
    })

    it('renders syncedDaysAgo when the last check is ≥1 day old (final return arm)', () => {
      const { container } = renderAt(3 * 24 * 60 * 60_000)
      expect(container.textContent).toContain('openyurt.syncedDaysAgo')
    })
  })
})
