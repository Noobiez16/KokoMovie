import type { ReactNode } from 'react'
export function PageHeader({ title, description, eyebrow, action }: { title: string; description?: string; eyebrow?: string; action?: ReactNode }) {
  return <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
    <div className="max-w-2xl">{eyebrow && <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">{eyebrow}</p>}
      <h1 className="text-3xl font-bold tracking-tight text-white lg:text-4xl">{title}</h1>
      {description && <p className="mt-3 text-sm leading-6 text-purple-100/70">{description}</p>}
    </div>{action}
  </header>
}
