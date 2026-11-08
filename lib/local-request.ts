export function localOnly(request: Request): Response | null {
  const host = request.headers.get('host') ?? ''
  if (!isLocalHost(host)) {
    return Response.json({ error: 'Open gitbackup on your computer. This site does not store your token or run the backup.' }, { status: 403 })
  }
  // A page on any other site can still POST to 127.0.0.1, and the Host header would pass.
  const origin = request.headers.get('origin')
  if (request.method !== 'GET' && origin && !isLocalHost(URL.parse(origin)?.host ?? '')) {
    return Response.json({ error: 'Changes are only accepted from the gitbackup page on this computer.' }, { status: 403 })
  }
  return null
}

export function isLocalHost(host: string): boolean {
  const name = host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '')
  return name === 'localhost' || name === '127.0.0.1' || name === '::1'
}
