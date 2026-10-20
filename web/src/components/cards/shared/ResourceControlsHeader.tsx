import type { Ref } from 'react'
import {
  CardControlsHeader,
  type CardLimit,
} from '../../../lib/cards/CardComponents'

export interface ResourceControlsHeaderProps {
  localClusterFilter: string[]
  availableClusters: string[]
  toggleClusterFilter: (cluster: string) => void
  clearClusterFilter: () => void
  showClusterFilter: boolean
  setShowClusterFilter: (open: boolean) => void
  clusterFilterRef?: Ref<HTMLDivElement>
  itemsPerPage: CardLimit
  setItemsPerPage: (limit: CardLimit) => void
  sortBy: string
  sortOptions: Array<{ value: string; label: string }>
  onSortChange: (value: string) => void
  sortDirection: 'asc' | 'desc'
  setSortDirection: (direction: 'asc' | 'desc') => void
}

/**
 * `CardControlsHeader` call wired to the exact `useCardShell` field names
 * (`minClusters: 1`, `onChange`/`onClear` naming, etc.). Extracted from
 * `KubeflowStatus`/`OpenKruiseStatus`, which had copy-pasted this exact
 * ~25-line wiring block byte-for-byte (kubestellar/console-marketplace
 * architecture sweep).
 */
export function ResourceControlsHeader({
  localClusterFilter,
  availableClusters,
  toggleClusterFilter,
  clearClusterFilter,
  showClusterFilter,
  setShowClusterFilter,
  clusterFilterRef,
  itemsPerPage,
  setItemsPerPage,
  sortBy,
  sortOptions,
  onSortChange,
  sortDirection,
  setSortDirection,
}: ResourceControlsHeaderProps) {
  return (
    <CardControlsHeader
      selectedClusterCount={localClusterFilter.length}
      totalClusterCount={availableClusters.length}
      clusterFilter={{
        availableClusters,
        selectedClusters: localClusterFilter,
        onToggle: toggleClusterFilter,
        onClear: clearClusterFilter,
        isOpen: showClusterFilter,
        setIsOpen: setShowClusterFilter,
        containerRef: clusterFilterRef,
        minClusters: 1,
      }}
      cardControls={{
        limit: itemsPerPage,
        onLimitChange: setItemsPerPage,
        sortBy,
        sortOptions,
        onSortChange,
        sortDirection,
        onSortDirectionChange: setSortDirection,
      }}
    />
  )
}
