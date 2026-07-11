import { supabase } from './supabaseClient'
import type { CopierGroup } from './copierClient'

const apiUrl = import.meta.env.VITE_BROKER_SYNC_API_URL as string | undefined

function wsUrl(token: string): string {
  const url = new URL(apiUrl!)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = '/ws/copier-groups'
  url.searchParams.set('token', token)
  return url.toString()
}

/** Live-updating replacement for polling listCopierGroups() over HTTP — the backend pushes a
 * fresh snapshot the moment its background poller (or a mutation you just made) refreshes it, so
 * the page never needs to re-fetch on its own. Browsers' native WebSocket can't set an
 * Authorization header, so the session token travels as a query param instead (verified
 * server-side via verifyUserToken in the broker-sync backend). Reconnects with backoff on drop
 * (dev-server restarts, brief network hiccups) — returns an unsubscribe function. */
export function subscribeCopierGroups(onUpdate: (groups: CopierGroup[]) => void, onError?: (message: string) => void): () => void {
  if (!apiUrl) return () => {}

  let socket: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let closed = false
  let attempt = 0

  async function connect() {
    if (closed) return
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) return

    socket = new WebSocket(wsUrl(token))
    socket.onopen = () => { attempt = 0 }
    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'groups') onUpdate(msg.groups)
        else if (msg.type === 'error') onError?.(msg.error)
      } catch {
        // ignore malformed frames
      }
    }
    socket.onclose = () => {
      if (closed) return
      attempt += 1
      reconnectTimer = setTimeout(connect, Math.min(1000 * 2 ** attempt, 15_000))
    }
    socket.onerror = () => socket?.close()
  }

  connect()

  return () => {
    closed = true
    if (reconnectTimer) clearTimeout(reconnectTimer)
    socket?.close()
  }
}
