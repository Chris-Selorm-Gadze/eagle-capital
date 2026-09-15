#!/usr/bin/env bash
# Contract test for the copier gateway.
#
# Exercises all twelve /internal/* endpoints the Delta Engine worker calls, in
# the same shapes the worker sends, so a wiring mistake surfaces here instead of
# halfway through a live copy.
#
# Usage:
#   export SUPABASE_URL=https://<project>.supabase.co
#   export SUPABASE_ANON_KEY=<anon key>
#   export WORKER_API_KEY=<same value as the function secret>
#   export WORKER_USER_ID=<an auth.users id>
#   ./scripts/verify-copier-gateway.sh
#
# Read-only apart from one worker registration + heartbeat, which is what a real
# worker does on startup anyway. It does not create accounts, links or trades.

set -uo pipefail

GATEWAY="${SUPABASE_URL:?set SUPABASE_URL}/functions/v1/copier-gateway"
ANON="${SUPABASE_ANON_KEY:?set SUPABASE_ANON_KEY}"
WKEY="${WORKER_API_KEY:?set WORKER_API_KEY}"
UID_="${WORKER_USER_ID:?set WORKER_USER_ID}"

pass=0; fail=0

check() { # name expected_status method path [json]
  local name="$1" want="$2" method="$3" path="$4" data="${5:-}"
  local args=(-s -o /tmp/cgw_body.txt -w '%{http_code}' --max-time 30
              -X "$method" "$GATEWAY$path"
              -H "apikey: $ANON" -H "x-worker-key: $WKEY" -H "x-user-id: $UID_"
              -H 'Content-Type: application/json')
  [ -n "$data" ] && args+=(-d "$data")
  local got; got=$(curl "${args[@]}")
  if [ "$got" = "$want" ]; then
    printf '  \033[32m✓\033[0m %-46s %s\n' "$name" "$got"; pass=$((pass+1))
  else
    printf '  \033[31m✗\033[0m %-46s got %s, want %s\n' "$name" "$got" "$want"
    printf '      %s\n' "$(head -c 200 /tmp/cgw_body.txt)"; fail=$((fail+1))
  fi
}

echo "Gateway: $GATEWAY"
echo
echo "── Auth ─────────────────────────────────────────────────────────────"
# A missing or wrong worker key must be rejected before anything reads a row.
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$GATEWAY/internal/runtime-config" \
       -H "apikey: $ANON" -H "x-user-id: $UID_")
[ "$code" = "401" ] && { printf '  \033[32m✓\033[0m %-46s 401\n' "no worker key rejected"; pass=$((pass+1)); } \
                    || { printf '  \033[31m✗\033[0m %-46s got %s, want 401\n' "no worker key rejected" "$code"; fail=$((fail+1)); }

code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$GATEWAY/internal/runtime-config" \
       -H "apikey: $ANON" -H "x-worker-key: definitely-not-the-key" -H "x-user-id: $UID_")
[ "$code" = "401" ] && { printf '  \033[32m✓\033[0m %-46s 401\n' "wrong worker key rejected"; pass=$((pass+1)); } \
                    || { printf '  \033[31m✗\033[0m %-46s got %s, want 401\n' "wrong worker key rejected" "$code"; fail=$((fail+1)); }

# X-User-Id is required on every route that acts on one user's book.
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$GATEWAY/internal/runtime-config" \
       -H "apikey: $ANON" -H "x-worker-key: $WKEY")
[ "$code" = "422" ] && { printf '  \033[32m✓\033[0m %-46s 422\n' "missing X-User-Id rejected"; pass=$((pass+1)); } \
                    || { printf '  \033[31m✗\033[0m %-46s got %s, want 422\n' "missing X-User-Id rejected" "$code"; fail=$((fail+1)); }

echo
echo "── Config (404 until a copy link is armed — that is correct) ────────"
# runtime-config returns 404 when there is nothing to run. The worker treats
# that as "idle", not as an error, so it is a pass either way.
code=$(curl -s -o /tmp/cgw_body.txt -w '%{http_code}' --max-time 30 "$GATEWAY/internal/runtime-config" \
       -H "apikey: $ANON" -H "x-worker-key: $WKEY" -H "x-user-id: $UID_")
case "$code" in
  200) printf '  \033[32m✓\033[0m %-46s 200 (config served)\n' "runtime-config"; pass=$((pass+1))
       command -v python3 >/dev/null && python3 - <<'PY'
import json
d = json.load(open('/tmp/cgw_body.txt'))
print(f"      accounts={len(d.get('accounts',[]))} copiers={len(d.get('copiers',[]))} "
      f"symbol_mappings={len(d.get('symbol_mappings',[]))} risk_profiles={len(d.get('risk_profiles',[]))}")
for a in d.get('accounts', []):
    # The password must be present and decrypted, or the worker cannot log in.
    ok = isinstance(a.get('password'), str) and len(a['password']) > 0
    print(f"      {a['label']}: role={a['role']} password={'decrypted' if ok else 'MISSING'} "
          f"terminal_path={a.get('terminal_path') or 'unset'}")
PY
       ;;
  404) printf '  \033[32m✓\033[0m %-46s 404 (nothing armed yet)\n' "runtime-config"; pass=$((pass+1)) ;;
  *)   printf '  \033[31m✗\033[0m %-46s got %s\n' "runtime-config" "$code"
       printf '      %s\n' "$(head -c 200 /tmp/cgw_body.txt)"; fail=$((fail+1)) ;;
esac

check "open-links"            200 GET  /internal/open-links
check "worker-commands"       200 GET  /internal/worker-commands
check "trading-accounts/{unknown} → 404" 404 GET /internal/trading-accounts/00000000-0000-0000-0000-000000000000

echo
echo "── Worker lifecycle ─────────────────────────────────────────────────"
REG=$(curl -s --max-time 30 -X POST "$GATEWAY/internal/workers/register" \
      -H "apikey: $ANON" -H "x-worker-key: $WKEY" -H 'Content-Type: application/json' \
      -d '{"worker_name":"contract-test","region":"verify","host_identifier":"verify-host","capacity":1}')
WID=$(printf '%s' "$REG" | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
if [ -n "$WID" ]; then
  printf '  \033[32m✓\033[0m %-46s %s\n' "workers/register" "${WID:0:8}…"; pass=$((pass+1))
  # Registering twice must return the SAME node, or every worker restart leaves
  # a ghost row in the fleet list.
  WID2=$(curl -s --max-time 30 -X POST "$GATEWAY/internal/workers/register" \
        -H "apikey: $ANON" -H "x-worker-key: $WKEY" -H 'Content-Type: application/json' \
        -d '{"worker_name":"contract-test","region":"verify","host_identifier":"verify-host","capacity":1}' \
        | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
  [ "$WID" = "$WID2" ] && { printf '  \033[32m✓\033[0m %-46s same node\n' "re-register is idempotent"; pass=$((pass+1)); } \
                       || { printf '  \033[31m✗\033[0m %-46s created a duplicate\n' "re-register is idempotent"; fail=$((fail+1)); }
  check "workers/heartbeat" 200 POST /internal/workers/heartbeat "{\"worker_id\":\"$WID\",\"active_sessions\":0}"
else
  printf '  \033[31m✗\033[0m %-46s %s\n' "workers/register" "$(printf '%s' "$REG" | head -c 160)"; fail=$((fail+1))
fi

echo
echo "── Events ───────────────────────────────────────────────────────────"
check "execution-events/batch (empty)" 201 POST /internal/execution-events/batch '{"events":[]}'
check "account-balances (empty)"       200 POST /internal/account-balances      "{\"user_id\":\"$UID_\",\"accounts\":[]}"

echo
echo "─────────────────────────────────────────────────────────────────────"
printf '  %d passed, %d failed\n' "$pass" "$fail"
if [ "$fail" -gt 0 ]; then
  echo
  echo "  If everything returned 500 \"WORKER_API_KEY is not configured\", the"
  echo "  function secrets are not set. Supabase dashboard → Edge Functions →"
  echo "  Secrets: add WORKER_API_KEY and ENCRYPTION_KEY."
  exit 1
fi
echo "  Gateway matches the worker contract."
