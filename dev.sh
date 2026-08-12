#!/usr/bin/env bash
# Launch the Vault backend (API on :5100) and frontend (Angular on :4200) together.
# Ctrl+C stops both, including the child processes they spawn.
#
#   ./dev.sh              # both
#   ./dev.sh api          # backend only
#   ./dev.sh web          # frontend only
#   API_PORT=5200 WEB_PORT=4300 ./dev.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_PORT="${API_PORT:-5100}"
WEB_PORT="${WEB_PORT:-4200}"
WHAT="${1:-all}"

# Process-group ids, so shutdown reaches `dotnet run`'s Vault.Api child and
# `npx`'s ng serve child — killing only the launcher leaves those orphaned.
pgids=()

# Colored, prefixed log lines so the two servers stay readable side by side.
prefix() {
  local tag="$1" color="$2"
  while IFS= read -r line; do
    printf '\033[%sm[%s]\033[0m %s\n' "$color" "$tag" "$line"
  done
}

port_busy() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
}

# Runs a command in its own session/process group, output piped through prefix().
spawn() {
  local tag="$1" color="$2" dir="$3"
  shift 3
  setsid bash -c 'cd "$1" || exit 1; shift; exec "$@"' _ "$dir" "$@" \
    > >(prefix "$tag" "$color") 2>&1 &
  pgids+=("$!")
}

shutdown() {
  trap - INT TERM EXIT
  echo
  echo "Stopping..."
  for pgid in "${pgids[@]:-}"; do
    [[ -n "$pgid" ]] && kill -TERM -- "-$pgid" 2>/dev/null
  done
  # Give them a moment to exit cleanly, then insist.
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    local alive=0
    for pgid in "${pgids[@]:-}"; do
      [[ -n "$pgid" ]] && kill -0 -- "-$pgid" 2>/dev/null && alive=1
    done
    [[ "$alive" == 0 ]] && break
    sleep 1
  done
  for pgid in "${pgids[@]:-}"; do
    [[ -n "$pgid" ]] && kill -KILL -- "-$pgid" 2>/dev/null
  done
  wait 2>/dev/null
}
trap shutdown INT TERM EXIT

start_api() {
  if port_busy "$API_PORT"; then
    echo "!! port $API_PORT is already in use — skipping the API" >&2
    return 1
  fi
  echo ">> API      http://localhost:$API_PORT"
  spawn api 36 "$ROOT/backend" \
    dotnet run --project src/Vault.Api --urls "http://0.0.0.0:$API_PORT"
}

start_web() {
  if port_busy "$WEB_PORT"; then
    echo "!! port $WEB_PORT is already in use — skipping the frontend" >&2
    return 1
  fi
  [[ -d "$ROOT/frontend/node_modules" ]] || (cd "$ROOT/frontend" && npm install)
  echo ">> Frontend http://localhost:$WEB_PORT"
  spawn web 35 "$ROOT/frontend" \
    npx ng serve --host 0.0.0.0 --port "$WEB_PORT"
}

case "$WHAT" in
  api) start_api ;;
  web|frontend) start_web ;;
  all)
    if start_api; then
      # Let the API bind first so the SPA's initial /api/setup/status call lands.
      for _ in $(seq 1 90); do
        port_busy "$API_PORT" && break
        sleep 1
      done
    fi
    start_web
    ;;
  *) echo "usage: ./dev.sh [all|api|web]" >&2; exit 2 ;;
esac

wait
