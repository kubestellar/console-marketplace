interface CardLoadingStateOptions {
  isLoading?: boolean
  isRefreshing?: boolean
  hasAnyData?: boolean
  isFailed?: boolean
  consecutiveFailures?: number
  isDemoData?: boolean
  lastRefresh?: Date | string | null
}

export function useCardLoadingState(opts?: CardLoadingStateOptions) {
  const {
    isLoading = false,
    isRefreshing = false,
    hasAnyData = true,
    isDemoData = false,
  } = opts ?? {}

  // Show skeleton when the first load is in progress and we have nothing to display yet
  const showSkeleton = isLoading && !hasAnyData && !isDemoData

  // Show empty state when loading is done but there is no data (and not failed or demo)
  const showEmptyState = !isLoading && !hasAnyData && !isDemoData

  return { showSkeleton, showEmptyState, hasData: hasAnyData, isRefreshing }
}

export function useReportCardDataState() {
  return undefined
}
