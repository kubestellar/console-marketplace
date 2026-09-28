/**
 * Direct unit tests for `ItemRow` in the Kubeflow status card.
 *
 * Prior to this file, the pure switch/formatter helpers embedded in
 * `ItemRow.tsx` — `getStatusIcon`, `getStatusColor`, `getCategoryIcon`,
 * `getCategoryLabel`, and `formatTime` — were exercised only transitively
 * through the parent `KubeflowStatus` render tests (see
 * `KubeflowStatus.default-branches.test.tsx`). That is a drift-guard gap:
 * a refactor that renames a translation key, swaps an icon, drops a
 * status arm, or changes the relative-time thresholds can pass the
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
import { ICON_COLOR_CLASS, BADGE_COLOR_CLASS } from '../shared/colorClasses'
import type { KubeflowDisplayItem } from './types'

const NOW = new Date('2026-06-01T12:00:00.000Z')
const MS_PER_MINUTE = 60_000
const MS_PER_HOUR = 60 * MS_PER_MINUTE
const MS_PER_DAY = 24 * MS_PER_HOUR

function makeItem(
  overrides: Partial<KubeflowDisplayItem> = {},
): KubeflowDisplayItem {
  return {
    id: 'row-1',
    name: 'workload-a',
    namespace: 'kubeflow',
    cluster: 'gke-prod',
    category: 'pipeline',
    status: 'running',
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

describe('Kubeflow ItemRow — status → icon color class', () => {
  const cases: Array<{ status: string; color: keyof typeof ICON_COLOR_CLASS }> = [
    { status: 'succeeded', color: 'green' },
    { status: 'healthy', color: 'green' },
    { status: 'failed', color: 'red' },
    { status: 'error', color: 'red' },
    { status: 'running', color: 'blue' },
    { status: 'active', color: 'blue' },
    { status: 'building', color: 'blue' },
    { status: 'pending', color: 'yellow' },
    { status: 'created', color: 'yellow' },
    { status: 'unknown-status', color: 'orange' },
  ]

  it.each(cases)(
    'applies the $color icon class for status "$status"',
    ({ status, color }) => {
      const { container } = render(
        <ItemRow item={makeItem({ status, name: `n-${status}` })} />,
      )
      const iconEls = container.querySelectorAll(`.${ICON_COLOR_CLASS[color]}`)
      expect(iconEls.length).toBeGreaterThan(0)
    },
  )
})

describe('Kubeflow ItemRow — status → badge color class', () => {
  const cases: Array<{ status: string; color: keyof typeof BADGE_COLOR_CLASS }> = [
    { status: 'succeeded', color: 'green' },
    { status: 'failed', color: 'red' },
    { status: 'building', color: 'blue' },
    { status: 'created', color: 'yellow' },
    { status: 'totally-bogus', color: 'orange' },
  ]

  it.each(cases)(
    'applies the $color badge class for status "$status"',
    ({ status, color }) => {
      render(<ItemRow item={makeItem({ status, name: `b-${status}` })} />)
      const badge = screen.getAllByText(status)[0]
      for (const token of BADGE_COLOR_CLASS[color].split(' ')) {
        expect(badge.className).toContain(token)
      }
    },
  )
})

describe('Kubeflow ItemRow — failed-like row styling and AI actions', () => {
  it.each(['failed', 'error', 'degraded'])(
    'renders CardAIActions for status "%s"',
    status => {
      render(<ItemRow item={makeItem({ status, name: `fail-${status}` })} />)
      expect(screen.getByTestId('itemrow-ai-actions')).toBeTruthy()
    },
  )

  it('renders the red container background only for failed/error (not degraded)', () => {
    // The outer container uses the red background only when status is
    // 'failed' or 'error' — pin that narrower predicate against the
    // broader AI-actions predicate above.
    const failed = render(<ItemRow item={makeItem({ status: 'failed' })} />)
    expect(
      (failed.container.firstElementChild as HTMLElement).className,
    ).toContain('bg-red-500/10')
    failed.unmount()

    const degraded = render(<ItemRow item={makeItem({ status: 'degraded' })} />)
    expect(
      (degraded.container.firstElementChild as HTMLElement).className,
    ).not.toContain('bg-red-500/10')
  })

  it('does NOT render CardAIActions for a healthy row', () => {
    render(<ItemRow item={makeItem({ status: 'succeeded' })} />)
    expect(screen.queryByTestId('itemrow-ai-actions')).toBeNull()
  })

  it('passes the resolved category label + row identity to CardAIActions', () => {
    render(
      <ItemRow
        item={makeItem({
          status: 'failed',
          category: 'notebook',
          name: 'jupyter-lab-01',
        })}
      />,
    )
    const el = screen.getByTestId('itemrow-ai-actions')
    expect(el.getAttribute('data-kind')).toBe('kubeflowStatus.notebook')
    expect(el.getAttribute('data-name')).toBe('jupyter-lab-01')
    expect(el.getAttribute('data-status')).toBe('failed')
  })
})

describe('Kubeflow ItemRow — category labels', () => {
  const cases: Array<{
    category: KubeflowDisplayItem['category']
    label: string
  }> = [
    { category: 'pipeline', label: 'kubeflowStatus.pipelineRun' },
    { category: 'experiment', label: 'kubeflowStatus.experiment' },
    { category: 'notebook', label: 'kubeflowStatus.notebook' },
    { category: 'training', label: 'kubeflowStatus.trainingJob' },
  ]

  it.each(cases)(
    'renders the "$label" translation key for category "$category"',
    ({ category, label }) => {
      render(<ItemRow item={makeItem({ category, name: `c-${category}` })} />)
      expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    },
  )
})

describe('Kubeflow ItemRow — formatTime relative-time arms', () => {
  it('renders whole minutes for a sub-hour timestamp', () => {
    const ts = new Date(NOW.getTime() - 5 * MS_PER_MINUTE).toISOString()
    render(<ItemRow item={makeItem({ timestamp: ts })} />)
    expect(screen.getByText(/^5m /)).toBeTruthy()
  })

  it('rounds tiny sub-minute offsets up to at least 1m (Math.max guard)', () => {
    // Unlike OpenKruise, kubeflow's formatTime has no `<1m` short-circuit —
    // it collapses everything under an hour into `Math.max(1, floor(diff/60000))m`.
    const ts = new Date(NOW.getTime() - 10 * 1000).toISOString()
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

describe('Kubeflow ItemRow — presentational surface', () => {
  it('renders the cluster badge when a cluster is present', () => {
    render(<ItemRow item={makeItem({ cluster: 'aks-eu-west' })} />)
    expect(screen.getByTestId('itemrow-cluster-badge').textContent).toBe(
      'aks-eu-west',
    )
  })

  it('omits the cluster badge when cluster is an empty string', () => {
    render(<ItemRow item={makeItem({ cluster: '' })} />)
    expect(screen.queryByTestId('itemrow-cluster-badge')).toBeNull()
  })

  it('renders the primary detail and the secondary detail when set', () => {
    render(
      <ItemRow
        item={makeItem({
          primaryDetail: 'step 3/8',
          secondaryDetail: 'age 12m',
        })}
      />,
    )
    expect(screen.getByText('step 3/8')).toBeTruthy()
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
    const spans = Array.from(container.querySelectorAll('span'))
    expect(
      spans.some(s => s.className.includes('text-muted-foreground/70')),
    ).toBe(false)
  })
})
