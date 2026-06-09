import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ClusterBadge } from './ClusterBadge'

describe('cards/ui/ClusterBadge', () => {
  it('re-exports the shared badge and renders the cluster name', () => {
    render(<ClusterBadge cluster="eks-prod-us-east-1" />)

    expect(screen.getByText('eks-prod-us-east-1').tagName).toBe('SPAN')
  })

  it('updates when the cluster prop changes', () => {
    const { rerender } = render(<ClusterBadge cluster="cluster-a" />)
    expect(screen.getByText('cluster-a')).toBeTruthy()

    rerender(<ClusterBadge cluster="cluster-b" />)

    expect(screen.getByText('cluster-b')).toBeTruthy()
    expect(screen.queryByText('cluster-a')).toBeNull()
  })
})
