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

  it('defaults to the text variant with pulse animation', () => {
    render(<Skeleton />)
    const el = screen.getByTestId('skeleton')
    expect(el.getAttribute('data-variant')).toBe('text')
    expect(el.className).toContain('rounded')
    expect(el.className).toContain('animate-pulse')
  })

  it('maps variant to the console class names and exposes data-variant', () => {
    const { rerender } = render(<Skeleton variant="rounded" />)
    const el = screen.getByTestId('skeleton')
    expect(el.getAttribute('data-variant')).toBe('rounded')
    expect(el.className).toContain('rounded-lg')

    rerender(<Skeleton variant="circular" />)
    expect(el.className).toContain('rounded-full')

    rerender(<Skeleton variant="rectangular" />)
    expect(el.className).toContain('rounded-none')
  })

  it('maps width/height to inline style and merges with style prop', () => {
    render(<Skeleton width={120} height="2rem" style={{ opacity: 0.5 }} />)
    const el = screen.getByTestId('skeleton')
    expect(el.style.width).toBe('120px')
    expect(el.style.height).toBe('2rem')
    expect(el.style.opacity).toBe('0.5')
  })

  it('maps animation to the console class names', () => {
    const { rerender } = render(<Skeleton animation="wave" />)
    const el = screen.getByTestId('skeleton')
    expect(el.className).toContain('animate-shimmer')

    rerender(<Skeleton animation="none" />)
    expect(el.className).not.toContain('animate-')
  })

  it('does not forward the non-DOM showRefresh prop', () => {
    render(<Skeleton showRefresh />)
    const el = screen.getByTestId('skeleton')
    expect(el.hasAttribute('showRefresh')).toBe(false)
    expect(el.hasAttribute('showrefresh')).toBe(false)
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

  it('exposes items as data-items (default 3) without forwarding it as a DOM attribute', () => {
    const { rerender } = render(<SkeletonList />)
    const el = screen.getByTestId('skeleton-list')
    expect(el.getAttribute('data-items')).toBe('3')
    expect(el.hasAttribute('items')).toBe(false)

    rerender(<SkeletonList items={5} />)
    expect(el.getAttribute('data-items')).toBe('5')
  })
})
