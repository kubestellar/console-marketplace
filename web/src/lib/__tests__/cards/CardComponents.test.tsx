import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import {
  CardSearchInput,
  CardControlsRow,
  CardPaginationFooter,
  CardAIActions,
} from '../../cards/CardComponents'

describe('CardSearchInput', () => {
  it('renders an input with the provided value', () => {
    render(<CardSearchInput value="flux" onChange={() => {}} />)

    const input = screen.getByTestId('card-search') as HTMLInputElement
    expect(input.value).toBe('flux')
  })

  it('renders with a placeholder', () => {
    render(<CardSearchInput value="" onChange={() => {}} placeholder="Search cards..." />)

    const input = screen.getByTestId('card-search')
    expect(input).toHaveAttribute('placeholder', 'Search cards...')
  })

  it('calls onChange with input value when typing', () => {
    const onChange = vi.fn()
    render(<CardSearchInput value="" onChange={onChange} />)

    const input = screen.getByTestId('card-search')
    fireEvent.change(input, { target: { value: 'argo' } })

    expect(onChange).toHaveBeenCalledWith('argo')
  })

  it('applies className when provided', () => {
    render(<CardSearchInput value="" onChange={() => {}} className="custom-class" />)

    const input = screen.getByTestId('card-search')
    expect(input).toHaveClass('custom-class')
  })

  it('renders without className when not provided', () => {
    render(<CardSearchInput value="" onChange={() => {}} />)

    const input = screen.getByTestId('card-search')
    expect(input.className).toBe('')
  })

  it('handles empty string onChange', () => {
    const onChange = vi.fn()
    render(<CardSearchInput value="test" onChange={onChange} />)

    fireEvent.change(screen.getByTestId('card-search'), { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('handles special characters in search input', () => {
    const onChange = vi.fn()
    render(<CardSearchInput value="" onChange={onChange} />)

    fireEvent.change(screen.getByTestId('card-search'), { target: { value: '<script>alert(1)</script>' } })
    expect(onChange).toHaveBeenCalledWith('<script>alert(1)</script>')
  })
})

describe('CardControlsRow', () => {
  it('renders children inside a container', () => {
    render(
      <CardControlsRow>
        <span data-testid="child">Hello</span>
      </CardControlsRow>
    )

    expect(screen.getByTestId('child')).toBeInTheDocument()
    expect(screen.getByTestId('child').textContent).toBe('Hello')
  })

  it('renders without children', () => {
    const { container } = render(<CardControlsRow />)

    expect(container.querySelector('div')).toBeInTheDocument()
  })

  it('renders multiple children', () => {
    render(
      <CardControlsRow>
        <span data-testid="a">A</span>
        <span data-testid="b">B</span>
      </CardControlsRow>
    )

    expect(screen.getByTestId('a')).toBeInTheDocument()
    expect(screen.getByTestId('b')).toBeInTheDocument()
  })
})

describe('CardPaginationFooter', () => {
  it('renders a pagination container', () => {
    render(<CardPaginationFooter />)

    expect(screen.getByTestId('card-pagination')).toBeInTheDocument()
  })
})

describe('CardAIActions', () => {
  it('renders an AI actions container', () => {
    render(<CardAIActions />)

    expect(screen.getByTestId('card-ai-actions')).toBeInTheDocument()
  })
})
