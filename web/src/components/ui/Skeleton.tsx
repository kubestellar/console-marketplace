import type { CSSProperties, HTMLAttributes } from 'react'

/**
 * Props mirror the real `console` `Skeleton` (web/src/components/ui/Skeleton.tsx
 * there) so cards can pass the same props in both environments. This stub
 * maps `variant`/`animation` to the same class names console uses and
 * `width`/`height` to inline style, so tests can assert the rendered DOM
 * carries them — see kubestellar/console-marketplace#991 and #963.
 */
interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded'
  width?: string | number
  height?: string | number
  animation?: 'pulse' | 'wave' | 'none'
  showRefresh?: boolean
}

const VARIANT_CLASS: Record<NonNullable<SkeletonProps['variant']>, string> = {
  text: 'rounded',
  circular: 'rounded-full',
  rectangular: 'rounded-none',
  rounded: 'rounded-lg',
}

const ANIMATION_CLASS: Record<NonNullable<SkeletonProps['animation']>, string> = {
  pulse: 'animate-pulse',
  wave: 'animate-shimmer',
  none: '',
}

export function Skeleton({
  variant = 'text',
  width,
  height,
  animation = 'pulse',
  showRefresh: _showRefresh,
  className,
  style,
  ...props
}: SkeletonProps) {
  const classes = ['bg-secondary/60', ANIMATION_CLASS[animation], VARIANT_CLASS[variant], className]
    .filter(Boolean)
    .join(' ')
  const sizeStyle: CSSProperties = { ...style, width, height }
  return (
    <div
      data-testid="skeleton"
      data-variant={variant}
      className={classes}
      style={sizeStyle}
      {...props}
    />
  )
}

export function SkeletonStats(props: HTMLAttributes<HTMLDivElement>) {
  return <div data-testid="skeleton-stats" {...props} />
}

export function SkeletonList({
  items = 3,
  ...props
}: HTMLAttributes<HTMLDivElement> & { items?: number }) {
  return <div data-testid="skeleton-list" data-items={items} {...props} />
}
