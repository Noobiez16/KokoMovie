// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ContentCard } from '../components/catalog/ContentCard'

const content = {
  id: 'movie-1', title: 'Keyboard Movie', type: 'movie' as const, releaseYear: 2026,
  rating: null, imdbScore: '8.0', durationMins: 90, s3Thumbnail: null,
  backdropUrl: null, imdbId: null, tmdbId: null, planMinimum: 'basic',
}

afterEach(cleanup)

describe('catalog card accessibility', () => {
  it('opens from the keyboard through a native button', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<ContentCard content={content} />} />
          <Route path="/content/:id" element={<h1>Opened</h1>} />
        </Routes>
      </MemoryRouter>,
    )
    const card = screen.getByRole('button', { name: content.title })
    card.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('heading', { name: 'Opened' })).toBeTruthy()
  })

  it('keeps the remove action separate from the card action', () => {
    const onRemove = vi.fn()
    const { container } = render(
      <MemoryRouter><ContentCard content={content} onRemove={onRemove} /></MemoryRouter>,
    )
    expect(screen.getAllByRole('button')).toHaveLength(2)
    expect(container.querySelector('button button')).toBeNull()
  })
})
