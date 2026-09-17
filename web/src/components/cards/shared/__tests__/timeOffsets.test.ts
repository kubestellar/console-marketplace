import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  daysAgoIso,
  FIFTEEN_MINUTES_MS,
  FIVE_MINUTES_MS,
  hoursAgoIso,
  minutesAgoIso,
  ONE_DAY_MS,
  ONE_HOUR_MS,
  ONE_MINUTE_MS,
  ONE_SECOND_MS,
  secondsAgoIso,
  SIX_HOURS_MS,
  THREE_HOURS_MS,
  TWELVE_HOURS_MS,
} from '../timeOffsets'

describe('timeOffsets constants', () => {
  it('defines base units with the expected millisecond values', () => {
    expect(ONE_SECOND_MS).toBe(1000)
    expect(ONE_MINUTE_MS).toBe(60_000)
    expect(ONE_HOUR_MS).toBe(3_600_000)
    expect(ONE_DAY_MS).toBe(86_400_000)
  })

  it('derives multi-unit constants from the base units without drift', () => {
    expect(FIVE_MINUTES_MS).toBe(5 * ONE_MINUTE_MS)
    expect(FIFTEEN_MINUTES_MS).toBe(15 * ONE_MINUTE_MS)
    expect(THREE_HOURS_MS).toBe(3 * ONE_HOUR_MS)
    expect(SIX_HOURS_MS).toBe(6 * ONE_HOUR_MS)
    expect(TWELVE_HOURS_MS).toBe(12 * ONE_HOUR_MS)
    expect(ONE_DAY_MS).toBe(24 * ONE_HOUR_MS)
  })

  it('keeps all offsets strictly increasing so labels stay ordered', () => {
    const ordered = [
      ONE_SECOND_MS,
      ONE_MINUTE_MS,
      FIVE_MINUTES_MS,
      FIFTEEN_MINUTES_MS,
      ONE_HOUR_MS,
      THREE_HOURS_MS,
      SIX_HOURS_MS,
      TWELVE_HOURS_MS,
      ONE_DAY_MS,
    ]
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i]).toBeGreaterThan(ordered[i - 1])
    }
  })
})

describe('timeOffsets *AgoIso helpers', () => {
  const FIXED_NOW = new Date('2026-01-15T12:00:00.000Z').getTime()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('secondsAgoIso subtracts the given seconds from now', () => {
    expect(secondsAgoIso(0)).toBe(new Date(FIXED_NOW).toISOString())
    expect(secondsAgoIso(30)).toBe(
      new Date(FIXED_NOW - 30 * ONE_SECOND_MS).toISOString(),
    )
  })

  it('minutesAgoIso subtracts the given minutes from now', () => {
    expect(minutesAgoIso(1)).toBe(
      new Date(FIXED_NOW - ONE_MINUTE_MS).toISOString(),
    )
    expect(minutesAgoIso(45)).toBe(
      new Date(FIXED_NOW - 45 * ONE_MINUTE_MS).toISOString(),
    )
  })

  it('hoursAgoIso subtracts the given hours from now', () => {
    expect(hoursAgoIso(2)).toBe(
      new Date(FIXED_NOW - 2 * ONE_HOUR_MS).toISOString(),
    )
    expect(hoursAgoIso(24)).toBe(
      new Date(FIXED_NOW - ONE_DAY_MS).toISOString(),
    )
  })

  it('daysAgoIso subtracts the given days from now', () => {
    expect(daysAgoIso(1)).toBe(new Date(FIXED_NOW - ONE_DAY_MS).toISOString())
    expect(daysAgoIso(7)).toBe(
      new Date(FIXED_NOW - 7 * ONE_DAY_MS).toISOString(),
    )
  })

  it('returns valid ISO 8601 strings for every helper', () => {
    const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    expect(secondsAgoIso(10)).toMatch(iso)
    expect(minutesAgoIso(10)).toMatch(iso)
    expect(hoursAgoIso(10)).toMatch(iso)
    expect(daysAgoIso(10)).toMatch(iso)
  })

  it('accepts negative arguments to project timestamps into the future', () => {
    expect(minutesAgoIso(-5)).toBe(
      new Date(FIXED_NOW + 5 * ONE_MINUTE_MS).toISOString(),
    )
    expect(hoursAgoIso(-1)).toBe(
      new Date(FIXED_NOW + ONE_HOUR_MS).toISOString(),
    )
  })

  it('accepts fractional arguments and preserves millisecond precision', () => {
    expect(secondsAgoIso(0.5)).toBe(
      new Date(FIXED_NOW - 500).toISOString(),
    )
    expect(minutesAgoIso(0.25)).toBe(
      new Date(FIXED_NOW - 15 * ONE_SECOND_MS).toISOString(),
    )
  })

  it('reads Date.now() each call so results shift with the clock', () => {
    const first = secondsAgoIso(0)
    vi.setSystemTime(FIXED_NOW + ONE_MINUTE_MS)
    const second = secondsAgoIso(0)
    expect(second).not.toBe(first)
    expect(second).toBe(new Date(FIXED_NOW + ONE_MINUTE_MS).toISOString())
  })
})
