#!/usr/bin/env bash
# Deploys the apps to the server (DigitalOcean droplet, `ssh aming`):
#
#   scripts/deploy.sh client|factory|all     build here, upload, switch, restart, check
#   scripts/deploy.sh rollback client|factory back to the previous release
#
# The server keeps each app's settings (/etc/aming-<app>.env); they're fetched
# for the build, since NEXT_PUBLIC_* values are baked into it. The build is
# made on this Mac (the server is too small to build) as a standalone app,
# with the server's own image tool (sharp for Linux) put in its place.
set -euo pipefail

HOST=aming
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
chmod 700 "$WORK"

url_of() { [ "$1" = client ] && echo https://www.amingspace.com/ || echo https://factory.amingltd.com/; }

deploy() {
  local app=$1
  echo "▸ $app: settings"
  scp -q "$HOST:/etc/aming-$app.env" "$WORK/$app.env"

  echo "▸ $app: build"
  (cd "$ROOT" && node -e '
    const fs = require("fs"), { spawnSync } = require("child_process");
    const env = { ...process.env };
    for (const line of fs.readFileSync(process.argv[1], "utf8").split("\n")) { const i = line.indexOf("="); if (i > 0) env[line.slice(0, i)] = line.slice(i + 1); }
    delete env.PORT; delete env.HOSTNAME;
    process.exit(spawnSync("npm", ["run", "build:" + process.argv[2]], { env, stdio: "inherit" }).status ?? 1);
  ' "$WORK/$app.env" "$app") > "$WORK/build.log" 2>&1 || { tail -30 "$WORK/build.log"; exit 1; }

  echo "▸ $app: package"
  local out="$ROOT/apps/$app/.next/standalone"
  rm -rf "$out/apps/$app/.next/static" "$out/apps/$app/public"
  cp -R "$ROOT/apps/$app/.next/static" "$out/apps/$app/.next/static"
  [ -d "$ROOT/apps/$app/public" ] && cp -R "$ROOT/apps/$app/public" "$out/apps/$app/public"
  rm -rf "$out"/node_modules/@img/sharp-darwin-* "$out"/node_modules/@img/sharp-libvips-darwin-*
  tar -czf "$WORK/$app.tgz" -C "$out" .

  echo "▸ $app: upload and switch"
  scp -q "$WORK/$app.tgz" "$HOST:/tmp/$app.tgz"
  ssh "$HOST" "bash -s" "$app" <<'REMOTE'
set -e
app=$1
rel=/srv/aming/$app/releases/$(date +%Y%m%d%H%M%S)
mkdir -p "$rel" && tar -xzf /tmp/$app.tgz -C "$rel"
cp -R /tmp/sharp-linux/node_modules/@img/. "$rel/node_modules/@img/"
chown -R aming:aming "$rel"
ln -sfn "$rel" /srv/aming/$app/current
ls -1dt /srv/aming/$app/releases/* | tail -n +4 | xargs -r rm -rf
rm -f /tmp/$app.tgz
systemctl restart aming-$app
REMOTE
  check "$app"
}

rollback() {
  local app=$1
  ssh "$HOST" "bash -s" "$app" <<'REMOTE'
set -e
app=$1
current=$(readlink -f /srv/aming/$app/current)
previous=$(ls -1dt /srv/aming/$app/releases/* | grep -vx "$current" | head -1)
[ -n "$previous" ] || { echo "No earlier release to go back to."; exit 1; }
ln -sfn "$previous" /srv/aming/$app/current
systemctl restart aming-$app
echo "Now on $(basename "$previous")"
REMOTE
  check "$app"
}

check() {
  local app=$1 url code
  url=$(url_of "$app")
  for _ in $(seq 1 20); do
    code=$(curl -s -o /dev/null --max-time 15 -w '%{http_code}' "$url" || true)
    [ "$code" = 200 ] && { echo "✓ $app is up ($url)"; return; }
    sleep 3
  done
  echo "✗ $app answers $code at $url — see: ssh $HOST journalctl -u aming-$app -n 50"; exit 1
}

case "${1:-}" in
  client | factory) deploy "$1" ;;
  all) deploy client; deploy factory ;;
  rollback) [ "${2:-}" = client ] || [ "${2:-}" = factory ] || { echo "rollback client|factory"; exit 1; }; rollback "$2" ;;
  *) echo "Usage: scripts/deploy.sh client|factory|all  |  scripts/deploy.sh rollback client|factory"; exit 1 ;;
esac
