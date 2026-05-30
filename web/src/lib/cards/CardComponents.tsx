import type { ReactNode } from 'react'

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

export function CardPaginationFooter() {
  return <div data-testid="card-pagination" />
}

export function CardAIActions() {
  return <div data-testid="card-ai-actions" />
}
