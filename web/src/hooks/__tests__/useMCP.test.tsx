import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useClusters } from '../useMCP'

describe('useClusters', () => {
  it('returns an idle default state for marketplace cards', () => {
    const { result } = renderHook(() => useClusters())

    expect(result.current.clusters).toEqual([])
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('exposes a refetch function that resolves without throwing', async () => {
    const { result } = renderHook(() => useClusters())

    await expect(result.current.refetch()).resolves.toBeUndefined()
  })
})
