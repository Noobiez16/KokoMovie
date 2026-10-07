const paths = {
  home: 'm3 10 9-7 9 7v10H3V10m6 10v-7h6v7',
  movie: 'M3 7h18v14H3V7m0 0 3-4h4L7 7m6 0 3-4h4l-3 4',
  series: 'M3 5h18v14H3V5m5 17h8M9 2l3 3 3-3',
  search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  list: 'M6 3h12v19l-6-4-6 4V3',
  play: 'm9 6 10 6-10 6V6',
  history: 'M3 11a9 9 0 1 1 2 7M3 4v7h7m2-5v6l4 2',
  download: 'M12 3v13m-5-5 5 5 5-5M3 17v4h18v-4',
  providers: 'M7 3v5m10-5v5M5 8h14v4a7 7 0 0 1-14 0V8m7 11v3',
  settings: 'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',
  help: 'M12 17h.01M9 9a3 3 0 1 1 5 2l-2 2m10-1a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  back: 'm14 6-6 6 6 6',
  panel: 'M3 3h18v18H3V3m5 0v18m5-14-3 5 3 5',
} as const
export function Icon({ name, className = 'h-5 w-5' }: { name: keyof typeof paths; className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}
