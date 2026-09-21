import type { ReactNode } from 'react'

/**
 * Minimal controlled search input primitive.
 *
 * Note: this component is only functional when wired to a real `value` +
 * `onChange` pair. Cards that currently wire it against
 * `useCardData().filters.search` / `filters.setSearch` are wiring it to a
 * hard-coded `''` and a no-op setter (see `cardHooks.ts` and issue #778) — the
 * input renders but never accepts input.
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

/**
 * PLACEHOLDER — renders an empty `<div>`.
 *
 * Cards that render this component while `useCardData().needsPagination` is
 * true show paginated data (`items.slice(0, itemsPerPage)`) with no visible
 * way to advance pages. Tracking issue: kubestellar/console-marketplace#778.
 */
export function CardPaginationFooter() {
  return <div data-testid="card-pagination" />
}

/**
 * PLACEHOLDER — renders an empty `<div>`. Tracking issue:
 * kubestellar/console-marketplace#778.
 */
export function CardAIActions() {
  return <div data-testid="card-ai-actions" />
}
