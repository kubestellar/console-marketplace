import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  mockCardComponents,
  mockClusterBadgeModule,
  mockSkeletonModule,
} from './cardTestHelpers'

describe('mockSkeletonModule', () => {
  it('renders a div carrying the provided testid', () => {
    const { Skeleton } = mockSkeletonModule('demo-skeleton')
    render(<Skeleton />)
    expect(screen.getByTestId('demo-skeleton')).toBeInTheDocument()
  })
})

describe('mockClusterBadgeModule', () => {
  it('renders the cluster name inside a span carrying the provided testid', () => {
    const { ClusterBadge } = mockClusterBadgeModule('demo-badge')
    render(<ClusterBadge cluster="cluster-a" />)
    expect(screen.getByTestId('demo-badge')).toHaveTextContent('cluster-a')
  })
})

describe('mockCardComponents', () => {
  const { CardSearchInput, CardPaginationFooter } = mockCardComponents('demo')

  it('CardSearchInput renders an input carrying the prefixed testid and forwards onChange', () => {
    const onChange = vi.fn()
    render(<CardSearchInput value="pods" onChange={onChange} placeholder="Search" />)

    const input = screen.getByTestId('demo-search') as HTMLInputElement
    expect(input.value).toBe('pods')
    expect(input.placeholder).toBe('Search')

    fireEvent.change(input, { target: { value: 'nginx' } })
    expect(onChange).toHaveBeenCalledWith('nginx')
  })

  it('omits the next-page button when needsPagination is false', () => {
    render(
      <CardPaginationFooter currentPage={1} totalPages={3} needsPagination={false} />,
    )
    expect(screen.queryByTestId('demo-next-page')).not.toBeInTheDocument()
  })

  it('advances to the next page when not on the last page', () => {
    const onPageChange = vi.fn()
    render(
      <CardPaginationFooter
        currentPage={1}
        totalPages={3}
        needsPagination
        onPageChange={onPageChange}
      />,
    )
    fireEvent.click(screen.getByTestId('demo-next-page'))
    expect(onPageChange).toHaveBeenCalledWith(2)
  })

  it('wraps back to page 1 when clicked on the last page', () => {
    const onPageChange = vi.fn()
    render(
      <CardPaginationFooter
        currentPage={3}
        totalPages={3}
        needsPagination
        onPageChange={onPageChange}
      />,
    )
    fireEvent.click(screen.getByTestId('demo-next-page'))
    expect(onPageChange).toHaveBeenCalledWith(1)
  })

  it('falls back to page 1 when currentPage is undefined', () => {
    const onPageChange = vi.fn()
    render(
      <CardPaginationFooter
        totalPages={3}
        needsPagination
        onPageChange={onPageChange}
      />,
    )
    fireEvent.click(screen.getByTestId('demo-next-page'))
    expect(onPageChange).toHaveBeenCalledWith(2)
  })
})
