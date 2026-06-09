import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Skeleton, SkeletonList, SkeletonStats } from './Skeleton'

describe('cards/ui/Skeleton', () => {
  it('re-exports the base skeleton component and forwards props', () => {
    render(<Skeleton className="animate-pulse" aria-label="Loading card" />)

    const skeleton = screen.getByTestId('skeleton')
    expect(skeleton.className).toContain('animate-pulse')
    expect(skeleton.getAttribute('aria-label')).toBe('Loading card')
  })

  it('re-exports the stats and list helpers', () => {
    render(
      <>
        <SkeletonStats className="grid-cols-4" />
        <SkeletonList style={{ maxHeight: '120px' }} />
      </>,
    )

    expect(screen.getByTestId('skeleton-stats').className).toContain('grid-cols-4')
    expect((screen.getByTestId('skeleton-list') as HTMLDivElement).style.maxHeight).toBe('120px')
  })
})
