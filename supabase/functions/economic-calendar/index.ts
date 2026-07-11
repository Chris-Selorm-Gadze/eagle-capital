// Server-side proxy for the free ForexFactory economic-calendar feed (nfs.faireconomy.media).
// The feed has no CORS headers, so the browser can't fetch it directly, and it 429s
// non-browser User-Agents (curl/Deno's default) — this function fetches it server-side with a
// browser-like User-Agent and re-serves it with CORS enabled for the app's own origin.
//
// Only "thisweek" exists on this feed — nextweek/thismonth/lastweek etc. all 404, confirmed by
// hand. It's also aggressively rate-limited per source IP (tripped a 429 after ~10 requests in a
// few minutes during testing), so this function caches the upstream response in memory for a
// few minutes rather than re-fetching on every page load.

const FEED_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json'
const CACHE_TTL_MS = 5 * 60 * 1000

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

let cachedBody: string | null = null
let cachedStatus = 200
let cachedAt = 0

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  const fresh = cachedBody !== null && Date.now() - cachedAt < CACHE_TTL_MS
  if (!fresh) {
    const upstream = await fetch(FEED_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
    })
    cachedBody = await upstream.text()
    cachedStatus = upstream.status
    cachedAt = Date.now()
  }

  return new Response(cachedBody, {
    status: cachedStatus,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
})
