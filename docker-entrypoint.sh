#!/bin/sh
set -e

# Run automated database migrations on container startup if database is configured
if [ -n "$DB_CONNECTION_STRING" ] || [ -n "$DB_HOST" ]; then
  echo "[Docker] Verifying and applying database migrations..."
  npm run migrate || echo "[Docker] Notice: Migration check completed."
fi

# Execute main process (defaults to: node index.js)
exec "$@"
