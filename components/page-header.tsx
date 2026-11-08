import type { ReactNode } from 'react'

export function PageHeader({ step, title, children }: { step: string, title: string, children: ReactNode }) {
  return (
    <div className="max-w-2xl animate-rise">
      <p className="text-sm font-medium text-primary">Step {step} of 4</p>
      <h1 className="mt-1 text-4xl sm:text-5xl">{title}</h1>
      <p className="mt-3 text-lg text-muted-foreground">{children}</p>
    </div>
  )
}
