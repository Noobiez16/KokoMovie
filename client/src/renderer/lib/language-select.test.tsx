// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LanguageSelect } from '../components/ui/LanguageSelect'

afterEach(cleanup)

describe('LanguageSelect', () => {
  it('shows only the three supported languages in a dark listbox', async () => {
    render(<LanguageSelect value="en-US" onChange={() => {}} />)
    await userEvent.click(screen.getByRole('combobox'))

    const listbox = screen.getByRole('listbox')
    expect(listbox.className).toContain('bg-[#120b24]')
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'English', 'Español', 'Français',
    ])
    expect(screen.getByRole('option', { name: 'English' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('option', { name: 'English' }).querySelector('[data-selected-check]')).not.toBeNull()
  })

  it('supports keyboard navigation and selection', async () => {
    const onChange = vi.fn()
    render(<LanguageSelect value="en-US" onChange={onChange} />)
    const control = screen.getByRole('combobox')

    control.focus()
    fireEvent.keyDown(control, { key: 'ArrowDown' })
    expect(control.getAttribute('aria-expanded')).toBe('true')
    fireEvent.keyDown(control, { key: 'ArrowDown' })
    fireEvent.keyDown(control, { key: 'Enter' })

    expect(onChange).toHaveBeenCalledWith('es-ES')
    expect(control.getAttribute('aria-expanded')).toBe('false')
  })

  it('closes with Escape and an outside pointer action', async () => {
    render(<LanguageSelect value="fr-FR" onChange={() => {}} />)
    const control = screen.getByRole('combobox')

    await userEvent.click(control)
    fireEvent.keyDown(control, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()

    await userEvent.click(control)
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})
