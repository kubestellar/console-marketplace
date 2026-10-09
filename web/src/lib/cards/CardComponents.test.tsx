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

  it('invokes onChange with an empty string when the input is cleared', () => {
    const onChange = vi.fn()
    render(<CardSearchInput value="test" onChange={onChange} />)

    fireEvent.change(screen.getByTestId('card-search'), { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('invokes onChange with special characters typed into the input', () => {
    const onChange = vi.fn()
    render(<CardSearchInput value="" onChange={onChange} />)

    fireEvent.change(screen.getByTestId('card-search'), {
      target: { value: '<script>alert(1)</script>' },
    })
    expect(onChange).toHaveBeenCalledWith('<script>alert(1)</script>')
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

  it('renders multiple children', () => {
    render(
      <CardControlsRow>
        <span data-testid="a">A</span>
        <span data-testid="b">B</span>
      </CardControlsRow>,
    )
    expect(screen.getByTestId('a')).toBeInTheDocument()
    expect(screen.getByTestId('b')).toBeInTheDocument()
  })

  // Regression pin: kubeflow_status/index.tsx and openkruise_status/index.tsx
  // call `<CardControlsRow clusterFilter={...} cardControls={...} />` with no
  // `children`, wiring an interactive cluster filter and a limit/sort control
  // (including `onLimitChange`, the handler that can set itemsPerPage to
  // 'unlimited'). The exported `CardControlsRowProps` type is `{ children?:
  // ReactNode }`, so this real component silently drops both props and
  // renders an empty row — every card test instead mocks this module with a
  // richer fake that *does* honor `cardControls`/`clusterFilter`, which hides
  // the divergence from the test suite. This test exercises the real,
  // unmocked component with the exact prop shape the two cards pass, so a
  // future reader has a failing assertion to update once the real controls
  // UI is implemented, instead of the gap staying invisible. See
  // kubestellar/console-marketplace issue for the tracking discussion.
  it('silently drops clusterFilter/cardControls props today (no children passed)', () => {
    const onLimitChange = vi.fn()
    const { container } = render(
      <CardControlsRow
        // @ts-expect-error -- clusterFilter/cardControls are not part of
        // CardControlsRowProps; this is the exact shape production callers
        // pass, reproduced here to pin the current (unimplemented) behavior.
        clusterFilter={{
          availableClusters: ['cluster-a'],
          selectedClusters: [],
          onToggle: vi.fn(),
          onClear: vi.fn(),
          isOpen: false,
          setIsOpen: vi.fn(),
          containerRef: { current: null },
          minClusters: 1,
        }}
        cardControls={{
          limit: 'unlimited',
          onLimitChange,
          sortBy: 'name',
          sortOptions: [{ value: 'name', label: 'Name' }],
          onSortChange: vi.fn(),
          sortDirection: 'asc',
          onSortDirectionChange: vi.fn(),
        }}
      />,
    )

    // Renders the same empty <div> as the no-children case: no cluster
    // filter button, no limit/sort control, and onLimitChange is never
    // invoked, because the real component ignores both props entirely.
    expect(container.querySelector('div')).not.toBeNull()
    expect(container.querySelector('div')?.children.length).toBe(0)
    expect(onLimitChange).not.toHaveBeenCalled()
  })
})

describe('CardPaginationFooter', () => {
  const baseProps = {
    currentPage: 2,
    totalPages: 3,
    totalItems: 13,
    itemsPerPage: 5,
    onPageChange: () => {},
    needsPagination: true,
  }

  it('renders an empty container with the card-pagination testid when pagination is not needed', () => {
    render(<CardPaginationFooter {...baseProps} needsPagination={false} />)
    const el = screen.getByTestId('card-pagination')
    expect(el).toBeInTheDocument()
    expect(el).toBeEmptyDOMElement()
  })

  it('renders the item range and page count when pagination is needed', () => {
    render(<CardPaginationFooter {...baseProps} />)
    expect(screen.getByText('6-10 of 13')).toBeInTheDocument()
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
  })

  it('invokes onPageChange with the previous page when the previous button is clicked', () => {
    const onPageChange = vi.fn()
    render(<CardPaginationFooter {...baseProps} onPageChange={onPageChange} />)

    fireEvent.click(screen.getByLabelText('Previous page'))
    expect(onPageChange).toHaveBeenCalledWith(1)
  })

  it('invokes onPageChange with the next page when the next button is clicked', () => {
    const onPageChange = vi.fn()
    render(<CardPaginationFooter {...baseProps} onPageChange={onPageChange} />)

    fireEvent.click(screen.getByLabelText('Next page'))
    expect(onPageChange).toHaveBeenCalledWith(3)
  })

  it('disables the previous button on the first page', () => {
    render(<CardPaginationFooter {...baseProps} currentPage={1} />)
    expect(screen.getByLabelText('Previous page')).toBeDisabled()
  })

  it('disables the next button on the last page', () => {
    render(<CardPaginationFooter {...baseProps} currentPage={3} />)
    expect(screen.getByLabelText('Next page')).toBeDisabled()
  })

  it('renders a 0-start range when totalItems is 0', () => {
    render(<CardPaginationFooter {...baseProps} totalItems={0} />)
    expect(screen.getByText('0-0 of 0')).toBeInTheDocument()
  })
})

describe('CardAIActions', () => {
  it('renders a container with the card-ai-actions testid', () => {
    render(<CardAIActions />)
    expect(screen.getByTestId('card-ai-actions')).toBeInTheDocument()
  })
})
