import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * Minimal controlled search input primitive. Wire `value` / `onChange` to
 * `useCardData().filters.search` / `filters.setSearch` (or an equivalent
 * local `useState` pair) to get working search.
 */
export function CardSearchInput({ value, onChange, placeholder, className }: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  return <input data-testid="card-search" className={className} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
}

export function CardControlsRow({ children }: { children?: ReactNode }) {
  return <div>{children}</div>
}

interface CardPaginationFooterProps {
  currentPage: number
  totalPages: number
  totalItems: number
  itemsPerPage: number
  onPageChange: (page: number) => void
  needsPagination: boolean
}

/**
 * Page-range indicator with previous/next controls. Renders an empty
 * (but still `data-testid="card-pagination"`-tagged) container when
 * `needsPagination` is false so cards can render it unconditionally.
 */
export function CardPaginationFooter({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  needsPagination,
}: CardPaginationFooterProps) {
  if (!needsPagination) {
    return <div data-testid="card-pagination" />
  }

  const rangeStart = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1
  const rangeEnd = Math.min(currentPage * itemsPerPage, totalItems)

  return (
    <div
      data-testid="card-pagination"
      className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-border/50 text-xs text-muted-foreground"
    >
      <span>
        {rangeStart}-{rangeEnd} of {totalItems}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Previous page"
          className="p-1 rounded hover:bg-secondary/50 disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <span>
          {currentPage} / {totalPages}
        </span>
        <button
          type="button"
          aria-label="Next page"
          className="p-1 rounded hover:bg-secondary/50 disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

/**
 * PLACEHOLDER — renders an empty `<div>`. Not part of the search/pagination
 * stub tracked in issue #778; left as-is.
 */
export function CardAIActions() {
  return <div data-testid="card-ai-actions" />
}
