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
pm2 reload "$API_PM2" --update-env

echo "==> Nuxt (app/)"
cd "$APP_DIR/app"
npm ci --no-audit --no-fund
npm run build
pm2 reload "$WEB_PM2" --update-env

pm2 save
echo "==> Deployed $(git -C "$APP_DIR" log -1 --format='%h')"
