import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Skeleton, SkeletonStats, SkeletonList } from '../Skeleton'

describe('Skeleton', () => {
  it('renders a div with data-testid="skeleton"', () => {
    render(<Skeleton />)
    expect(screen.getByTestId('skeleton')).toBeTruthy()
  })

  it('forwards HTML attributes to the div', () => {
    render(<Skeleton className="animate-pulse w-full" aria-label="Loading" />)
    const el = screen.getByTestId('skeleton')
    expect(el.className).toContain('animate-pulse')
    expect(el.getAttribute('aria-label')).toBe('Loading')
  })

  it('renders children inside the skeleton div', () => {
    render(
      <Skeleton>
        <span>child</span>
      </Skeleton>,
    )
    expect(screen.getByText('child')).toBeTruthy()
  })
})

describe('SkeletonStats', () => {
  it('renders a div with data-testid="skeleton-stats"', () => {
    render(<SkeletonStats />)
    expect(screen.getByTestId('skeleton-stats')).toBeTruthy()
  })

  it('forwards className to the div', () => {
    render(<SkeletonStats className="h-12" />)
    const el = screen.getByTestId('skeleton-stats')
    expect(el.className).toContain('h-12')
  })
})

describe('SkeletonList', () => {
  it('renders a div with data-testid="skeleton-list"', () => {
    render(<SkeletonList />)
    expect(screen.getByTestId('skeleton-list')).toBeTruthy()
  })

  it('forwards className and style to the div', () => {
    render(<SkeletonList className="space-y-2" style={{ maxHeight: '200px' }} />)
    const el = screen.getByTestId('skeleton-list')
    expect(el.className).toContain('space-y-2')
    expect(el.style.maxHeight).toBe('200px')
  })
})
