import { Skeleton } from '../ui/Skeleton'

/**
 * Loading-state placeholder for category-filterable status cards (a
 * header + search bar + 3 summary-metric boxes + 3 list rows). Shared by
 * `KubeflowStatus` and `OpenKruiseStatus`, which previously carried a
 * byte-identical copy of this JSX (console-marketplace#982).
 */
export function CategorySummarySkeleton() {
  return (
    <div className="h-full flex flex-col min-h-card">
      <div className="flex items-center justify-between mb-4">
        <Skeleton variant="text" width={140} height={20} />
        <Skeleton variant="rounded" width={80} height={28} />
      </div>
      <Skeleton variant="rounded" height={32} className="mb-4" />
      <div className="flex gap-2 mb-4">
        <Skeleton variant="rounded" height={52} className="flex-1" />
        <Skeleton variant="rounded" height={52} className="flex-1" />
        <Skeleton variant="rounded" height={52} className="flex-1" />
      </div>
      <div className="space-y-2">
        <Skeleton variant="rounded" height={60} />
        <Skeleton variant="rounded" height={60} />
        <Skeleton variant="rounded" height={60} />
      </div>
    </div>
  )
}
