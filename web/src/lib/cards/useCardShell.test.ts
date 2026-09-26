import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import type { UseCacheResult } from '../cache'
import { useCardShell, type CardTFunction } from './useCardShell'

const mockUseDemoMode = vi.fn()
const mockUseGlobalFilters = vi.fn()
const mockUseTranslation = vi.fn()

vi.mock('../../hooks/useDemoMode', () => ({
  useDemoMode: () => mockUseDemoMode(),
}))

vi.mock('../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => mockUseGlobalFilters(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: (ns: unknown) => mockUseTranslation(ns),
}))

interface FakeRaw {
  servers: Array<{ cluster: string; name: string }>
}

interface FakeRow {
  id: string
  cluster: string
  name: string
}

const RAW: FakeRaw = {
  servers: [
    { cluster: 'east', name: 'a' },
    { cluster: 'west', name: 'b' },
    { cluster: 'east', name: 'c' },
  ],
}

const EMPTY_RAW: FakeRaw = { servers: [] }

function toRows(raw: FakeRaw, t: CardTFunction): FakeRow[] {
  return raw.servers.map(s => ({ ...s, id: `${s.cluster}/${String(t(s.name))}` }))
}

const hasAnyData = (raw: FakeRaw) => raw.servers.length > 0

function statusResult(overrides: Partial<UseCacheResult<FakeRaw>> = {}): UseCacheResult<FakeRaw> {
  return {
    data: RAW,
    isLoading: false,
    isRefreshing: false,
    isFailed: false,
    isDemoFallback: false,
    consecutiveFailures: 0,
    lastRefresh: null,
    refetch: async () => {},
    ...overrides,
  }
}

const identityT = ((key: string) => key) as unknown as CardTFunction

describe('useCardShell', () => {
  beforeEach(() => {
    mockUseDemoMode.mockReset().mockReturnValue({ isDemoMode: false })
    mockUseGlobalFilters.mockReset().mockReturnValue({ selectedClusters: [] })
    mockUseTranslation.mockReset().mockReturnValue({ t: identityT })
  })

  it('wires the status hook through to rows, raw and card state', () => {
    const useStatus = () => statusResult()
    const { result } = renderHook(() =>
      useCardShell<FakeRaw, FakeRow>({ useStatus, toRows, hasAnyData }),
    )

    expect(result.current.raw).toBe(RAW)
    expect(result.current.rows.map(r => r.id)).toEqual(['east/a', 'west/b', 'east/c'])
    expect(result.current.card.totalItems).toBe(3)
    expect(result.current.showSkeleton).toBe(false)
    expect(result.current.showEmptyState).toBe(false)
    expect(result.current.isDemoData).toBe(false)
    expect(result.current.t).toBe(identityT)
  })

  it('defaults translation namespaces to cards + common', () => {
    renderHook(() => useCardShell<FakeRaw, FakeRow>({ useStatus: () => statusResult(), toRows, hasAnyData }))
    expect(mockUseTranslation).toHaveBeenCalledWith(['cards', 'common'])
  })

  it('honours a custom translation namespace', () => {
    renderHook(() =>
      useCardShell<FakeRaw, FakeRow>({
        useStatus: () => statusResult(),
        toRows,
        hasAnyData,
        translationNs: 'cards',
      }),
    )
    expect(mockUseTranslation).toHaveBeenCalledWith('cards')
  })

  it('applies the global cluster selector to rows and card items', () => {
    mockUseGlobalFilters.mockReturnValue({ selectedClusters: ['east'] })
    const { result } = renderHook(() =>
      useCardShell<FakeRaw, FakeRow>({ useStatus: () => statusResult(), toRows, hasAnyData }),
    )

    expect(result.current.rows.map(r => r.name)).toEqual(['a', 'c'])
    expect(result.current.card.totalItems).toBe(2)
  })

  it('treats isDemoFallback as demo data (required pattern #5)', () => {
    const { result } = renderHook(() =>
      useCardShell<FakeRaw, FakeRow>({
        useStatus: () => statusResult({ data: EMPTY_RAW, isLoading: true, isDemoFallback: true }),
        toRows,
        hasAnyData,
      }),
    )

    expect(result.current.isDemoData).toBe(true)
    expect(result.current.showSkeleton).toBe(false)
    expect(result.current.showEmptyState).toBe(false)
  })

  it('treats explicit demo mode as demo data', () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
    const { result } = renderHook(() =>
      useCardShell<FakeRaw, FakeRow>({
        useStatus: () => statusResult({ data: EMPTY_RAW }),
        toRows,
        hasAnyData,
      }),
    )

    expect(result.current.isDemoData).toBe(true)
    expect(result.current.showEmptyState).toBe(false)
  })

  it('shows the skeleton while the first live load has no data', () => {
    const { result } = renderHook(() =>
      useCardShell<FakeRaw, FakeRow>({
        useStatus: () => statusResult({ data: EMPTY_RAW, isLoading: true }),
        toRows,
        hasAnyData,
      }),
    )

    expect(result.current.showSkeleton).toBe(true)
    expect(result.current.showEmptyState).toBe(false)
  })

  it('shows the empty state once loading finishes with no data', () => {
    const { result } = renderHook(() =>
      useCardShell<FakeRaw, FakeRow>({
        useStatus: () => statusResult({ data: EMPTY_RAW }),
        toRows,
        hasAnyData,
      }),
    )

    expect(result.current.showSkeleton).toBe(false)
    expect(result.current.showEmptyState).toBe(true)
    expect(result.current.rows).toEqual([])
  })

  it('forwards cardOptions to useCardData', () => {
    const { result } = renderHook(() =>
      useCardShell<FakeRaw, FakeRow, 'name'>({
        useStatus: () => statusResult(),
        toRows,
        hasAnyData,
        cardOptions: {
          defaultLimit: 2,
          sort: { defaultField: 'name', defaultDirection: 'desc' },
        },
      }),
    )

    expect(result.current.card.itemsPerPage).toBe(2)
    expect(result.current.card.sorting.sortBy).toBe('name')
    expect(result.current.card.sorting.sortDirection).toBe('desc')
    expect(result.current.card.items.map(r => r.name)).toEqual(['c', 'b'])
    expect(result.current.card.needsPagination).toBe(true)
  })

  it('passes t into the row mapper', () => {
    const upperT = ((key: string) => key.toUpperCase()) as unknown as CardTFunction
    mockUseTranslation.mockReturnValue({ t: upperT })
    const { result } = renderHook(() =>
      useCardShell<FakeRaw, FakeRow>({ useStatus: () => statusResult(), toRows, hasAnyData }),
    )

    expect(result.current.rows[0].id).toBe('east/A')
  })

  it('keeps row identity stable across re-renders with unchanged inputs', () => {
    const status = statusResult()
    const { result, rerender } = renderHook(() =>
      useCardShell<FakeRaw, FakeRow>({ useStatus: () => status, toRows, hasAnyData }),
    )
    const first = result.current.rows
    rerender()
    expect(result.current.rows).toBe(first)
  })
})
