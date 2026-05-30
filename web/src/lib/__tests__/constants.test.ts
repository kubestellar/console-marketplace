import { describe, expect, it } from 'vitest'

import { FETCH_DEFAULT_TIMEOUT_MS } from '../constants'

describe('constants', () => {
  it('defines the default fetch timeout as a positive number', () => {
    expect(FETCH_DEFAULT_TIMEOUT_MS).toBeTypeOf('number')
    expect(FETCH_DEFAULT_TIMEOUT_MS).toBeGreaterThan(0)
  })

  it('keeps the timeout value stable for request helpers', () => {
    expect(Number.isInteger(FETCH_DEFAULT_TIMEOUT_MS)).toBe(true)
    expect(FETCH_DEFAULT_TIMEOUT_MS).toBe(5000)
  })
})
