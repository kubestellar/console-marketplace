/**
 * Props mirror the real `console` `ClusterBadge` so cards can pass the same
 * props in both environments — see kubestellar/console-marketplace#991.
 */
interface ClusterBadgeProps {
  cluster: string
  size?: 'sm' | 'md' | 'lg'
  showIcon?: boolean
}

export function ClusterBadge({ cluster }: ClusterBadgeProps) {
  return <span>{cluster}</span>
}
