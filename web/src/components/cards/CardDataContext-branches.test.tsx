import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useCardLoadingState } from './CardDataContext'

/**
 * Branch-coverage tests for useCardLoadingState.
 *
 * The existing CardDataContext.test.tsx only asserts the default-argument
 * case. Every card component under web/src/components/cards/<name>/index.tsx
 * relies on this hook to decide skeleton vs. empty-state vs. content
 * rendering, so a template regression that inverted one of the boolean-AND
 * branches — e.g. accidentally dropping the `!isDemoData` guard — would
 * cause every card to either flash a skeleton in demo mode or never show
 * its empty-state slot.
 *
 * These tests enumerate the 2^3 truth table of (isLoading, hasAnyData,
 * isDemoData) plus the isRefreshing passthrough, so every branch flip is
 * pinned.
 */
describe('useCardLoadingState — branch coverage', () => {
  describe('showSkeleton = isLoading && !hasAnyData && !isDemoData', () => {
    it('true when isLoading and no data and not demo', () => {
      const { result } = renderHook(() =>
        useCardLoadingState({ isLoading: true, hasAnyData: false, isDemoData: false }),
      )
      expect(result.current.showSkeleton).toBe(true)
    })

    it('false when isLoading but demo data is available', () => {
      // A card in demo mode with mock data should never flash a skeleton —
      // it already has something meaningful to render immediately.
      const { result } = renderHook(() =>
        useCardLoadingState({ isLoading: true, hasAnyData: false, isDemoData: true }),
      )
      expect(result.current.showSkeleton).toBe(false)
    })

    it('false when isLoading but data is already present', () => {
      // Background refresh with previous data: keep the previous view; do
      // NOT drop it back to a skeleton.
      const { result } = renderHook(() =>
        useCardLoadingState({ isLoading: true, hasAnyData: true, isDemoData: false }),
      )
      expect(result.current.showSkeleton).toBe(false)
    })

    it('false when not loading, regardless of other flags', () => {
      const { result } = renderHook(() =>
        useCardLoadingState({ isLoading: false, hasAnyData: false, isDemoData: false }),
      )
      expect(result.current.showSkeleton).toBe(false)
    })
  })

  describe('showEmptyState = !isLoading && !hasAnyData && !isDemoData', () => {
    it('true when settled with no data and not demo', () => {
      const { result } = renderHook(() =>
        useCardLoadingState({ isLoading: false, hasAnyData: false, isDemoData: false }),
      )
      expect(result.current.showEmptyState).toBe(true)
    })

    it('false when isLoading (still might resolve into data)', () => {
      const { result } = renderHook(() =>
        useCardLoadingState({ isLoading: true, hasAnyData: false, isDemoData: false }),
      )
      expect(result.current.showEmptyState).toBe(false)
    })

    it('false when demo data is available (there IS something to show)', () => {
      const { result } = renderHook(() =>
        useCardLoadingState({ isLoading: false, hasAnyData: false, isDemoData: true }),
      )
      expect(result.current.showEmptyState).toBe(false)
    })

    it('false when real data is already present', () => {
      const { result } = renderHook(() =>
        useCardLoadingState({ isLoading: false, hasAnyData: true, isDemoData: false }),
      )
      expect(result.current.showEmptyState).toBe(false)
    })
  })

  describe('mutual exclusion between skeleton and empty state', () => {
    // For every combination in the (isLoading, hasAnyData, isDemoData) cube,
    // at most one of showSkeleton / showEmptyState should be true — never both.
    const truthTable: Array<[boolean, boolean, boolean]> = [
      [false, false, false],
      [false, false, true],
      [false, true, false],
      [false, true, true],
      [true, false, false],
      [true, false, true],
      [true, true, false],
      [true, true, true],
    ]

    for (const [isLoading, hasAnyData, isDemoData] of truthTable) {
      it(`never sets both true for isLoading=${isLoading}, hasAnyData=${hasAnyData}, isDemoData=${isDemoData}`, () => {
        const { result } = renderHook(() =>
          useCardLoadingState({ isLoading, hasAnyData, isDemoData }),
        )
        const both = result.current.showSkeleton && result.current.showEmptyState
        expect(both).toBe(false)
      })
    }
  })

  describe('passthrough fields', () => {
    it('propagates isRefreshing verbatim (true)', () => {
      const { result } = renderHook(() =>
        useCardLoadingState({ isRefreshing: true }),
      )
      expect(result.current.isRefreshing).toBe(true)
    })

    it('propagates isRefreshing verbatim (false)', () => {
      const { result } = renderHook(() =>
        useCardLoadingState({ isRefreshing: false }),
      )
      expect(result.current.isRefreshing).toBe(false)
    })

    it('exposes hasAnyData as hasData', () => {
      const t = renderHook(() => useCardLoadingState({ hasAnyData: true }))
      expect(t.result.current.hasData).toBe(true)

      const f = renderHook(() => useCardLoadingState({ hasAnyData: false }))
      expect(f.result.current.hasData).toBe(false)
    })
  })

  describe('option handling', () => {
    it('treats a nil opts argument as full-defaults', () => {
      // Guards against a regression from `opts ?? {}` to `opts || {}` where
      // callers passing `null` would silently crash on property access.
      const { result: r1 } = renderHook(() => useCardLoadingState(undefined))
      expect(r1.current).toEqual({
        showSkeleton: false,
        showEmptyState: false,
        hasData: true,
        isRefreshing: false,
      })
    })

    it('ignores unknown/extra opts fields without crashing', () => {
      // The hook accepts several optional fields that are not currently
      // consumed (isFailed, consecutiveFailures, lastRefresh). A regression
      // that started reading undeclared paths would surface here.
      const opts = {
        isLoading: false,
        hasAnyData: true,
        isFailed: true,
        consecutiveFailures: 7,
        lastRefresh: new Date('2025-01-01T00:00:00Z'),
      }
      const { result } = renderHook(() => useCardLoadingState(opts))
      expect(result.current).toEqual({
        showSkeleton: false,
        showEmptyState: false,
        hasData: true,
        isRefreshing: false,
      })
    })
  })
})
