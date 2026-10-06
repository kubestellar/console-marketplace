/**
 * Direct unit tests for the shared `ItemRow` primitive
 * (kubestellar/console-marketplace#842 completion criteria), exercising
 * status overrides, the divergent AI-actions / red-background predicates,
 * `issueBuilder` fallthrough, and `formatRelativeTime` option pass-through.
 *
 * `kubeflow_status/ItemRow.test.tsx` and `openkruise_status/ItemRow.test.tsx`
 * continue to pin each card's rendered contract through its own thin
 * wrapper; this file pins the shared primitive's own contract so a future
 * change to it can't silently break both cards at once.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Play, Clock } from 'lucide-react'

vi.mock('../../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => (
    <span data-testid="itemrow-cluster-badge">{cluster}</span>
  ),
}))

vi.mock('../../../lib/cards/CardComponents', () => ({
  CardAIActions: ({
    resource,
    issues,
  }: {
    resource: { kind: string; name: string; status: string }
    issues: Array<{ name: string; message: string }>
  }) => (
    <div
      data-testid="itemrow-ai-actions"
      data-kind={resource.kind}
      data-name={resource.name}
      data-status={resource.status}
      data-issue-name={issues[0]?.name}
      data-issue-message={issues[0]?.message}
    />
  ),
}))

import { ItemRow } from './ItemRow'
import type { CardDisplayItem } from './CardDisplayItem'

type Category = 'alpha' | 'beta'

function makeItem(
  overrides: Partial<CardDisplayItem<Category>> = {},
): CardDisplayItem<Category> {
  return {
    id: 'row-1',
    name: 'thing-a',
    namespace: 'ns',
    cluster: 'cluster-a',
    category: 'alpha',
    status: 'running',
    primaryDetail: 'primary',
    secondaryDetail: 'secondary',
    timestamp: new Date('2026-06-01T11:55:00.000Z').toISOString(),
    ...overrides,
  }
}

const getCategoryIcon = () => Play
const getCategoryLabel = (category: Category) =>
  category === 'alpha' ? 'Alpha Thing' : 'Beta Thing'
const issueBuilder = (
  item: CardDisplayItem<Category>,
  categoryLabel: string,
) => [{ name: `${categoryLabel} ${item.status}`, message: `msg-${item.status}` }]

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-06-01T12:00:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('shared ItemRow — status overrides', () => {
  it('uses a status icon/color override over the shared default', () => {
    render(
      <ItemRow
        item={makeItem({ status: 'queued' })}
        getCategoryIcon={getCategoryIcon}
        getCategoryLabel={getCategoryLabel}
        statusIconOverrides={{ queued: Clock }}
        statusColorOverrides={{ queued: 'gray' }}
        agoLabel="ago"
        issueBuilder={issueBuilder}
      />,
    )
    const badge = screen.getByText('queued')
    expect(badge.className).toContain('gray')
  })
})

describe('shared ItemRow — unmapped color override falls back to orange classes', () => {
  it('falls back to the orange icon/badge classes for a color key absent from the CSS maps', () => {
    render(
      <ItemRow
        item={makeItem({ status: 'mystery' })}
        getCategoryIcon={getCategoryIcon}
        getCategoryLabel={getCategoryLabel}
        statusColorOverrides={{ mystery: 'teal' }}
        agoLabel="ago"
        issueBuilder={issueBuilder}
      />,
    )
    const badge = screen.getByText('mystery')
    expect(badge.className).toContain('text-orange-400')
    expect(badge.className).toContain('bg-orange-500/20')
  })
})

describe('shared ItemRow — divergent AI-actions / red-background predicates', () => {
  it('can render AI actions for a status while withholding the red background', () => {
    const { container } = render(
      <ItemRow
        item={makeItem({ status: 'degraded' })}
        getCategoryIcon={getCategoryIcon}
        getCategoryLabel={getCategoryLabel}
        agoLabel="ago"
        isRedBackground={status => status === 'failed'}
        issueBuilder={issueBuilder}
      />,
    )
    expect(screen.getByTestId('itemrow-ai-actions')).toBeTruthy()
    expect(
      (container.firstElementChild as HTMLElement).className,
    ).not.toContain('bg-red-500/10')
  })

  it('defaults both predicates to the same failed/error/degraded check', () => {
    const { container } = render(
      <ItemRow
        item={makeItem({ status: 'degraded' })}
        getCategoryIcon={getCategoryIcon}
        getCategoryLabel={getCategoryLabel}
        agoLabel="ago"
        issueBuilder={issueBuilder}
      />,
    )
    expect(screen.getByTestId('itemrow-ai-actions')).toBeTruthy()
    expect(
      (container.firstElementChild as HTMLElement).className,
    ).toContain('bg-red-500/10')
  })

  it('omits AI actions and the red background for a healthy status', () => {
    const { container } = render(
      <ItemRow
        item={makeItem({ status: 'succeeded' })}
        getCategoryIcon={getCategoryIcon}
        getCategoryLabel={getCategoryLabel}
        agoLabel="ago"
        issueBuilder={issueBuilder}
      />,
    )
    expect(screen.queryByTestId('itemrow-ai-actions')).toBeNull()
    expect(
      (container.firstElementChild as HTMLElement).className,
    ).not.toContain('bg-red-500/10')
  })
})

describe('shared ItemRow — issueBuilder', () => {
  it('passes the resolved category label and item through to issueBuilder', () => {
    render(
      <ItemRow
        item={makeItem({ status: 'error', category: 'beta', name: 'thing-b' })}
        getCategoryIcon={getCategoryIcon}
        getCategoryLabel={getCategoryLabel}
        agoLabel="ago"
        issueBuilder={issueBuilder}
      />,
    )
    const el = screen.getByTestId('itemrow-ai-actions')
    expect(el.getAttribute('data-issue-name')).toBe('Beta Thing error')
    expect(el.getAttribute('data-issue-message')).toBe('msg-error')
    expect(el.getAttribute('data-kind')).toBe('Beta Thing')
    expect(el.getAttribute('data-name')).toBe('thing-b')
  })
})

describe('shared ItemRow — formatRelativeTime option pass-through', () => {
  it('renders "<1m" for a sub-minute offset by default', () => {
    render(
      <ItemRow
        item={makeItem({
          timestamp: new Date('2026-06-01T11:59:50.000Z').toISOString(),
        })}
        getCategoryIcon={getCategoryIcon}
        getCategoryLabel={getCategoryLabel}
        agoLabel="ago"
        issueBuilder={issueBuilder}
      />,
    )
    expect(screen.getByText('<1m ago')).toBeTruthy()
  })

  it('clamps a sub-minute offset to "1m" when subMinute: clampToOneMinute is passed', () => {
    render(
      <ItemRow
        item={makeItem({
          timestamp: new Date('2026-06-01T11:59:50.000Z').toISOString(),
        })}
        getCategoryIcon={getCategoryIcon}
        getCategoryLabel={getCategoryLabel}
        agoLabel="ago"
        formatRelativeTimeOpts={{ subMinute: 'clampToOneMinute' }}
        issueBuilder={issueBuilder}
      />,
    )
    expect(screen.getByText('1m ago')).toBeTruthy()
  })
})

describe('shared ItemRow — presentational surface', () => {
  it('renders the cluster badge when a cluster is present, omits it otherwise', () => {
    const { rerender } = render(
      <ItemRow
        item={makeItem({ cluster: 'aks-eu-west' })}
        getCategoryIcon={getCategoryIcon}
        getCategoryLabel={getCategoryLabel}
        agoLabel="ago"
        issueBuilder={issueBuilder}
      />,
    )
    expect(screen.getByTestId('itemrow-cluster-badge').textContent).toBe(
      'aks-eu-west',
    )

    rerender(
      <ItemRow
        item={makeItem({ cluster: '' })}
        getCategoryIcon={getCategoryIcon}
        getCategoryLabel={getCategoryLabel}
        agoLabel="ago"
        issueBuilder={issueBuilder}
      />,
    )
    expect(screen.queryByTestId('itemrow-cluster-badge')).toBeNull()
  })

  it('omits the secondary detail span when secondaryDetail is empty', () => {
    const { container } = render(
      <ItemRow
        item={makeItem({ secondaryDetail: '' })}
        getCategoryIcon={getCategoryIcon}
        getCategoryLabel={getCategoryLabel}
        agoLabel="ago"
        issueBuilder={issueBuilder}
      />,
    )
    const spans = Array.from(container.querySelectorAll('span'))
    expect(
      spans.some(s => s.className.includes('text-muted-foreground/70')),
    ).toBe(false)
  })
})
