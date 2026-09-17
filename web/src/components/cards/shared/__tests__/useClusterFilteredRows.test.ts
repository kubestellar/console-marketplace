import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useClusterFilteredRows } from '../useClusterFilteredRows'

interface Row {
  cluster: string
  id: number
}

const rows: Row[] = [
  { cluster: 'cluster-a', id: 1 },
  { cluster: 'cluster-b', id: 2 },
  { cluster: 'cluster-a', id: 3 },
  { cluster: 'cluster-c', id: 4 },
]

describe('useClusterFilteredRows', () => {
  it('returns the input array unchanged when selectedClusters is null', () => {
    const { result } = renderHook(() => useClusterFilteredRows(rows, null))
    expect(result.current).toBe(rows)
  })

  it('returns the input array unchanged when selectedClusters is undefined', () => {
    const { result } = renderHook(() => useClusterFilteredRows(rows, undefined))
    expect(result.current).toBe(rows)
  })

  it('returns the input array unchanged when selectedClusters is empty', () => {
    const { result } = renderHook(() => useClusterFilteredRows(rows, []))
    expect(result.current).toBe(rows)
  })

  it('keeps only rows whose cluster is in selectedClusters (single selection)', () => {
    const { result } = renderHook(() =>
      useClusterFilteredRows(rows, ['cluster-a']),
    )
    expect(result.current).toEqual([
      { cluster: 'cluster-a', id: 1 },
      { cluster: 'cluster-a', id: 3 },
    ])
  })

  it('keeps rows across multiple selected clusters', () => {
    const { result } = renderHook(() =>
      useClusterFilteredRows(rows, ['cluster-a', 'cluster-c']),
    )
    expect(result.current).toEqual([
      { cluster: 'cluster-a', id: 1 },
      { cluster: 'cluster-a', id: 3 },
      { cluster: 'cluster-c', id: 4 },
    ])
  })

  it('preserves the original row order after filtering', () => {
    const { result } = renderHook(() =>
      useClusterFilteredRows(rows, ['cluster-c', 'cluster-a']),
    )
    expect(result.current.map((r) => r.id)).toEqual([1, 3, 4])
  })

  it('returns an empty array when no row matches any selected cluster', () => {
    const { result } = renderHook(() =>
      useClusterFilteredRows(rows, ['cluster-z']),
    )
    expect(result.current).toEqual([])
  })

  it('returns a new array (not the input) when filtering is applied', () => {
    const { result } = renderHook(() =>
      useClusterFilteredRows(rows, ['cluster-a']),
    )
    expect(result.current).not.toBe(rows)
  })

  it('memoizes the result across renders when inputs are identity-stable', () => {
    const stableSelected = ['cluster-a']
    const { result, rerender } = renderHook(
      ({ r, s }: { r: Row[]; s: string[] }) => useClusterFilteredRows(r, s),
      { initialProps: { r: rows, s: stableSelected } },
    )
    const first = result.current
    rerender({ r: rows, s: stableSelected })
    expect(result.current).toBe(first)
  })

  it('recomputes when selectedClusters identity changes', () => {
    const { result, rerender } = renderHook(
      ({ s }: { s: string[] }) => useClusterFilteredRows(rows, s),
      { initialProps: { s: ['cluster-a'] } },
    )
    const first = result.current
    rerender({ s: ['cluster-b'] })
    expect(result.current).not.toBe(first)
    expect(result.current).toEqual([{ cluster: 'cluster-b', id: 2 }])
  })

  it('recomputes when the rows reference changes', () => {
    const selected = ['cluster-a']
    const { result, rerender } = renderHook(
      ({ r }: { r: Row[] }) => useClusterFilteredRows(r, selected),
      { initialProps: { r: rows } },
    )
    const first = result.current
    const nextRows: Row[] = [
      ...rows,
      { cluster: 'cluster-a', id: 5 },
    ]
    rerender({ r: nextRows })
    expect(result.current).not.toBe(first)
    expect(result.current.map((r) => r.id)).toEqual([1, 3, 5])
  })

  it('returns the input unchanged when both inputs are empty', () => {
    const empty: Row[] = []
    const { result } = renderHook(() => useClusterFilteredRows(empty, []))
    expect(result.current).toBe(empty)
  })

  it('works with row types that carry extra fields', () => {
    interface Extra {
      cluster: string
      status: 'ok' | 'warn'
      count: number
    }
    const extra: Extra[] = [
      { cluster: 'c1', status: 'ok', count: 1 },
      { cluster: 'c2', status: 'warn', count: 2 },
    ]
    const { result } = renderHook(() =>
      useClusterFilteredRows(extra, ['c2']),
    )
    expect(result.current).toEqual([
      { cluster: 'c2', status: 'warn', count: 2 },
    ])
  })
})
