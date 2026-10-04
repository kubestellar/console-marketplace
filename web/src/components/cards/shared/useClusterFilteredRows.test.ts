import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useClusterFilteredRows } from './useClusterFilteredRows'

/**
 * Tests for the shared `useClusterFilteredRows` hook that consolidates the
 * `globalFiltered` memo previously duplicated across the status cards. The
 * source file documents the contract:
 *   1. When no clusters are selected (null / undefined / empty array), return
 *      `rows` unchanged and preserve reference identity.
 *   2. Otherwise, keep only rows whose `cluster` is in `selectedClusters`.
 *   3. The result is memoised on `[rows, selectedClusters]` identity, so
 *      re-rendering with the same references returns the same array reference.
 */

type Row = { cluster: string; id: number }

const rows: Row[] = [
  { cluster: 'east', id: 1 },
  { cluster: 'west', id: 2 },
  { cluster: 'east', id: 3 },
  { cluster: 'south', id: 4 },
]

describe('useClusterFilteredRows', () => {
  it('returns the original rows array (same reference) when selectedClusters is null', () => {
    const { result } = renderHook(() => useClusterFilteredRows(rows, null))
    expect(result.current).toBe(rows)
  })

  it('returns the original rows array (same reference) when selectedClusters is undefined', () => {
    const { result } = renderHook(() => useClusterFilteredRows(rows, undefined))
    expect(result.current).toBe(rows)
  })

  it('returns the original rows array (same reference) when selectedClusters is empty', () => {
    const { result } = renderHook(() => useClusterFilteredRows(rows, []))
    expect(result.current).toBe(rows)
  })

  it('filters rows to those whose cluster is in selectedClusters', () => {
    const { result } = renderHook(() =>
      useClusterFilteredRows(rows, ['east']),
    )
    expect(result.current.map(r => r.id)).toEqual([1, 3])
  })

  it('supports multi-cluster selection and preserves row order', () => {
    const { result } = renderHook(() =>
      useClusterFilteredRows(rows, ['west', 'south']),
    )
    expect(result.current.map(r => r.id)).toEqual([2, 4])
  })

  it('returns an empty array when no row matches the selected clusters', () => {
    const { result } = renderHook(() =>
      useClusterFilteredRows(rows, ['nonexistent']),
    )
    expect(result.current).toEqual([])
  })

  it('handles an empty rows array without crashing', () => {
    const { result } = renderHook(() =>
      useClusterFilteredRows<Row>([], ['east']),
    )
    expect(result.current).toEqual([])
  })

  it('returns the same filtered array reference when neither rows nor selectedClusters change', () => {
    const clusters = ['east']
    const { result, rerender } = renderHook(
      ({ r, c }: { r: Row[]; c: string[] }) => useClusterFilteredRows(r, c),
      { initialProps: { r: rows, c: clusters } },
    )
    const first = result.current
    rerender({ r: rows, c: clusters })
    expect(result.current).toBe(first)
  })

  it('recomputes when selectedClusters reference changes', () => {
    const { result, rerender } = renderHook(
      ({ c }: { c: string[] | null }) => useClusterFilteredRows(rows, c),
      { initialProps: { c: ['east'] as string[] | null } },
    )
    const first = result.current
    rerender({ c: ['west'] })
    expect(result.current).not.toBe(first)
    expect(result.current.map(r => r.id)).toEqual([2])
  })

  it('works with any row type extending { cluster: string }', () => {
    type Extended = { cluster: string; name: string; extra: boolean }
    const extended: Extended[] = [
      { cluster: 'a', name: 'first', extra: true },
      { cluster: 'b', name: 'second', extra: false },
    ]
    const { result } = renderHook(() =>
      useClusterFilteredRows(extended, ['b']),
    )
    expect(result.current).toEqual([{ cluster: 'b', name: 'second', extra: false }])
  })

  it('returns a new array (not the input) when filtering is applied', () => {
    const { result } = renderHook(() => useClusterFilteredRows(rows, ['east']))
    expect(result.current).not.toBe(rows)
  })

  it('recomputes when the rows reference changes', () => {
    const clusters = ['east']
    const { result, rerender } = renderHook(
      ({ r }: { r: Row[] }) => useClusterFilteredRows(r, clusters),
      { initialProps: { r: rows } },
    )
    const first = result.current
    const nextRows: Row[] = [...rows, { cluster: 'east', id: 5 }]
    rerender({ r: nextRows })
    expect(result.current).not.toBe(first)
    expect(result.current.map(r => r.id)).toEqual([1, 3, 5])
  })
})
