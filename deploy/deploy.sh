#!/usr/bin/env bash
# Production deploy, run ON THE SERVER (by GitHub Actions over SSH, or by hand).
# Same steps as deploying from the web terminal: pull main, install, build, reload PM2.
#
#   APP_DIR=/path/to/plannity WEB_PM2=plannity-web API_PM2=plannity-api bash deploy/deploy.sh
#
# .env files are git-ignored, so the hard reset below never touches them.
set -euo pipefail

APP_DIR="${APP_DIR:?set APP_DIR to the repo folder on the server}"
WEB_PM2="${WEB_PM2:?set WEB_PM2 to the PM2 name of the Nuxt app}"
API_PM2="${API_PM2:?set API_PM2 to the PM2 name of Strapi}"
BRANCH="${BRANCH:-main}"

# Load nvm if Node was installed with it (non-interactive SSH shells don't read .bashrc).
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

echo "==> Node $(node -v), npm $(npm -v), PM2 $(pm2 -v)"

# The folder a PM2 process actually runs from. If it isn't inside APP_DIR, this
# deploy would build one copy of the project while PM2 serves another — stop.
pm2_cwd() { pm2 jlist | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const p=JSON.parse(s).find(x=>x.name===process.argv[1]);process.stdout.write(p?String(p.pm2_env.pm_cwd||""):"")})' "$1"; }
check_cwd() {
  local name="$1" want="$2" cwd
  cwd="$(pm2_cwd "$name")"
  [ -n "$cwd" ] || { echo "PM2 has no process named '$name' (see: pm2 ls)"; exit 1; }
  case "$(cd "$cwd" && pwd -P)/" in
    "$(cd "$want" && pwd -P)/"*) echo "    $name runs from $cwd ✓" ;;
    *) echo "PM2 '$name' runs from $cwd, but this deploy builds $want. Fix APP_DIR or restart the process from the right folder."; exit 1 ;;
  esac
}
check_cwd "$API_PM2" "$APP_DIR/server"
check_cwd "$WEB_PM2" "$APP_DIR/app"

# One deploy at a time.
exec 9>/tmp/plannity-deploy.lock
flock -n 9 || { echo "Another deploy is running"; exit 1; }

cd "$APP_DIR"
echo "==> Updating code to origin/$BRANCH"
git fetch --prune origin "$BRANCH"
git reset --hard "origin/$BRANCH"
echo "    now at $(git log -1 --format='%h %s')"

# Optional: database backup before Strapi starts (Strapi changes the schema on boot).
if [ -n "${BACKUP_DB_URL:-}" ]; then
  mkdir -p "$HOME/backups"
  file="$HOME/backups/plannity-$(date +%Y%m%d-%H%M%S).sql.gz"
  echo "==> Backing up database to $file"
  pg_dump "$BACKUP_DB_URL" | gzip > "$file"
  ls -1t "$HOME"/backups/plannity-*.sql.gz | tail -n +15 | xargs -r rm -- # keep the last 14
fi

echo "==> Strapi (server/)"
cd "$APP_DIR/server"
npm ci --no-audit --no-fund
NODE_ENV=production npm run build
pm2 restart "$API_PM2" --update-env

echo "==> Nuxt (app/)"
cd "$APP_DIR/app"
npm ci --no-audit --no-fund
npm run build
# Make sure a fresh build was written where PM2 serves it from.
built="$APP_DIR/app/.output/server/index.mjs"
[ -n "$(find "$built" -newermt '-15 minutes' 2>/dev/null)" ] || { echo "No fresh Nuxt build at $built"; exit 1; }
echo "    built $(date -r "$built" '+%F %T')"
pm2 restart "$WEB_PM2" --update-env

pm2 save
echo "==> Deployed $(git -C "$APP_DIR" log -1 --format='%h')"
