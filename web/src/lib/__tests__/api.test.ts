import { beforeEach, describe, expect, it, vi } from 'vitest'

import { authFetch } from '../api'

describe('authFetch', () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mockFetch)
  })

  it('forwards the input and init options to fetch', async () => {
    const response = { ok: true }
    mockFetch.mockResolvedValue(response)

    await expect(authFetch('/api/cards', { method: 'POST' })).resolves.toBe(response)
    expect(mockFetch).toHaveBeenCalledWith('/api/cards', { method: 'POST' })
  })

  it('accepts URL instances as request input', async () => {
    const response = { ok: true }
    const url = new URL('https://example.test/api/cards')
    mockFetch.mockResolvedValue(response)

    await authFetch(url)

    expect(mockFetch).toHaveBeenCalledWith(url, undefined)
  })
})
