#!/usr/bin/env bash
set -euo pipefail

# Idempotent test DB setup: ensures alook_test exists and schema is current.
# Uses docker compose exec to run commands inside the postgres container,
# so no local pg client tools are required.

PGUSER="${PGUSER:-postgres}"
PGPASSWORD="${PGPASSWORD:-postgres}"
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
TEST_DB="alook_test"

echo "Waiting for PostgreSQL to be ready..."
until docker compose exec postgres pg_isready -U "$PGUSER" -q 2>/dev/null; do
  sleep 1
done
echo "PostgreSQL is ready."

# Create test database if it doesn't exist
if ! docker compose exec postgres psql -U "$PGUSER" -lqt | cut -d \| -f 1 | grep -qw "$TEST_DB"; then
  echo "Creating database $TEST_DB..."
  docker compose exec postgres createdb -U "$PGUSER" "$TEST_DB"
else
  echo "Database $TEST_DB already exists."
fi

# Push schema to test database
echo "Pushing Drizzle schema to $TEST_DB..."
cd src/web && DATABASE_URL="postgres://$PGUSER:$PGPASSWORD@$PGHOST:$PGPORT/$TEST_DB?sslmode=disable" \
  pnpm drizzle-kit push --force

echo "Test database setup complete."
