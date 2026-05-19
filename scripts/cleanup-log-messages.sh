#!/bin/bash
# Bulk delete 'log' type rows from task_message table in batches of 50k
# Run from repo root: bash scripts/cleanup-log-messages.sh

set -e
cd "$(dirname "$0")/../src/web"

BATCH=50000
TOTAL_DELETED=0

while true; do
  echo "Deleting batch of $BATCH rows..."
  RESULT=$(npx wrangler d1 execute alook-app --remote --json --command "DELETE FROM task_message WHERE type = 'log' LIMIT $BATCH;" 2>&1)

  if echo "$RESULT" | grep -q '"error"'; then
    echo "D1 overloaded, waiting 30s before retry..."
    sleep 30
    continue
  fi

  CHANGES=$(echo "$RESULT" | grep -o '"changes": [0-9]*' | head -1 | grep -o '[0-9]*')
  TOTAL_DELETED=$((TOTAL_DELETED + CHANGES))
  echo "Deleted $CHANGES rows (total: $TOTAL_DELETED)"

  if [ "$CHANGES" -lt "$BATCH" ]; then
    echo "Done! Total deleted: $TOTAL_DELETED"
    break
  fi

  sleep 5
done
