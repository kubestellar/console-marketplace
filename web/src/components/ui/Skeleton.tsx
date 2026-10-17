import type { HTMLAttributes } from 'react'

/**
 * Props mirror the real `console` `Skeleton` (web/src/components/ui/Skeleton.tsx
 * there) so cards can pass the same props in both environments. This stub
 * ignores the non-DOM ones (no visual styling here) and only forwards actual
 * HTML attributes to the rendered div — see kubestellar/console-marketplace#991.
 */
interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded'
  width?: string | number
  height?: string | number
  animation?: 'pulse' | 'wave' | 'none'
  showRefresh?: boolean
}

export function Skeleton({
  variant: _variant,
  width: _width,
  height: _height,
  animation: _animation,
  showRefresh: _showRefresh,
  ...props
}: SkeletonProps) {
  return <div data-testid="skeleton" {...props} />
}

export function SkeletonStats(props: HTMLAttributes<HTMLDivElement>) {
  return <div data-testid="skeleton-stats" {...props} />
}

export function SkeletonList({
  items: _items,
  ...props
}: HTMLAttributes<HTMLDivElement> & { items?: number }) {
  return <div data-testid="skeleton-list" {...props} />
}
