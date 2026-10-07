import { useId } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../../store/settings'
import { WATCH_GROUPS, watchAvailabilityApi, watchIdentity } from '../../api/watch-availability'

export function WhereToWatch({ contentId }: { contentId: string }) {
  const { t, i18n } = useTranslation()
  const selectorId = useId()
  const headingId = useId()
  const apiKey = useSettingsStore((state) => state.tmdbApiKey)
  const country = useSettingsStore((state) => state.watchCountry)
  const setCountry = useSettingsStore((state) => state.setWatchCountry)
  const enabled = Boolean(apiKey.trim() && watchIdentity(contentId))
  const countries = useQuery({
    queryKey: ['watch-countries', apiKey, i18n.language],
    queryFn: watchAvailabilityApi.getCountries,
    enabled,
    retry: false,
    staleTime: 24 * 60 * 60 * 1000,
  })
  const selected = countries.data?.some((item) => item.code === country) === true
  const availability = useQuery({
    // TMDB returns all countries, so changing the selector uses the same response.
    // Title and credential are isolated; never retain previous-title placeholder data.
    queryKey: ['watch-availability', contentId, apiKey, i18n.language],
    queryFn: () => watchAvailabilityApi.getProviders(contentId, country),
    enabled: enabled && selected,
    retry: false,
    staleTime: 0,
  })
  if (!enabled) return null
  const data = selected ? availability.data : undefined
  const region = data?.regions[country]
  const hasProviders = region && WATCH_GROUPS.some((group) => region.groups[group].length > 0)
  const retry = () => { void (countries.isError ? countries.refetch() : availability.refetch()) }
  return (
    <section aria-labelledby={headingId} className="mb-10 max-w-3xl rounded-xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h3 id={headingId} className="text-white font-semibold">{t('watchAvailability.title')}</h3>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={selectorId} className="text-xs text-white/60">{t('watchAvailability.country')}</label>
          <select id={selectorId} value={country} onChange={(event) => setCountry(event.target.value)} disabled={countries.isPending && !countries.data}
            className="max-w-full rounded-lg border border-white/15 bg-km-surface px-3 py-2 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400">
            <option value="">{t('watchAvailability.chooseCountry')}</option>
            {country && !selected && <option value={country}>{country}</option>}
            {countries.data?.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
          </select>
        </div>
      </div>
      <div className="mt-4 text-sm text-white/65" aria-live="polite">
        {countries.isError ? <p role="alert">{t('watchAvailability.countriesError')}</p>
          : countries.isPending ? <p role="status">{t('watchAvailability.loadingCountries')}</p>
          : !selected ? <p>{t('watchAvailability.prompt')}</p>
          : availability.isError ? <p role="alert">{t('watchAvailability.error')}</p>
          : availability.isPending ? <p role="status">{t('watchAvailability.loading')}</p>
          : null}
        {(countries.isError || (selected && availability.isError)) && <button type="button" onClick={retry}
          className="mt-2 rounded-lg border border-white/20 px-3 py-1.5 text-white hover:bg-white/10">{t('common.retry')}</button>}
        {data && !availability.isError && <>
          {data.source === 'cache' && <p className="mb-4 text-amber-200/85">{t(data.stale ? 'watchAvailability.outdated' : 'watchAvailability.saved')}</p>}
          {!hasProviders && <p>{t('watchAvailability.noInformation')}</p>}
          {region && WATCH_GROUPS.map((group) => region.groups[group].length > 0 && (
            <div key={group} role="group" aria-label={t(`watchAvailability.groups.${group}`)} className="mb-4">
              <h4 className="mb-2 text-xs font-semibold text-white/50">{t(`watchAvailability.groups.${group}`)}</h4>
              <ul className="flex flex-wrap gap-2">
                {region.groups[group].map((provider) => <li key={provider.id} className="flex items-center gap-2 rounded-lg bg-white/5 px-2.5 py-2 text-white/85">
                  {provider.logo && <img src={provider.logo} alt="" className="h-7 w-7 rounded object-contain" loading="lazy" />}
                  <span>{provider.name}</span>
                </li>)}
              </ul>
            </div>
          ))}
          {region?.link && <a href={region.link} target="_blank" rel="noopener noreferrer" className="inline-block text-violet-300 underline underline-offset-4 hover:text-violet-200">{t('watchAvailability.viewOptions')}</a>}
        </>}
      </div>
      <p className="mt-4 text-xs text-white/40">{t('watchAvailability.attribution')}</p>
    </section>
  )
}
