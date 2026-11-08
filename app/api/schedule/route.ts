import { NextResponse } from 'next/server'
import { localOnly } from '@/lib/local-request'
import { scheduleStatus } from '@/lib/schedule'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const blocked = localOnly(request)
  if (blocked) return blocked
  return NextResponse.json(await scheduleStatus())
}
