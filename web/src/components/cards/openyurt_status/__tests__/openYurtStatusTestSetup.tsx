// Shared mock-module factories for the OpenYurtStatus render/relativeTime
// test suites (see issue #571). Both suites need the same demoMode /
// useDemoMode / react-i18next / CardDataContext / Skeleton / CardComponents
// / useOpenYurtStatus module shape; `vi.mock` factories are hoisted, so
// each test file still calls `vi.mock(...)` itself, but delegates the
// factory body to these helpers instead of repeating the same ~95 lines.

import { vi } from 'vitest'

export function mockDemoModeLibModule() {
  return {
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
  }
}

export function mockUseDemoModeHookModule(useDemoMode: () => unknown) {
  return {
    getDemoMode: () => true,
    default: () => true,
    useDemoMode,
    hasRealToken: () => false,
    isDemoModeForced: false,
    isNetlifyDeployment: false,
    canToggleDemoMode: () => true,
    isDemoToken: () => true,
    setDemoToken: vi.fn(),
    setGlobalDemoMode: vi.fn(),
  }
}

export function mockReactI18nextModule() {
  return {
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
  }
}

export function mockCardDataContextModule(useCardLoadingState: () => unknown) {
  return {
    useReportCardDataState: vi.fn(),
    useCardLoadingState,
  }
}

export function mockGlobalFiltersModule(useGlobalFilters: () => unknown) {
  return { useGlobalFilters }
}

export function mockCardSearchInputModule() {
  return {
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
  }
}

export function mockOpenYurtSkeletonModule() {
  return {
    Skeleton: () => <div data-testid="openyurt-skeleton" />,
    SkeletonStats: () => <div data-testid="skeleton-stats" />,
    SkeletonList: () => <div data-testid="skeleton-list" />,
  }
}

export function mockUseOpenYurtStatusModule(useOpenYurtStatus: (cluster?: string) => unknown) {
  return { useOpenYurtStatus }
}
