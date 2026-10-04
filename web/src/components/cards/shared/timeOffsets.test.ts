import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ONE_SECOND_MS,
  ONE_MINUTE_MS,
  FIVE_MINUTES_MS,
  FIFTEEN_MINUTES_MS,
  ONE_HOUR_MS,
  THREE_HOURS_MS,
  SIX_HOURS_MS,
  TWELVE_HOURS_MS,
  ONE_DAY_MS,
  secondsAgoIso,
  minutesAgoIso,
  hoursAgoIso,
  daysAgoIso,
} from './timeOffsets'

/**
 * Tests for the shared time-offset constants and relative-timestamp helpers
 * introduced to eliminate duplicated `Date.now() - N * unit * 1000` magic
 * numbers across card demoData files. These helpers had no direct unit tests
 * before this file was added, even though every card's demo data depends on
 * their exact multiplier semantics.
 */

describe('shared/timeOffsets constants', () => {
  it('composes each larger unit from the ONE_SECOND_MS base', () => {
    expect(ONE_SECOND_MS).toBe(1000)
    expect(ONE_MINUTE_MS).toBe(60 * 1000)
    expect(ONE_HOUR_MS).toBe(60 * 60 * 1000)
    expect(ONE_DAY_MS).toBe(24 * 60 * 60 * 1000)
  })

  it('composes named multiples from the ONE_MINUTE_MS / ONE_HOUR_MS bases', () => {
    expect(FIVE_MINUTES_MS).toBe(5 * ONE_MINUTE_MS)
    expect(FIFTEEN_MINUTES_MS).toBe(15 * ONE_MINUTE_MS)
    expect(THREE_HOURS_MS).toBe(3 * ONE_HOUR_MS)
    expect(SIX_HOURS_MS).toBe(6 * ONE_HOUR_MS)
    expect(TWELVE_HOURS_MS).toBe(12 * ONE_HOUR_MS)
  })

  it('orders the unit ladder strictly increasing', () => {
    const ladder = [
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
    for (let i = 1; i < ladder.length; i++) {
      expect(ladder[i]).toBeGreaterThan(ladder[i - 1])
    }
  })
})

describe('shared/timeOffsets relative-timestamp helpers', () => {
  const NOW = new Date('2026-06-15T12:00:00.000Z').getTime()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('secondsAgoIso subtracts n * ONE_SECOND_MS from Date.now', () => {
    expect(secondsAgoIso(0)).toBe(new Date(NOW).toISOString())
    expect(secondsAgoIso(30)).toBe(new Date(NOW - 30 * ONE_SECOND_MS).toISOString())
  })

  it('minutesAgoIso subtracts n * ONE_MINUTE_MS from Date.now', () => {
    expect(minutesAgoIso(0)).toBe(new Date(NOW).toISOString())
    expect(minutesAgoIso(5)).toBe(new Date(NOW - FIVE_MINUTES_MS).toISOString())
    expect(minutesAgoIso(15)).toBe(new Date(NOW - FIFTEEN_MINUTES_MS).toISOString())
  })

  it('hoursAgoIso subtracts n * ONE_HOUR_MS from Date.now', () => {
    expect(hoursAgoIso(1)).toBe(new Date(NOW - ONE_HOUR_MS).toISOString())
    expect(hoursAgoIso(3)).toBe(new Date(NOW - THREE_HOURS_MS).toISOString())
    expect(hoursAgoIso(6)).toBe(new Date(NOW - SIX_HOURS_MS).toISOString())
    expect(hoursAgoIso(12)).toBe(new Date(NOW - TWELVE_HOURS_MS).toISOString())
  })

  it('daysAgoIso subtracts n * ONE_DAY_MS from Date.now', () => {
    expect(daysAgoIso(1)).toBe(new Date(NOW - ONE_DAY_MS).toISOString())
    expect(daysAgoIso(7)).toBe(new Date(NOW - 7 * ONE_DAY_MS).toISOString())
  })

  it('returns a valid ISO-8601 UTC timestamp for each helper', () => {
    const iso8601Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    expect(secondsAgoIso(1)).toMatch(iso8601Z)
    expect(minutesAgoIso(1)).toMatch(iso8601Z)
    expect(hoursAgoIso(1)).toMatch(iso8601Z)
    expect(daysAgoIso(1)).toMatch(iso8601Z)
  })

  it('accepts fractional n and preserves millisecond precision', () => {
    expect(secondsAgoIso(0.5)).toBe(new Date(NOW - 500).toISOString())
    expect(minutesAgoIso(0.5)).toBe(new Date(NOW - ONE_MINUTE_MS / 2).toISOString())
  })

  it('treats negative n as a timestamp in the future (helpers do not clamp)', () => {
    expect(secondsAgoIso(-10)).toBe(new Date(NOW + 10 * ONE_SECOND_MS).toISOString())
  })

  it('reads Date.now() on each call so results shift with the clock', () => {
    const first = secondsAgoIso(0)
    vi.setSystemTime(NOW + ONE_MINUTE_MS)
    const second = secondsAgoIso(0)
    expect(second).not.toBe(first)
    expect(second).toBe(new Date(NOW + ONE_MINUTE_MS).toISOString())
  })
})
