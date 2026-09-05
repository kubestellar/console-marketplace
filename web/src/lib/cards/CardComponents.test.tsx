import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  CardAIActions,
  CardControlsRow,
  CardPaginationFooter,
  CardSearchInput,
} from './CardComponents'

describe('CardSearchInput', () => {
  it('renders an input carrying the card-search testid, current value, and placeholder', () => {
    render(
      <CardSearchInput
        value="pods"
        onChange={() => {}}
        placeholder="Search cards"
      />,
    )

    const input = screen.getByTestId('card-search') as HTMLInputElement
    expect(input.tagName).toBe('INPUT')
    expect(input.value).toBe('pods')
    expect(input.placeholder).toBe('Search cards')
  })

  it('forwards the className prop verbatim', () => {
    render(<CardSearchInput value="" onChange={() => {}} className="w-64" />)
    expect(screen.getByTestId('card-search')).toHaveClass('w-64')
  })

  it('invokes onChange with the raw event value on typing', () => {
    const onChange = vi.fn()
    render(<CardSearchInput value="" onChange={onChange} />)

    fireEvent.change(screen.getByTestId('card-search'), {
      target: { value: 'nginx' },
    })

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('nginx')
  })

  it('omits placeholder and className when not provided', () => {
    render(<CardSearchInput value="" onChange={() => {}} />)
    const input = screen.getByTestId('card-search')
    expect(input).not.toHaveAttribute('placeholder')
    expect(input.className).toBe('')
  })
})

describe('CardControlsRow', () => {
  it('renders provided children', () => {
    render(
      <CardControlsRow>
        <span data-testid="child">child-node</span>
      </CardControlsRow>,
    )
    expect(screen.getByTestId('child')).toHaveTextContent('child-node')
  })

  it('renders without crashing when no children are supplied', () => {
    const { container } = render(<CardControlsRow />)
    expect(container.querySelector('div')).not.toBeNull()
  })
})

describe('CardPaginationFooter', () => {
  it('renders a container with the card-pagination testid', () => {
    render(<CardPaginationFooter />)
    expect(screen.getByTestId('card-pagination')).toBeInTheDocument()
  })
})

describe('CardAIActions', () => {
  it('renders a container with the card-ai-actions testid', () => {
    render(<CardAIActions />)
    expect(screen.getByTestId('card-ai-actions')).toBeInTheDocument()
  })
})
