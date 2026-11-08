'use client'

import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'

export function NextRun() {
  const [label, setLabel] = useState('')

  useEffect(() => {
    let stop = false
    const load = () => {
      fetch('/api/schedule')
        .then((response) => response.ok ? response.json() as Promise<{ label: string, enabled: boolean }> : null)
        .then((data) => {
          if (!stop && data) setLabel(data.enabled ? data.label : '')
        })
        .catch(() => {})
    }
    load()
    const id = setInterval(load, 15000)
    window.addEventListener('gitbackup:schedule', load)
    return () => {
      stop = true
      clearInterval(id)
      window.removeEventListener('gitbackup:schedule', load)
    }
  }, [])

  if (!label) return null
  return (
    <span className="hidden items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs text-muted-foreground animate-in fade-in md:inline-flex">
      <Clock className="size-3.5" aria-hidden />
      {label}
    </span>
  )
}
