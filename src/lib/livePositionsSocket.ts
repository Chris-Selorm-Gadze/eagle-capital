import { supabase } from './supabaseClient'
import type { LiveAccountPositions } from './livePositionsClient'

const apiUrl = import.meta.env.VITE_BROKER_SYNC_API_URL as string | undefined

function wsUrl(token: string): string {
  const url = new URL(apiUrl!)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = '/ws/live-positions'
  url.searchParams.set('token', token)
  return url.toString()
}

/** Same shape as copierGroupsSocket.ts's subscribeCopierGroups — the backend pushes a fresh
 * snapshot on its own poll timer, so this page never re-fetches on its own. Reconnects with
 * backoff on drop, returns an unsubscribe function. */
export function subscribeLivePositions(onUpdate: (accounts: LiveAccountPositions[]) => void, onError?: (message: string) => void): () => void {
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
        if (msg.type === 'positions') onUpdate(msg.accounts)
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
