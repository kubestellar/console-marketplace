import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ClusterBadge } from '../ClusterBadge'

describe('ClusterBadge', () => {
  it('renders the cluster name as text content', () => {
    render(<ClusterBadge cluster="eks-prod-us-east-1" />)
    expect(screen.getByText('eks-prod-us-east-1')).toBeTruthy()
  })

  it('renders inside a span element', () => {
    const { container } = render(<ClusterBadge cluster="gke-staging" />)
    const span = container.querySelector('span')
    expect(span).not.toBeNull()
    expect(span?.textContent).toBe('gke-staging')
  })

  it('renders different cluster names correctly', () => {
    const { rerender } = render(<ClusterBadge cluster="aks-dev-eu" />)
    expect(screen.getByText('aks-dev-eu')).toBeTruthy()

    rerender(<ClusterBadge cluster="kind-local" />)
    expect(screen.getByText('kind-local')).toBeTruthy()
    expect(screen.queryByText('aks-dev-eu')).toBeNull()
  })

  it('handles empty string cluster name', () => {
    const { container } = render(<ClusterBadge cluster="" />)
    const span = container.querySelector('span')
    expect(span).not.toBeNull()
    expect(span?.textContent).toBe('')
  })

  it('defaults to size md and exposes data-size', () => {
    const { container } = render(<ClusterBadge cluster="c" />)
    const span = container.querySelector('span')
    expect(span?.getAttribute('data-size')).toBe('md')
    expect(span?.className).toContain('text-sm')
  })

  it('maps size to the console text/padding classes', () => {
    const { container, rerender } = render(<ClusterBadge cluster="c" size="sm" />)
    const span = container.querySelector('span')
    expect(span?.getAttribute('data-size')).toBe('sm')
    expect(span?.className).toContain('text-xs')

    rerender(<ClusterBadge cluster="c" size="lg" />)
    expect(span?.getAttribute('data-size')).toBe('lg')
    expect(span?.className).toContain('text-base')
  })

  it('appends className and ignores the non-DOM showIcon prop', () => {
    const { container } = render(<ClusterBadge cluster="c" className="ml-2" showIcon />)
    const span = container.querySelector('span')
    expect(span?.className).toContain('ml-2')
    expect(span?.hasAttribute('showIcon')).toBe(false)
  })
})
