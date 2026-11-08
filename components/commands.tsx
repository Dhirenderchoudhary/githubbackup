'use client'

import { useState } from 'react'
import { ArrowUpRight, Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { runSteps } from '@/lib/flow'

export function Commands() {
  return (
    <ol className="mt-6 grid gap-4">
      {runSteps.map((step, index) => (
        <li
          key={step.n}
          className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-4 rounded-xl border bg-card p-4 shadow-soft animate-rise sm:grid-cols-[3rem_minmax(0,1fr)] sm:p-5"
          style={{ animationDelay: `${index * 60}ms` }}
        >
          <span className="grid size-10 place-items-center rounded-full bg-primary font-serif text-xl text-primary-foreground sm:size-12 sm:text-2xl">{step.n}</span>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold">{step.title}</h3>
            <p className="mt-1 text-muted-foreground">{step.body}</p>
            {step.command ? <CommandBlock command={step.command} /> : null}
            {step.link ? (
              <Button asChild className="mt-3">
                <a href={step.link}>Open {step.link.replace('http://', '')}<ArrowUpRight /></a>
              </Button>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  )
}

export function CommandBlock({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="group relative mt-3 rounded-lg border border-code-border bg-code text-code-foreground">
      <pre className="overflow-x-auto py-3 pr-14 pl-4 font-mono text-sm leading-relaxed">{command}</pre>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label={copied ? 'Copied' : 'Copy command'}
        className="absolute top-1.5 right-1.5 text-code-foreground/70 hover:bg-white/10 hover:text-code-foreground"
        onClick={() => {
          void navigator.clipboard.writeText(command).then(() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1400)
          })
        }}
      >
        {copied ? <Check className="text-success animate-in zoom-in" /> : <Copy />}
      </Button>
    </div>
  )
}
