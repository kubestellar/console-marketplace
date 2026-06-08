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
})
