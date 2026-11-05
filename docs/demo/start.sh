#!/usr/bin/env bash
# Build LWTS as a production build, start it with a fresh SQLite database and seed the demo board.
# Usage: docs/demo/start.sh [port]        (needs Go and Node.js 20+; stop the server with: kill $(cat "$LWTS_DEMO_DIR/lwts.pid"))
# LWTS_DEMO_DIR picks the working directory for the build and the database (default: a new temporary directory).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${1:-8090}"
RUN="${LWTS_DEMO_DIR:-$(mktemp -d)}"
export LWTS_DEMO_DIR="$RUN"
PASSWORD=spared-no-expense

echo "Building into $RUN"
(cd "$ROOT" && go build -o "$RUN/lwts" ./server/cmd)
(cd "$ROOT/web" && npm ci --silent --no-audit --no-fund && npx vite build --outDir "$RUN/dist" --emptyOutDir >/dev/null)

rm -f "$RUN"/demo.db*
export DB_URL="sqlite://$RUN/demo.db" JWT_SECRET=demo-only-secret PORT LOG_LEVEL=warn STATIC_DIR="$RUN/dist"
unset DEV
"$RUN/lwts" migrate >/dev/null
"$RUN/lwts" user-create "John Hammond" hammond@isla-nublar.test "$PASSWORD" --role=owner >/dev/null
for u in "Ray Arnold:arnold" "Dennis Nedry:nedry" "Robert Muldoon:muldoon" "Henry Wu:wu" \
         "Donald Gennaro:gennaro" "Ellie Sattler:sattler" "Alan Grant:grant" "Ian Malcolm:malcolm"; do
  "$RUN/lwts" user-create "${u%%:*}" "${u##*:}@isla-nublar.test" "$PASSWORD" >/dev/null
done

(cd "$RUN" && exec "$RUN/lwts" >"$RUN/lwts.log" 2>&1) &
echo $! >"$RUN/lwts.pid"
for _ in $(seq 1 40); do curl -sf "http://localhost:$PORT/healthz" >/dev/null && break; sleep 0.25; done
curl -sf "http://localhost:$PORT/healthz" >/dev/null || { echo "server did not start:"; tail "$RUN/lwts.log"; exit 1; }

node "$ROOT/docs/demo/seed.mjs" "http://localhost:$PORT" "$PASSWORD"
echo "Open http://localhost:$PORT and log in as hammond@isla-nublar.test / $PASSWORD"
