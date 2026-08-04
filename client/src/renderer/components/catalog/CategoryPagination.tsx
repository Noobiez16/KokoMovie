// With the controls below the grid, changing page would otherwise leave the viewport at the
// bottom of a freshly loaded page. Returning to the top of the scroll container keeps the new
// results where the eye already is.
export function scrollCatalogToTop() {
  document.getElementById('km-scroll-area')?.scrollTo({ top: 0, behavior: 'smooth' })
}

interface CategoryPaginationProps {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}

// Category pagination sits below the grid so it lands where reading finishes, instead of forcing a
// scroll back to the header. The same markup previously appeared inline in Movies, Series, and
// Browse; the styling is unchanged.
export function CategoryPagination({ page, totalPages, onPageChange }: CategoryPaginationProps) {
  if (totalPages <= 1) return null

  const button = 'px-3 py-1.5 rounded-xl bg-purple-500/10 border border-purple-500/10 hover:bg-purple-500/20 hover:border-purple-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-purple-300'

  return (
    <nav aria-label="Category pages" className="flex items-center justify-center gap-2 text-sm text-purple-300/50 mt-12 pt-8 border-t border-white/5">
      <button
        disabled={page === 1}
        onClick={() => onPageChange(page - 1)}
        className={button}
      >
        ‹ Prev
      </button>
      <span className="font-medium" aria-live="polite">{page} / {totalPages}</span>
      <button
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        className={button}
      >
        Next ›
      </button>
    </nav>
  )
}
