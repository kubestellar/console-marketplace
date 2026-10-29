/**
 * Props mirror the real `console` `ClusterBadge` so cards can pass the same
 * props in both environments. `size` maps to the same text/padding classes
 * console uses so tests can assert the rendered DOM carries it — see
 * kubestellar/console-marketplace#991 and #963.
 */
interface ClusterBadgeProps {
  cluster: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
  showIcon?: boolean
}

const SIZE_CLASS: Record<NonNullable<ClusterBadgeProps['size']>, string> = {
  sm: 'text-xs px-1.5 py-0.5',
  md: 'text-sm px-2 py-1',
  lg: 'text-base px-3 py-1.5',
}

export function ClusterBadge({ cluster, size = 'md', className }: ClusterBadgeProps) {
  const classes = [SIZE_CLASS[size], className].filter(Boolean).join(' ')
  return (
    <span data-size={size} className={classes}>
      {cluster}
    </span>
  )
}
