import type { CSSProperties, ReactNode, Ref } from 'react'
import {
  CardPaginationFooter,
  type CardLimit,
} from '../../../lib/cards/CardComponents'

export interface ResourceListWithPaginationProps<T> {
  containerRef: Ref<HTMLDivElement>
  containerStyle?: CSSProperties
  items: T[]
  /** Must set its own `key` (e.g. `item => <ItemRow key={item.id} item={item} />`)
   * so the list container's direct children — and its `space-y-2` spacing —
   * match the pre-extraction markup exactly. */
  renderItem: (item: T) => ReactNode
  currentPage: number
  totalPages: number
  totalItems: number
  itemsPerPage: CardLimit
  goToPage: (page: number) => void
  needsPagination: boolean
}

/**
 * Scrollable resource-row list plus `CardPaginationFooter`, wired to the
 * exact `useCardShell` field names (`typeof itemsPerPage === 'number' ? ... :
 * 10`, `needsPagination && itemsPerPage !== 'unlimited'`). Extracted from
 * `KubeflowStatus`/`OpenKruiseStatus`, which had copy-pasted this exact
 * block byte-for-byte (kubestellar/console-marketplace architecture sweep).
 */
export function ResourceListWithPagination<T>({
  containerRef,
  containerStyle,
  items,
  renderItem,
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  goToPage,
  needsPagination,
}: ResourceListWithPaginationProps<T>) {
  return (
    <>
      <div
        ref={containerRef}
        className="flex-1 space-y-2 overflow-y-auto"
        style={containerStyle}
      >
        {items.map(renderItem)}
      </div>

      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : 10}
        onPageChange={goToPage}
        needsPagination={needsPagination && itemsPerPage !== 'unlimited'}
      />
    </>
  )
}
