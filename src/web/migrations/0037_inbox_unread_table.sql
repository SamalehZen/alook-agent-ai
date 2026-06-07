-- Create the inbox_unread table for fast unread inbox loading
CREATE TABLE IF NOT EXISTS inbox_unread (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  task_status TEXT NOT NULL,
  task_prompt TEXT,
  completed_at TEXT NOT NULL,
  latest_message_id TEXT,
  UNIQUE(conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_inbox_unread_user_ws
  ON inbox_unread(user_id, workspace_id, task_type, completed_at);

-- Backfill from existing data: insert the latest eligible completed/failed root task
-- per conversation that hasn't been read yet.
INSERT INTO inbox_unread (id, conversation_id, user_id, workspace_id, agent_id, task_id, task_type, task_status, task_prompt, completed_at, latest_message_id)
SELECT lower(hex(randomblob(11))), c.id, c.user_id, c.workspace_id, c.agent_id, t.id, t.type, t.status, t.prompt, t.completed_at,
       (SELECT id FROM message WHERE conversation_id = c.id AND role = 'assistant' AND status = 'active' ORDER BY created_at DESC LIMIT 1)
FROM agent_task_queue t
INNER JOIN conversation c ON c.id = t.conversation_id
LEFT JOIN conversation_read_state crs ON crs.conversation_id = c.id AND crs.user_id = c.user_id
WHERE t.parent_task_id IS NULL
  AND t.trace_id IS NOT NULL
  AND t.type IN ('user_dm_message', 'email_notification', 'calendar_event')
  AND t.status IN ('completed', 'failed')
  AND t.completed_at > COALESCE(crs.last_read_at, '1970-01-01T00:00:00.000Z')
  AND NOT (t.type = 'email_notification' AND COALESCE(json_extract(t.context, '$.isInternal'), 0) = 1)
  AND t.id = (
    SELECT id FROM agent_task_queue sub
    WHERE sub.workspace_id = t.workspace_id AND sub.conversation_id = c.id
      AND sub.parent_task_id IS NULL AND sub.trace_id IS NOT NULL
      AND sub.type IN ('user_dm_message', 'email_notification', 'calendar_event')
      AND sub.status IN ('completed', 'failed')
      AND NOT (sub.type = 'email_notification' AND COALESCE(json_extract(sub.context, '$.isInternal'), 0) = 1)
    ORDER BY sub.completed_at DESC LIMIT 1
  )
ON CONFLICT(conversation_id, user_id) DO NOTHING;
