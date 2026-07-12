#!/bin/sh
set -eu

if [ "${ALLOW_DESTRUCTIVE_RESTORE:-false}" != "true" ]; then
  printf '%s\n' 'Refusing restore. Set ALLOW_DESTRUCTIVE_RESTORE=true after verifying the target database.' >&2
  exit 2
fi

: "${DATABASE_URL:?DATABASE_URL is required}"
backup=${1:?Usage: restore-postgres.sh <backup.dump>}

if [ ! -r "$backup" ]; then
  printf 'Backup is not readable: %s\n' "$backup" >&2
  exit 2
fi

if [ -f "${backup}.sha256" ]; then
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum --check "${backup}.sha256"
  else
    shasum -a 256 --check "${backup}.sha256"
  fi
fi

pg_restore \
  --dbname="$DATABASE_URL" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  "$backup"

printf '%s\n' 'Restore completed. Run migrations and the documented smoke checks before serving traffic.'
