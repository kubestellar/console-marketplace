import { describe, it, expect } from 'vitest'
import { AlertTriangle, CheckCircle, Clock, Play, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  DEFAULT_STATUS_COLOR,
  DEFAULT_STATUS_ICON,
  getStatusColor,
  getStatusIcon,
} from './statusVocabulary'

const DEFAULT_STATUSES = [
  'succeeded',
  'healthy',
  'failed',
  'error',
  'running',
  'active',
  'pending',
] as const

describe('DEFAULT_STATUS_ICON / DEFAULT_STATUS_COLOR maps', () => {
  it('exposes the documented status keys on both maps', () => {
    expect(Object.keys(DEFAULT_STATUS_ICON).sort()).toEqual([...DEFAULT_STATUSES].sort())
    expect(Object.keys(DEFAULT_STATUS_COLOR).sort()).toEqual([...DEFAULT_STATUSES].sort())
  })

  it('pairs each status with the canonical lucide icon', () => {
    const expected: Record<(typeof DEFAULT_STATUSES)[number], LucideIcon> = {
      succeeded: CheckCircle,
      healthy: CheckCircle,
      failed: XCircle,
      error: XCircle,
      running: Play,
      active: Play,
      pending: Clock,
    }
    for (const status of DEFAULT_STATUSES) {
      expect(DEFAULT_STATUS_ICON[status]).toBe(expected[status])
    }
  })

  it('pairs each status with a color key served by the shared colorClasses maps', () => {
    const expected: Record<(typeof DEFAULT_STATUSES)[number], string> = {
      succeeded: 'green',
      healthy: 'green',
      failed: 'red',
      error: 'red',
      running: 'blue',
      active: 'blue',
      pending: 'yellow',
    }
    for (const status of DEFAULT_STATUSES) {
      expect(DEFAULT_STATUS_COLOR[status]).toBe(expected[status])
    }
  })
})

describe('getStatusIcon', () => {
  it('returns the canonical default icon for every documented status', () => {
    for (const status of DEFAULT_STATUSES) {
      expect(getStatusIcon(status)).toBe(DEFAULT_STATUS_ICON[status])
    }
  })

  it('falls back to AlertTriangle for an unknown status and for the empty string', () => {
    expect(getStatusIcon('purple')).toBe(AlertTriangle)
    expect(getStatusIcon('')).toBe(AlertTriangle)
  })

  it('lets an override take precedence over the default for the same status', () => {
    const override = { succeeded: XCircle } as const
    expect(getStatusIcon('succeeded', override)).toBe(XCircle)
  })

  it('falls through to the default when the override does not name the status', () => {
    const override = { unrelated: XCircle } as const
    expect(getStatusIcon('healthy', override)).toBe(CheckCircle)
  })

  it('lets an override supply an icon for a status the defaults do not know', () => {
    const override = { archived: Clock } as const
    expect(getStatusIcon('archived', override)).toBe(Clock)
  })

  it('falls back to AlertTriangle when neither override nor defaults know the status', () => {
    const override = { archived: Clock } as const
    expect(getStatusIcon('nonsense', override)).toBe(AlertTriangle)
  })
})

describe('getStatusColor', () => {
  it('returns the canonical default color for every documented status', () => {
    for (const status of DEFAULT_STATUSES) {
      expect(getStatusColor(status)).toBe(DEFAULT_STATUS_COLOR[status])
    }
  })

  it('falls back to orange for an unknown status and for the empty string', () => {
    expect(getStatusColor('purple')).toBe('orange')
    expect(getStatusColor('')).toBe('orange')
  })

  it('lets an override take precedence over the default for the same status', () => {
    expect(getStatusColor('succeeded', { succeeded: 'red' })).toBe('red')
  })

  it('falls through to the default when the override does not name the status', () => {
    expect(getStatusColor('healthy', { unrelated: 'red' })).toBe('green')
  })

  it('lets an override supply a color for a status the defaults do not know', () => {
    expect(getStatusColor('archived', { archived: 'gray' })).toBe('gray')
  })

  it('falls back to orange when neither override nor defaults know the status', () => {
    expect(getStatusColor('nonsense', { archived: 'gray' })).toBe('orange')
  })
})
