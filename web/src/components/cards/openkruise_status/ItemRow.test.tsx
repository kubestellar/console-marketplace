/**
 * Direct unit tests for `ItemRow` in the OpenKruise status card.
 *
 * Prior to this file, the pure switch/formatter helpers embedded in
 * `ItemRow.tsx` — `getStatusIcon`, `getStatusColor`, `getCategoryIcon`,
 * `getCategoryLabel`, and `formatTime` — were exercised only transitively
 * through the parent `OpenKruiseStatus` render tests (see the
 * `OpenKruiseStatus.*-branches.test.tsx` suites). That is a drift-guard
 * gap: a refactor that renames a translation key, swaps an icon, drops
 * a status arm, or changes the relative-time thresholds can pass the
 * integration render tests (which do not assert on those specifics for
 * every arm) while silently breaking the row's per-status/per-category
 * visual contract.
 *
 * These tests pin `ItemRow`'s contract directly, per the per-file
 * "direct sibling test" convention enforced by
 * `scripts/check-card-test-coverage.sh` and documented in issue #797.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('../../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => (
    <span data-testid="itemrow-cluster-badge">{cluster}</span>
  ),
}))

vi.mock('../../../lib/cards/CardComponents', () => ({
  CardAIActions: ({
    resource,
  }: {
    resource: { kind: string; name: string; status: string }
  }) => (
    <div
      data-testid="itemrow-ai-actions"
      data-kind={resource.kind}
      data-name={resource.name}
      data-status={resource.status}
    />
  ),
}))

import { ItemRow } from './ItemRow'
import {
  ICON_COLOR_CLASS,
  BADGE_COLOR_CLASS,
  type OpenKruiseDisplayItem,
} from './types'
import {
  ONE_MINUTE_MS as MS_PER_MINUTE,
  ONE_HOUR_MS as MS_PER_HOUR,
  ONE_DAY_MS as MS_PER_DAY,
} from '../shared/timeOffsets'

const NOW = new Date('2026-06-01T12:00:00.000Z')

function makeItem(
  overrides: Partial<OpenKruiseDisplayItem> = {},
): OpenKruiseDisplayItem {
  return {
    id: 'row-1',
    name: 'workload-a',
    namespace: 'apps',
    cluster: 'gke-prod',
    category: 'cloneset',
    status: 'healthy',
    primaryDetail: 'primary-detail',
    secondaryDetail: 'secondary-detail',
    timestamp: NOW.toISOString(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('OpenKruise ItemRow — status → icon color class', () => {
  const cases: Array<{ status: string; color: keyof typeof ICON_COLOR_CLASS }> = [
    { status: 'succeeded', color: 'green' },
    { status: 'healthy', color: 'green' },
    { status: 'failed', color: 'red' },
    { status: 'error', color: 'red' },
    { status: 'running', color: 'blue' },
    { status: 'active', color: 'blue' },
    { status: 'updating', color: 'yellow' },
    { status: 'pending', color: 'yellow' },
    { status: 'suspended', color: 'gray' },
    { status: 'paused', color: 'gray' },
    { status: 'unknown-status', color: 'orange' },
  ]

  it.each(cases)(
    'applies the $color icon class for status "$status"',
    ({ status, color }) => {
      const { container } = render(
        <ItemRow item={makeItem({ status, name: `n-${status}` })} />,
      )
      // Every ICON_COLOR_CLASS value is a single Tailwind class token.
      const iconEls = container.querySelectorAll(`.${ICON_COLOR_CLASS[color]}`)
      expect(iconEls.length).toBeGreaterThan(0)
    },
  )
})

describe('OpenKruise ItemRow — status → badge color class', () => {
  const cases: Array<{ status: string; color: keyof typeof BADGE_COLOR_CLASS }> = [
    { status: 'succeeded', color: 'green' },
    { status: 'failed', color: 'red' },
    { status: 'running', color: 'blue' },
    { status: 'updating', color: 'yellow' },
    { status: 'suspended', color: 'gray' },
    { status: 'totally-bogus', color: 'orange' },
  ]

  it.each(cases)(
    'applies the $color badge class for status "$status"',
    ({ status, color }) => {
      render(<ItemRow item={makeItem({ status, name: `b-${status}` })} />)
      // Badge span contains the literal status text and carries every
      // class token from BADGE_COLOR_CLASS[color].
      const badge = screen.getAllByText(status)[0]
      const cls = badge.className
      for (const token of BADGE_COLOR_CLASS[color].split(' ')) {
        expect(cls).toContain(token)
      }
    },
  )
})

describe('OpenKruise ItemRow — failed-like row styling and AI actions', () => {
  it.each(['failed', 'error', 'degraded'])(
    'renders CardAIActions and the red container background for status "%s"',
    status => {
      const { container } = render(
        <ItemRow item={makeItem({ status, name: `fail-${status}` })} />,
      )
      expect(screen.getByTestId('itemrow-ai-actions')).toBeTruthy()
      const outer = container.firstElementChild as HTMLElement
      expect(outer.className).toContain('bg-red-500/10')
      expect(outer.className).toContain('border-red-500/20')
    },
  )

  it('does NOT render CardAIActions for a healthy row', () => {
    render(<ItemRow item={makeItem({ status: 'healthy' })} />)
    expect(screen.queryByTestId('itemrow-ai-actions')).toBeNull()
  })

  it('passes the resolved category label + row identity to CardAIActions', () => {
    render(
      <ItemRow
        item={makeItem({
          status: 'failed',
          category: 'cronjob',
          name: 'nightly-batch',
        })}
      />,
    )
    const el = screen.getByTestId('itemrow-ai-actions')
    // t() echoes the key back verbatim (see web/src/test/setup.ts), so the
    // resolved "kind" is the translation key for the Advanced CronJob label.
    expect(el.getAttribute('data-kind')).toBe('openkruiseStatus.advancedCronJob')
    expect(el.getAttribute('data-name')).toBe('nightly-batch')
    expect(el.getAttribute('data-status')).toBe('failed')
  })
})

describe('OpenKruise ItemRow — category labels', () => {
  const cases: Array<{
    category: OpenKruiseDisplayItem['category']
    label: string
  }> = [
    { category: 'cloneset', label: 'openkruiseStatus.cloneSet' },
    { category: 'statefulset', label: 'openkruiseStatus.advancedStatefulSet' },
    { category: 'daemonset', label: 'openkruiseStatus.advancedDaemonSet' },
    { category: 'sidecarset', label: 'openkruiseStatus.sidecarSet' },
    { category: 'broadcastjob', label: 'openkruiseStatus.broadcastJob' },
    { category: 'cronjob', label: 'openkruiseStatus.advancedCronJob' },
  ]

  it.each(cases)(
    'renders the "$label" translation key for category "$category"',
    ({ category, label }) => {
      render(<ItemRow item={makeItem({ category, name: `c-${category}` })} />)
      // Label appears in the visible row text next to the category icon.
      expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    },
  )
})

describe('OpenKruise ItemRow — formatTime relative-time arms', () => {
  it('renders "<1m" for a timestamp less than one minute in the past', () => {
    const ts = new Date(NOW.getTime() - 10 * 1000).toISOString()
    render(<ItemRow item={makeItem({ timestamp: ts })} />)
    expect(screen.getByText(/^<1m /)).toBeTruthy()
  })

  it('renders whole minutes for a timestamp within the hour', () => {
    const ts = new Date(NOW.getTime() - 5 * MS_PER_MINUTE).toISOString()
    render(<ItemRow item={makeItem({ timestamp: ts })} />)
    expect(screen.getByText(/^5m /)).toBeTruthy()
  })

  it('rounds sub-minute-but-not-<1m offsets up to at least 1m', () => {
    // diff is >= 1 minute but < 2 — Math.floor would give 1 anyway, so
    // pick 1 minute exactly to pin the Math.max(1, ...) guard boundary.
    const ts = new Date(NOW.getTime() - MS_PER_MINUTE).toISOString()
    render(<ItemRow item={makeItem({ timestamp: ts })} />)
    expect(screen.getByText(/^1m /)).toBeTruthy()
  })

  it('renders whole hours for a timestamp within the day', () => {
    const ts = new Date(NOW.getTime() - 3 * MS_PER_HOUR).toISOString()
    render(<ItemRow item={makeItem({ timestamp: ts })} />)
    expect(screen.getByText(/^3h /)).toBeTruthy()
  })

  it('renders whole days for a timestamp older than a day', () => {
    const ts = new Date(NOW.getTime() - 2 * MS_PER_DAY).toISOString()
    render(<ItemRow item={makeItem({ timestamp: ts })} />)
    expect(screen.getByText(/^2d /)).toBeTruthy()
  })
})

describe('OpenKruise ItemRow — presentational surface', () => {
  it('renders the cluster badge when a cluster is present', () => {
    render(<ItemRow item={makeItem({ cluster: 'aks-eu-west' })} />)
    const badge = screen.getByTestId('itemrow-cluster-badge')
    expect(badge.textContent).toBe('aks-eu-west')
  })

  it('omits the cluster badge when cluster is an empty string', () => {
    render(<ItemRow item={makeItem({ cluster: '' })} />)
    expect(screen.queryByTestId('itemrow-cluster-badge')).toBeNull()
  })

  it('renders the primary detail and the secondary detail when set', () => {
    render(
      <ItemRow
        item={makeItem({
          primaryDetail: 'ready 3/3',
          secondaryDetail: 'age 12m',
        })}
      />,
    )
    expect(screen.getByText('ready 3/3')).toBeTruthy()
    expect(screen.getByText('age 12m')).toBeTruthy()
  })

  it('omits the secondary detail span when secondaryDetail is empty', () => {
    const { container } = render(
      <ItemRow
        item={makeItem({
          primaryDetail: 'primary-only',
          secondaryDetail: '',
        })}
      />,
    )
    expect(screen.getByText('primary-only')).toBeTruthy()
    // The secondary span carries a distinctive muted-foreground/70 class.
    const spans = Array.from(container.querySelectorAll('span'))
    expect(
      spans.some(s => s.className.includes('text-muted-foreground/70')),
    ).toBe(false)
  })
})
