import type { ReactNode } from 'react'
export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="km-empty-state"><div className="mx-auto max-w-md">
    <h2 className="text-lg font-semibold text-white">{title}</h2>
    {description && <p className="mt-3 text-sm leading-6 text-purple-100/70">{description}</p>}
    {action && <div className="mt-6 flex justify-center">{action}</div>}
  </div></div>
}
