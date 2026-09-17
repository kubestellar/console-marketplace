import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useClusters } from './useMCP'

describe('useClusters (marketplace stub)', () => {
  it('returns an empty, non-loading, non-error snapshot', () => {
    const { result } = renderHook(() => useClusters())

    expect(result.current).toMatchObject({
      clusters: [],
      isLoading: false,
      error: null,
    })
    expect(typeof result.current.refetch).toBe('function')
  })

  it('returns the same shared empty clusters array across calls (no per-render allocation)', () => {
    const { result: first } = renderHook(() => useClusters())
    const { result: second } = renderHook(() => useClusters())

    // The stub uses a module-level EMPTY_CLUSTERS constant; both hook calls
    // must observe the same reference so React's default identity checks
    // do not spuriously re-run downstream consumers.
    expect(first.current.clusters).toBe(second.current.clusters)
  })

  it('refetch resolves without throwing (stub is a no-op)', async () => {
    const { result } = renderHook(() => useClusters())
    await expect(result.current.refetch()).resolves.toBeUndefined()
  })
})
