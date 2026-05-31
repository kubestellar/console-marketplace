import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useClusters } from '../useMCP'

describe('useClusters', () => {
  it('returns marketplace-safe idle defaults', () => {
    const { result } = renderHook(() => useClusters())

    expect(result.current).toEqual({
      clusters: [],
      isLoading: false,
      error: null,
      refetch: expect.any(Function),
    })
  })

  it('reuses the shared empty cluster list across hook calls', () => {
    const first = renderHook(() => useClusters())
    const second = renderHook(() => useClusters())

    expect(first.result.current.clusters).toBe(second.result.current.clusters)
    expect(first.result.current.clusters).toHaveLength(0)
  })

  it('keeps the hook idle after refetch completes', async () => {
    const { result, rerender } = renderHook(() => useClusters())

    await expect(result.current.refetch()).resolves.toBeUndefined()
    rerender()

    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.clusters).toEqual([])
  })
})
