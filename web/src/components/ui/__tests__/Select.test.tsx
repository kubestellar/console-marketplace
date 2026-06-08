import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Select } from '../Select'

describe('Select', () => {
  it('renders a native select element', () => {
    render(<Select data-testid="test-select" />)
    expect(screen.getByTestId('test-select').tagName).toBe('SELECT')
  })

  it('forwards HTML attributes to the underlying select', () => {
    render(
      <Select
        data-testid="test-select"
        aria-label="Choose cluster"
        className="custom-class"
        disabled
      />,
    )
    const el = screen.getByTestId('test-select') as HTMLSelectElement
    expect(el.getAttribute('aria-label')).toBe('Choose cluster')
    expect(el.className).toContain('custom-class')
    expect(el.disabled).toBe(true)
  })

  it('renders children as option elements', () => {
    render(
      <Select data-testid="test-select">
        <option value="a">Alpha</option>
        <option value="b">Beta</option>
      </Select>,
    )
    const options = screen.getByTestId('test-select').querySelectorAll('option')
    expect(options).toHaveLength(2)
    expect(options[0]?.textContent).toBe('Alpha')
    expect(options[1]?.textContent).toBe('Beta')
  })

  it('fires onChange when the value changes', () => {
    const onChange = vi.fn()
    render(
      <Select data-testid="test-select" onChange={onChange}>
        <option value="a">Alpha</option>
        <option value="b">Beta</option>
      </Select>,
    )
    fireEvent.change(screen.getByTestId('test-select'), { target: { value: 'b' } })
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('reflects value prop as the selected value', () => {
    render(
      <Select data-testid="test-select" value="b" onChange={() => {}}>
        <option value="a">Alpha</option>
        <option value="b">Beta</option>
      </Select>,
    )
    const el = screen.getByTestId('test-select') as HTMLSelectElement
    expect(el.value).toBe('b')
  })
})
