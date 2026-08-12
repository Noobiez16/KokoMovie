import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SUPPORTED_LOCALES, type AppLocale } from '../../../main/locales'

export function LanguageSelect({ value, disabled = false, onChange }: {
  value: AppLocale
  disabled?: boolean
  onChange(locale: AppLocale): void
}) {
  const { t } = useTranslation()
  const listboxId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const selectedIndex = Math.max(SUPPORTED_LOCALES.findIndex(({ code }) => code === value), 0)
  const [activeIndex, setActiveIndex] = useState(selectedIndex)
  const selected = SUPPORTED_LOCALES[selectedIndex]!

  useEffect(() => setActiveIndex(selectedIndex), [selectedIndex])

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open])

  const choose = (index: number) => {
    const locale = SUPPORTED_LOCALES[index]
    if (!locale) return
    setOpen(false)
    setActiveIndex(index)
    if (locale.code !== value) onChange(locale.code)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape') {
      setOpen(false)
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        setActiveIndex(selectedIndex)
        return
      }
      const delta = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((index) => (index + delta + SUPPORTED_LOCALES.length) % SUPPORTED_LOCALES.length)
      return
    }
    if ((event.key === 'Enter' || event.key === ' ') && open) {
      event.preventDefault()
      choose(activeIndex)
    }
  }

  return (
    <div ref={rootRef} className="relative min-w-44">
      <button
        type="button"
        role="combobox"
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => { setOpen((current) => !current); setActiveIndex(selectedIndex) }}
        onKeyDown={onKeyDown}
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/[0.12] bg-white/[0.06] px-3 py-2 text-left text-sm text-white outline-none transition-colors hover:border-violet-400/40 hover:bg-white/[0.09] focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span>{selected.nativeLabel}</span>
        <svg aria-hidden="true" className={`h-4 w-4 text-white/45 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.22 7.22a.75.75 0 011.06 0L10 10.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 8.28a.75.75 0 010-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={t('settings.selectLanguage')}
          className="absolute right-0 z-50 mt-2 w-full overflow-hidden rounded-xl border border-violet-400/20 bg-[#120b24] p-1.5 shadow-[0_18px_50px_rgba(0,0,0,0.55)]"
        >
          {SUPPORTED_LOCALES.map((locale, index) => {
            const isSelected = locale.code === value
            const isActive = index === activeIndex
            return (
              <button
                key={locale.code}
                type="button"
                role="option"
                aria-selected={isSelected}
                onPointerMove={() => setActiveIndex(index)}
                onClick={() => choose(index)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm outline-none transition-colors ${
                  isActive ? 'bg-violet-500/20 text-white' : 'text-white/70 hover:bg-white/[0.07] hover:text-white'
                }`}
              >
                <span>{locale.nativeLabel}</span>
                {isSelected && (
                  <svg data-selected-check aria-hidden="true" className="h-4 w-4 text-violet-300" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.704 5.29a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.296-7.296a1 1 0 011.408 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
