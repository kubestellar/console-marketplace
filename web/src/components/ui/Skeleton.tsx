import type { HTMLAttributes } from 'react'

export function Skeleton(props: HTMLAttributes<HTMLDivElement>) {
  return <div data-testid="skeleton" {...props} />
}

export function SkeletonStats(props: HTMLAttributes<HTMLDivElement>) {
  return <div data-testid="skeleton-stats" {...props} />
}

export function SkeletonList(props: HTMLAttributes<HTMLDivElement>) {
  return <div data-testid="skeleton-list" {...props} />
}
