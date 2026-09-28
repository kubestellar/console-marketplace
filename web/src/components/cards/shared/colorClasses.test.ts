import { describe, it, expect } from 'vitest'
import { ICON_COLOR_CLASS, BADGE_COLOR_CLASS } from './colorClasses'

const EXPECTED_KEYS = ['green', 'red', 'blue', 'yellow', 'gray', 'orange'] as const

describe('colorClasses maps', () => {
  it('exposes the documented status color keys on ICON_COLOR_CLASS', () => {
    expect(Object.keys(ICON_COLOR_CLASS).sort()).toEqual([...EXPECTED_KEYS].sort())
  })

  it('exposes the documented status color keys on BADGE_COLOR_CLASS', () => {
    expect(Object.keys(BADGE_COLOR_CLASS).sort()).toEqual([...EXPECTED_KEYS].sort())
  })

  it('provides an `orange` fallback so `map[color] ?? map.orange` never resolves undefined', () => {
    expect(ICON_COLOR_CLASS.orange).toBe('text-orange-400')
    expect(BADGE_COLOR_CLASS.orange).toBe('bg-orange-500/20 text-orange-400')
  })

  it('every ICON_COLOR_CLASS value is a single static Tailwind text-* class token', () => {
    for (const color of EXPECTED_KEYS) {
      const value = ICON_COLOR_CLASS[color]
      expect(value).toMatch(/^text-[a-z]+-\d{2,3}$/)
      expect(value.split(/\s+/)).toHaveLength(1)
      expect(value).toContain(color)
    }
  })

  it('every BADGE_COLOR_CLASS value is a static bg-*/opacity + text-* pair keyed by its color', () => {
    for (const color of EXPECTED_KEYS) {
      const value = BADGE_COLOR_CLASS[color]
      const tokens = value.split(/\s+/)
      expect(tokens).toHaveLength(2)
      const [bg, text] = tokens
      expect(bg).toMatch(new RegExp(`^bg-${color}-\\d{2,3}/\\d+$`))
      expect(text).toMatch(new RegExp(`^text-${color}-\\d{2,3}$`))
    }
  })

  it('never emits dynamically-composed class strings (guards the Tailwind JIT contract)', () => {
    for (const map of [ICON_COLOR_CLASS, BADGE_COLOR_CLASS]) {
      for (const value of Object.values(map)) {
        expect(value).not.toContain('${')
        expect(value).not.toContain('`')
      }
    }
  })

  it('unknown status colors resolve to `undefined` so callers must use the `?? orange` fallback', () => {
    expect(ICON_COLOR_CLASS['purple']).toBeUndefined()
    expect(ICON_COLOR_CLASS['']).toBeUndefined()
    expect(BADGE_COLOR_CLASS['purple']).toBeUndefined()
    expect(BADGE_COLOR_CLASS['']).toBeUndefined()
  })
})
