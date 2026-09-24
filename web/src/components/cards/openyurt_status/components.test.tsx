// Direct unit tests for components.tsx.
//
// Prior to this file, the presentational components exported by
// components.tsx (StatTile, NodeReadinessBar, NodePoolRow, GatewayRow,
// DemoBadge) were exercised ONLY transitively through OpenYurtStatus's
// index.tsx render tests. That is a drift-guard gap: a refactor that
// changes, e.g., an accessibility label, an icon, a class name, or the
// readiness-bar percentage math can pass the integration render tests
// (because none of them assert on those specifics) while silently
// breaking the visual/behavioral contract of the sub-component.
//
// These tests pin each exported component's contract directly.

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  StatTile,
  NodeReadinessBar,
  NodePoolRow,
  GatewayRow,
  DemoBadge,
} from './components'
import type { OpenYurtNodePool, OpenYurtGateway } from './demoData'

describe('StatTile', () => {
  it('renders the label, value, and icon content', () => {
    const { container } = render(
      <StatTile
        icon={<span data-testid="stat-icon">icon</span>}
        label="Total Nodes"
        value={42}
        colorClass="text-blue-400"
        borderClass="border-blue-500/30"
      />,
    )
    expect(screen.getByText('Total Nodes')).toBeTruthy()
    expect(screen.getByText('42')).toBeTruthy()
    expect(screen.getByTestId('stat-icon')).toBeTruthy()
    // colorClass is applied to the label span, borderClass to the outer container.
    expect(container.querySelector('.text-blue-400')?.textContent).toBe('Total Nodes')
    expect(container.querySelector('.border-blue-500\\/30')).not.toBeNull()
  })

  it('renders a zero value without collapsing it', () => {
    render(
      <StatTile
        icon={<span />}
        label="Autonomous"
        value={0}
        colorClass="text-purple-400"
        borderClass="border-purple-500/30"
      />,
    )
    expect(screen.getByText('0')).toBeTruthy()
  })
})

describe('NodeReadinessBar', () => {
  it('renders a green bar and full width when all nodes are ready', () => {
    const { container } = render(<NodeReadinessBar ready={4} total={4} />)
    const fill = container.querySelector('div[style]') as HTMLElement | null
    expect(fill).not.toBeNull()
    expect(fill!.className).toContain('bg-green-500')
    expect(fill!.style.width).toBe('100%')
  })

  it('renders a yellow bar and partial width when only some nodes are ready', () => {
    const { container } = render(<NodeReadinessBar ready={1} total={4} />)
    const fill = container.querySelector('div[style]') as HTMLElement | null
    expect(fill).not.toBeNull()
    expect(fill!.className).toContain('bg-yellow-500')
    expect(fill!.style.width).toBe('25%')
  })

  it('renders 0% width and yellow when total is 0', () => {
    const { container } = render(<NodeReadinessBar ready={0} total={0} />)
    const fill = container.querySelector('div[style]') as HTMLElement | null
    expect(fill).not.toBeNull()
    // total===0 must NOT be treated as "all ready"; guards the div-by-zero
    // branch and the (ready===total && total>0) allReady predicate.
    expect(fill!.className).toContain('bg-yellow-500')
    expect(fill!.style.width).toBe('0%')
  })

  it('caps width at 100% if ready exceeds total (defensive)', () => {
    const { container } = render(<NodeReadinessBar ready={10} total={4} />)
    const fill = container.querySelector('div[style]') as HTMLElement | null
    expect(fill).not.toBeNull()
    expect(fill!.style.width).toBe('100%')
  })

  it('renders yellow when ready equals total but total is 0 (guards allReady branch)', () => {
    const { container } = render(<NodeReadinessBar ready={0} total={0} />)
    const fill = container.querySelector('div[style]') as HTMLElement | null
    expect(fill).not.toBeNull()
    expect(fill!.className).not.toContain('bg-green-500')
  })
})

describe('NodePoolRow', () => {
  const basePool: OpenYurtNodePool = {
    name: 'edge-tokyo-1',
    type: 'edge',
    status: 'ready',
    nodeCount: 5,
    readyNodes: 5,
    autonomyEnabled: true,
  }

  it('renders name, ready/total node count, status label, and type label', () => {
    render(<NodePoolRow pool={basePool} />)
    expect(screen.getByText('edge-tokyo-1')).toBeTruthy()
    // openyurt.nodes uses "nodes" fallback via t(key, defaultValue); shared
    // setup.ts returns key as-is, so ready/total appears alongside the key.
    expect(screen.getByText(/5\/5/)).toBeTruthy()
    expect(screen.getByText('Ready')).toBeTruthy()
    expect(screen.getByText('Edge')).toBeTruthy()
  })

  it('renders the autonomous badge when autonomyEnabled=true', () => {
    render(<NodePoolRow pool={basePool} />)
    // Shared setup.ts i18n mock returns the key, so the fallback string
    // never rendered — assert on the key that must be present.
    expect(screen.getByText('openyurt.autonomous')).toBeTruthy()
  })

  it('does not render the autonomous badge when autonomyEnabled=false', () => {
    render(<NodePoolRow pool={{ ...basePool, autonomyEnabled: false }} />)
    expect(screen.queryByText('openyurt.autonomous')).toBeNull()
  })

  it('renders degraded status label and cloud type for a degraded cloud pool', () => {
    render(
      <NodePoolRow
        pool={{
          ...basePool,
          name: 'cloud-us-east-1',
          type: 'cloud',
          status: 'degraded',
          readyNodes: 2,
          nodeCount: 5,
        }}
      />,
    )
    expect(screen.getByText('cloud-us-east-1')).toBeTruthy()
    expect(screen.getByText('Degraded')).toBeTruthy()
    expect(screen.getByText('Cloud')).toBeTruthy()
    expect(screen.getByText(/2\/5/)).toBeTruthy()
  })

  it('renders not-ready status label', () => {
    render(<NodePoolRow pool={{ ...basePool, status: 'not-ready', readyNodes: 0 }} />)
    expect(screen.getByText('Not Ready')).toBeTruthy()
  })

  it('embeds a NodeReadinessBar reflecting the pool ready/total', () => {
    const { container } = render(
      <NodePoolRow pool={{ ...basePool, readyNodes: 1, nodeCount: 4 }} />,
    )
    const fill = container.querySelector('div[style]') as HTMLElement | null
    expect(fill).not.toBeNull()
    expect(fill!.style.width).toBe('25%')
    expect(fill!.className).toContain('bg-yellow-500')
  })
})

describe('GatewayRow', () => {
  const baseGw: OpenYurtGateway = {
    name: 'gw-tokyo',
    nodePool: 'edge-tokyo-1',
    status: 'connected',
    endpoint: '10.0.0.1',
  }

  it('renders name, nodePool arrow, and Connected status label', () => {
    render(<GatewayRow gw={baseGw} />)
    expect(screen.getByText('gw-tokyo')).toBeTruthy()
    expect(screen.getByText('→ edge-tokyo-1')).toBeTruthy()
    expect(screen.getByText('Connected')).toBeTruthy()
  })

  it('renders Disconnected status label', () => {
    render(<GatewayRow gw={{ ...baseGw, status: 'disconnected' }} />)
    expect(screen.getByText('Disconnected')).toBeTruthy()
  })

  it('renders Pending status label', () => {
    render(<GatewayRow gw={{ ...baseGw, status: 'pending' }} />)
    expect(screen.getByText('Pending')).toBeTruthy()
  })
})

describe('DemoBadge', () => {
  it('renders with the openyurt-demo-badge testid so parent tests can target it', () => {
    render(<DemoBadge />)
    // Contract with __tests__/openYurtStatusTestSetup.tsx & render tests:
    // the demo badge is discoverable via data-testid.
    expect(screen.getByTestId('openyurt-demo-badge')).toBeTruthy()
  })

  it('sets a title attribute so hovering hints at the demo-fallback reason', () => {
    render(<DemoBadge />)
    const el = screen.getByTestId('openyurt-demo-badge')
    // With shared setup.ts i18n mock, t(key, default) returns the key.
    expect(el.getAttribute('title')).toBe('openyurt.demoBadgeHint')
  })
})
