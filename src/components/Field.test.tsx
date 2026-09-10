import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Checkbox, Field, SegmentedControl, Select, TextInput } from './Field'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'

describe('Field', () => {
  it('associates its label with the control it wraps', () => {
    render(
      <Field label="Secret">
        <TextInput />
      </Field>,
    )
    expect(screen.getByLabelText('Secret')).toBeInstanceOf(HTMLInputElement)
  })

  it('points aria-describedby at its hint', () => {
    render(
      <Field label="Indent" hint="Two spaces is the JSON convention.">
        <TextInput />
      </Field>,
    )
    expect(screen.getByLabelText('Indent')).toHaveAccessibleDescription(
      'Two spaces is the JSON convention.',
    )
  })

  it('replaces the hint with the error and marks the control invalid', () => {
    render(
      <Field label="Port" hint="1-65535" error="Not a number.">
        <TextInput />
      </Field>,
    )
    const input = screen.getByLabelText('Port')
    expect(input).toHaveAccessibleDescription('Not a number.')
    expect(input).toHaveAttribute('aria-invalid', 'true')
  })

  it('keeps an id the caller supplied on the control', () => {
    render(
      <Field label="Given" htmlFor="mine">
        <TextInput id="mine" />
      </Field>,
    )
    expect(screen.getByLabelText('Given')).toHaveAttribute('id', 'mine')
  })

  it('leaves a multi-control body alone', () => {
    render(
      <Field label="Flags">
        <Checkbox label="One" />
        <Checkbox label="Two" />
      </Field>,
    )
    expect(screen.getByLabelText('One')).toBeInTheDocument()
    expect(screen.getByLabelText('Two')).toBeInTheDocument()
  })

  it('works with a select', () => {
    render(
      <Field label="Dialect">
        <Select>
          <option>postgresql</option>
        </Select>
      </Field>,
    )
    expect(screen.getByLabelText('Dialect')).toBeInstanceOf(HTMLSelectElement)
  })
})

describe('SegmentedControl', () => {
  function Harness() {
    const [value, setValue] = useState('encode')
    return (
      <SegmentedControl
        label="Direction"
        value={value}
        onChange={setValue}
        options={[
          { value: 'encode', label: 'Encode' },
          { value: 'decode', label: 'Decode' },
        ]}
      />
    )
  }

  it('exposes a radio group with the selected option checked', () => {
    render(<Harness />)
    expect(screen.getByRole('radiogroup', { name: 'Direction' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Encode' })).toBeChecked()
  })

  it('takes exactly one tab stop', () => {
    render(<Harness />)
    expect(screen.getByRole('radio', { name: 'Encode' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('radio', { name: 'Decode' })).toHaveAttribute('tabindex', '-1')
  })

  it('moves the selection with arrow keys', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    screen.getByRole('radio', { name: 'Encode' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: 'Decode' })).toBeChecked()
  })

  it('wraps around at the end', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    screen.getByRole('radio', { name: 'Encode' }).focus()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('radio', { name: 'Decode' })).toBeChecked()
  })

  it('selects on click', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('radio', { name: 'Decode' }))
    expect(screen.getByRole('radio', { name: 'Decode' })).toBeChecked()
  })
})
