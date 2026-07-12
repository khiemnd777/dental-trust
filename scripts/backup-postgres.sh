#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"

backup_directory=${BACKUP_DIRECTORY:-./backups}
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
output=${1:-"${backup_directory}/dental-trust-${timestamp}.dump"}

mkdir -p "$(dirname "$output")"
umask 077

pg_dump \
  --dbname="$DATABASE_URL" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-privileges \
  --file="$output"

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$output" > "${output}.sha256"
else
  shasum -a 256 "$output" > "${output}.sha256"
fi
printf 'Backup created: %s\n' "$output"
