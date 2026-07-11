// Generates a personal trading-coaching digest from an already-aggregated data payload (the
// client builds this via buildInsightsPayload.ts — this function never touches the database
// itself). Supports two interchangeable providers so switching costs nothing but a secret change:
//   - Groq (OpenAI-compatible /openai/v1/chat/completions) — free tier, rate-limited not metered,
//     used for testing before committing to a paid provider.
//   - Anthropic's Messages API — paid, used once Groq's output quality is proven insufficient.
// Whichever provider's key is set as a secret is the one used; if both are set, Groq wins (it's
// free, so there's no reason to prefer Anthropic by default).
//
// GROQ_API_KEY / ANTHROPIC_API_KEY live only as Supabase secrets
// (`supabase secrets set GROQ_API_KEY=...`) — never a VITE_-prefixed client env var. Even on
// Groq's free tier, a leaked key could exhaust rate limits or get attached to billing later;
// Anthropic's key is directly tied to real billing today.
//
// Auth: Supabase's default platform-level JWT verification handles "who's calling this function"
// (this project has never deployed with --no-verify-jwt) — the client sends
// `Authorization: Bearer <session access_token>`, same pattern as economicCalendarClient.ts.

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b' // the only Groq models with strict JSON-schema support
const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5'
const MAX_TOKENS = 4096

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
}

const FINDING_SCHEMA = {
  type: 'object',
  properties: { title: { type: 'string' }, description: { type: 'string' }, evidence: { type: 'string' } },
  required: ['title', 'description', 'evidence'],
  additionalProperties: false,
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    painPoints: { type: 'array', items: FINDING_SCHEMA },
    strengths: { type: 'array', items: FINDING_SCHEMA },
    recommendations: { type: 'array', items: FINDING_SCHEMA },
  },
  required: ['summary', 'painPoints', 'strengths', 'recommendations'],
  additionalProperties: false,
}

const SYSTEM_PROMPT = `You are a blunt, sharp personal trading performance coach for one specific
trader — not a generic financial advisor. You do not discuss prop-firm rules, drawdown limits, or
payout gates — those are handled elsewhere in this trader's tools. You will receive a JSON summary
of this trader's own statistics, tag correlations, playbook performance, rule-checklist adherence,
and journal excerpts for a specific date range.

Quality over quantity: return only the 2-4 MOST significant pain points, strengths, and
recommendations — not an exhaustive list of every minor observation. A long list of small findings
is worse than a short list of the ones that actually matter; if the data only supports one or two
real findings for a section, return only that many rather than padding it out. Skip a section
entirely (empty array) if the data genuinely doesn't support any finding worth stating.

Every finding must cite an actual number or direct quote from the supplied data in its "evidence"
field — never generic advice like "manage your risk better" with no grounding in the data. Be
direct and specific in "title"/"description" (e.g. "You lose money specifically on FOMO-tagged
trades during Power Hour" beats "Consider being more careful about emotional trading"). Each
recommendation must be something this trader could literally do on their next trading day, not a
vague principle. If the sample size behind a pattern is small (e.g. only 2-3 trades or report
cards), say so explicitly rather than overstating confidence — but still state the pattern if it's
the strongest signal available.

Respond only with the JSON object described by the schema — no markdown fences, no preamble, no
text outside the JSON object.`

interface Finding { title: string; description: string; evidence: string }
interface InsightsResponse { summary: string; painPoints: Finding[]; strengths: Finding[]; recommendations: Finding[] }

function isFinding(x: unknown): x is Finding {
  return !!x && typeof x === 'object'
    && typeof (x as Record<string, unknown>).title === 'string'
    && typeof (x as Record<string, unknown>).description === 'string'
    && typeof (x as Record<string, unknown>).evidence === 'string'
}

function isInsightsResponse(x: unknown): x is InsightsResponse {
  if (!x || typeof x !== 'object') return false
  const r = x as Record<string, unknown>
  return typeof r.summary === 'string'
    && Array.isArray(r.painPoints) && r.painPoints.every(isFinding)
    && Array.isArray(r.strengths) && r.strengths.every(isFinding)
    && Array.isArray(r.recommendations) && r.recommendations.every(isFinding)
}

function extractJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\n?/, '').replace(/```$/, '')
  return JSON.parse(cleaned)
}

// --- Groq (OpenAI-compatible chat completions) ---
async function callGroq(payload: unknown, model: string, apiKey: string): Promise<{ text: string } | { error: string; status: number }> {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(payload) },
      ],
      // Strict schema mode is only honored by openai/gpt-oss-20b and openai/gpt-oss-120b — for
      // any other configured model this field is silently ignored, so the defensive JSON parse
      // and shape-validation below still have to hold regardless.
      response_format: { type: 'json_schema', json_schema: { name: 'trading_insights', strict: true, schema: RESPONSE_SCHEMA } },
    }),
  })
  if (!res.ok) return { error: await res.text(), status: res.status }
  const data = await res.json()
  const text = data.choices?.[0]?.message?.content
  if (!text) return { error: 'Groq returned no message content.', status: 502 }
  return { text }
}

// --- Anthropic Messages API ---
async function callClaude(payload: unknown, model: string, apiKey: string): Promise<{ text: string } | { error: string; status: number }> {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: JSON.stringify(payload) }],
      output_config: { format: { type: 'json_schema', schema: RESPONSE_SCHEMA } },
    }),
  })
  if (!res.ok) return { error: await res.text(), status: res.status }
  const data = await res.json()
  if (data.stop_reason === 'refusal') return { error: 'Claude declined to generate insights for this data.', status: 502 }
  const textBlock = (data.content ?? []).find((b: { type: string }) => b.type === 'text')
  if (!textBlock?.text) return { error: 'Claude returned no text content.', status: 502 }
  return { text: textBlock.text }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const groqKey = Deno.env.get('GROQ_API_KEY')
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!groqKey && !anthropicKey) {
    return json({ error: 'AI insights are not configured (set GROQ_API_KEY or ANTHROPIC_API_KEY as a secret).' }, 500)
  }

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Request body must be JSON.' }, 400)
  }
  if (!payload || typeof payload !== 'object' || !('meta' in payload)) {
    return json({ error: 'Malformed insights payload — missing `meta`.' }, 400)
  }

  const provider = groqKey ? 'groq' : 'anthropic'
  const model = provider === 'groq'
    ? Deno.env.get('GROQ_MODEL') ?? DEFAULT_GROQ_MODEL
    : Deno.env.get('ANTHROPIC_MODEL') ?? DEFAULT_ANTHROPIC_MODEL

  const result = provider === 'groq'
    ? await callGroq(payload, model, groqKey!)
    : await callClaude(payload, model, anthropicKey!)

  if ('error' in result) return json({ error: `${provider} API error`, detail: result.error }, result.status || 502)

  let parsed: unknown
  try {
    parsed = extractJson(result.text)
  } catch {
    return json({ error: `${provider} returned malformed JSON.` }, 502)
  }

  if (!isInsightsResponse(parsed)) {
    return json({ error: `${provider} response did not match the expected shape.` }, 502)
  }

  // Defensive cap regardless of what the model returned, before it's ever persisted/rendered.
  const capped: InsightsResponse = {
    summary: parsed.summary,
    painPoints: parsed.painPoints.slice(0, 6),
    strengths: parsed.strengths.slice(0, 6),
    recommendations: parsed.recommendations.slice(0, 6),
  }
  return json({ model: `${provider}/${model}`, insights: capped })
})
