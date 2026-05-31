import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  CardAIActions,
  CardControlsRow,
  CardPaginationFooter,
  CardSearchInput,
} from '../../lib/cards/CardComponents'

describe('CardComponents', () => {
  it('renders a controlled search input and forwards value changes', () => {
    const onChange = vi.fn()

    render(
      <CardSearchInput
        value="helm"
        onChange={onChange}
        placeholder="Search marketplace cards"
        className="marketplace-search"
      />,
    )

    const input = screen.getByTestId('card-search') as HTMLInputElement
    expect(input.value).toBe('helm')
    expect(input.placeholder).toBe('Search marketplace cards')
    expect(input.className).toContain('marketplace-search')

    fireEvent.change(input, { target: { value: 'argo' } })

    expect(onChange).toHaveBeenCalledWith('argo')
  })

  it('renders layout helpers and stable smoke-test markers', () => {
    render(
      <>
        <CardControlsRow>
          <span>install actions</span>
        </CardControlsRow>
        <CardPaginationFooter />
        <CardAIActions />
      </>
    )

    expect(screen.getByText('install actions')).toBeTruthy()
    expect(screen.getByTestId('card-pagination')).toBeTruthy()
    expect(screen.getByTestId('card-ai-actions')).toBeTruthy()
  })
})
