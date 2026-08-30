import { describe, expect, it } from 'vitest'

import { useClusters } from '../useMCP'

describe('useClusters (marketplace MCP stub)', () => {
  it('returns an empty cluster list plus idle loading/error flags', () => {
    const value = useClusters()
    expect(value.clusters).toEqual([])
    expect(value.isLoading).toBe(false)
    expect(value.error).toBeNull()
    expect(typeof value.refetch).toBe('function')
  })

  it('returns the same EMPTY_CLUSTERS reference on every call (no per-render allocation)', () => {
    const a = useClusters()
    const b = useClusters()
    expect(a.clusters).toBe(b.clusters)
  })

  it('refetch resolves without throwing', async () => {
    const value = useClusters()
    await expect(value.refetch()).resolves.toBeUndefined()
  })
})
