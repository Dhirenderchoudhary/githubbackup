'use client'

import { useEffect, useState } from 'react'
import { CalendarClock, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/page-header'
import { beats } from '@/lib/flow'
import { cn } from '@/lib/utils'

type Schedule = {
  enabled: boolean
  frequency: 'daily' | 'weekly' | 'monthly'
  time: string
  dayOfWeek: number
  dayOfMonth: number
}

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const frequencies = [
  ['daily', 'Daily'],
  ['weekly', 'Weekly'],
  ['monthly', 'Monthly'],
] as const

export function ScheduleForm() {
  const beat = beats[3]
  const [schedule, setSchedule] = useState<Schedule>({ enabled: false, frequency: 'daily', time: '02:00', dayOfWeek: 1, dayOfMonth: 1 })
  const [label, setLabel] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void fetch('/api/settings').then(async (response) => {
      const body = await response.json() as { schedule?: Schedule, error?: string }
      if (!response.ok) {
        setMessage(body.error ?? 'Open this page on your computer.')
        return
      }
      if (body.schedule) setSchedule(body.schedule)
    })
    void fetch('/api/schedule').then(async (response) => {
      if (!response.ok) return
      const body = await response.json() as { label?: string }
      if (body.label) setLabel(body.label)
    })
  }, [])

  async function save() {
    setSaving(true)
    const response = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ schedule }),
    })
    setSaving(false)
    if (!response.ok) {
      setMessage('Could not save the schedule')
      return
    }
    const status = await fetch('/api/schedule')
    const body = status.ok ? await status.json() as { label?: string } : {}
    setLabel(body.label ?? '')
    window.dispatchEvent(new Event('gitbackup:schedule'))
    setMessage(schedule.enabled ? 'Saved. Leave this app open and the backup runs at that time.' : 'Saved. The schedule is off.')
  }

  return (
    <>
      <PageHeader step={beat.n} title={beat.label}>{beat.body}</PageHeader>
      <Card className="mt-8 max-w-xl animate-rise shadow-soft">
        <CardContent>
          <form className="grid gap-6" onSubmit={(event) => { event.preventDefault(); void save() }}>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="enabled" className="grid gap-1">
                <span className="text-base font-semibold">Run on a schedule</span>
                <span className="font-normal text-muted-foreground">Backs up while this app is open.</span>
              </Label>
              <Switch id="enabled" checked={schedule.enabled} onCheckedChange={(enabled) => setSchedule({ ...schedule, enabled })} />
            </div>
            <fieldset disabled={!schedule.enabled} className={cn('grid gap-5 transition-opacity', !schedule.enabled && 'opacity-50')}>
              <div className="grid gap-2">
                <Label>How often</Label>
                <Tabs value={schedule.frequency} onValueChange={(value) => setSchedule({ ...schedule, frequency: value as Schedule['frequency'] })}>
                  <TabsList className="w-full">
                    {frequencies.map(([value, name]) => <TabsTrigger key={value} value={value} disabled={!schedule.enabled}>{name}</TabsTrigger>)}
                  </TabsList>
                </Tabs>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="time">Time</Label>
                  <Input id="time" type="time" value={schedule.time} onChange={(event) => setSchedule({ ...schedule, time: event.target.value })} />
                </div>
                {schedule.frequency === 'weekly' ? (
                  <div className="grid gap-2 animate-in fade-in">
                    <Label htmlFor="day">Day</Label>
                    <Select value={String(schedule.dayOfWeek)} onValueChange={(value) => setSchedule({ ...schedule, dayOfWeek: Number(value) })} disabled={!schedule.enabled}>
                      <SelectTrigger id="day" className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {days.map((day, index) => <SelectItem key={day} value={String(index)}>{day}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
                {schedule.frequency === 'monthly' ? (
                  <div className="grid gap-2 animate-in fade-in">
                    <Label htmlFor="date">Day of the month</Label>
                    <Input id="date" type="number" min={1} max={31} value={schedule.dayOfMonth} onChange={(event) => setSchedule({ ...schedule, dayOfMonth: Number(event.target.value) })} />
                  </div>
                ) : null}
              </div>
              {schedule.frequency === 'monthly' && schedule.dayOfMonth > 28 ? <p className="-mt-2 text-sm text-muted-foreground">Months without that day are skipped.</p> : null}
            </fieldset>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Check />} Save schedule</Button>
              {message ? <span role="status" className="text-sm text-muted-foreground animate-in fade-in">{message}</span> : null}
            </div>
          </form>
        </CardContent>
      </Card>
      {label && label !== 'Schedule off' ? (
        <p className="mt-4 flex max-w-xl items-center gap-2 rounded-xl border bg-card p-4 text-sm animate-in fade-in">
          <CalendarClock className="size-4.5 text-primary" aria-hidden /> {label}
        </p>
      ) : null}
    </>
  )
}
