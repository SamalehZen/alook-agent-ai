# Agent Email Inbox & Detail Sidebar

## Overview

Add a secondary navigation sidebar to the agent detail page with two sections: **Chat** (existing sessions list) and **Email** (new inbox view). Also add an email handle field to agent creation with live preview and validation.

## Features / Showcase

1. **Agent detail sidebar** — A slim vertical nav sidebar inside the agent content area with Chat and Email links. Active state follows the current route.
2. **Email inbox** — Per-agent email list with inline split-pane detail view. Left panel shows email list (sender, subject, time, status badge). Right panel shows full email content streamed from R2, plus linked task result if applicable.
3. **Email handle on agent creation** — New field in the agent create/edit form. Auto-derives handle from agent name (lowercase, hyphenated). User can override. Live preview shows `handle@alook.ai`. Validated with `isValidHandle` from `@alook/shared` (4+ chars, alphanumeric + hyphens). Uniqueness checked server-side.

## Architecture

### Route Structure

```
/w/[slug]/agents/[id]/             → layout.tsx (navbar + sidebar + content)
/w/[slug]/agents/[id]/             → page.tsx (redirect to ./chat)
/w/[slug]/agents/[id]/chat         → page.tsx (sessions list — moved from current page.tsx)
/w/[slug]/agents/[id]/email        → page.tsx (email inbox with inline split pane)
```

### Agent Detail Layout

The existing `agents/[id]/page.tsx` is split:

- **`layout.tsx`** — Contains the top navbar (agent name, status dot, edit/delete/cancel buttons), the edit mode with `AgentEditForm`, delete confirmation dialogs, and a flex row below: agent detail sidebar on the left (~160px), content outlet (`{children}`) on the right.
- **`page.tsx`** — Simple redirect to `./chat`.
- **`chat/page.tsx`** — The sessions list (new session button, conversation rows, empty state). This is the bulk of the current page.tsx content.

The top navbar and edit/delete functionality stay in the layout so they persist across Chat and Email views.

### Agent Detail Sidebar Component

`src/web/src/components/agent-detail-sidebar.tsx`

A simple client component — NOT the full shadcn Sidebar primitive (no collapse, no state management needed). Just a vertical nav with:
- Chat link (MessageSquare icon) — active when pathname includes `/chat`
- Email link (Mail icon) — active when pathname includes `/email`

Styled to match the app's warm, minimal aesthetic. Uses `usePathname()` for active state.

### Email Inbox Page

`agents/[id]/email/page.tsx`

Client component with horizontal split pane:
- **Left panel (~40%):** Email list fetched from `GET /api/email?agentId=X`. Each row: from (truncated), subject, relative timestamp, status badge ("triggered" / "forwarded"). Click to select. Selected row highlighted.
- **Right panel (~60%):** When an email is selected, shows: subject, from/to headers, received timestamp, email body (fetched from `GET /api/email/[emailId]/body`), and linked task result if the email triggered one. Empty state when nothing selected.

State is client-side (selectedEmailId). No route change on email selection.

### Email API Routes

All routes use `withAuth` + `withWorkspaceMember` middleware. Agent ownership verified via workspace membership.

**`GET /api/email?agentId=X`** (`src/web/src/app/api/email/route.ts`)
- Validates agentId belongs to the workspace
- Calls `queries.email.getEmailsByAgent(db, agentId)`
- Returns array of email objects

**`GET /api/email/[id]`** (`src/web/src/app/api/email/[id]/route.ts`)
- Fetches email by ID
- Verifies the email's agent belongs to the user's workspace
- Returns email metadata

**`GET /api/email/[id]/body`** (`src/web/src/app/api/email/[id]/body/route.ts`)
- Fetches email by ID, verifies workspace ownership
- Streams body from R2 using `env.EMAIL_BUCKET.get(email.r2Key)`
- Returns plain text response

### Email Handle on Agent Creation

**Form changes (`agent-edit-form.tsx`):**
- New "Email Handle" field between Description and Instructions
- Input with static `@alook.ai` suffix text
- When handle input is empty, derive preview from name: lowercase, replace non-alphanumeric with hyphens, collapse consecutive hyphens, strip leading/trailing hyphens
- Derived value shown as placeholder text
- Client-side validation with `isValidHandle`: show inline error "Must be 4+ characters, letters/numbers/hyphens only"
- On submit: send the handle (user-typed or derived) as `email_handle`

**Name-to-handle derivation:**
```
"My Cool Agent" → "my-cool-agent"
"Agent 1"       → "agent-1"
"AI!"           → "ai" (invalid — <4 chars, validation error shown)
```

**Type changes:**
- `Agent` interface: add `email_handle: string | null`
- `CreateAgentRequest`: add `email_handle?: string`
- `agentToResponse`: include `email_handle: a.emailHandle || null`

**API changes (`POST /api/agents`):**
- Accept `email_handle` from body
- If provided: validate with `isValidHandle`, check uniqueness via `agent.emailHandle` unique index
- If taken: return 409 "Handle already taken"
- Pass `emailHandle` to `queries.agent.createAgent`

**Query changes (`@alook/shared` `createAgent`):**
- Accept optional `emailHandle` parameter
- Include in insert values

## New Dependencies

None. All UI built with existing shadcn components (Button, Input, Badge, Card) and Tailwind.

## Files Changed

### New Files

| File | Purpose |
|------|---------|
| `src/web/src/app/(app)/w/[slug]/agents/[id]/layout.tsx` | Agent detail layout (navbar + sidebar + content) |
| `src/web/src/app/(app)/w/[slug]/agents/[id]/chat/page.tsx` | Sessions list (moved from current page.tsx) |
| `src/web/src/app/(app)/w/[slug]/agents/[id]/email/page.tsx` | Email inbox with inline split pane |
| `src/web/src/app/api/email/route.ts` | List emails endpoint |
| `src/web/src/app/api/email/[id]/route.ts` | Get email metadata endpoint |
| `src/web/src/app/api/email/[id]/body/route.ts` | Stream email body from R2 |
| `src/web/src/components/agent-detail-sidebar.tsx` | Slim nav sidebar (Chat / Email) |

### Email Response Shape

```typescript
interface EmailResponse {
  id: string;
  agent_id: string;
  from_email: string;
  to_email: string;
  subject: string;
  r2_key: string;
  is_whitelisted: boolean;
  forwarded: boolean;
  created_at: string;
}
```

An `emailToResponse` transformer will be added to `responses.ts`.

### Modified Files

| File | Change |
|------|--------|
| `src/web/src/app/(app)/w/[slug]/agents/[id]/page.tsx` | Replace with redirect to `./chat` |
| `src/web/src/components/agent-edit-form.tsx` | Add email handle field with live preview |
| `src/web/src/components/app-sidebar.tsx` | Update agent click to route to `/agents/[id]/chat` |
| `src/shared/src/types.ts` | Add `email_handle` to `Agent` and `CreateAgentRequest` |
| `src/shared/src/db/queries/agent.ts` | Accept `emailHandle` in `createAgent` |
| `src/web/src/lib/api/responses.ts` | Include `email_handle` in `agentToResponse` |
| `src/web/src/app/api/agents/route.ts` | Validate and pass `email_handle` on creation |
| `src/web/src/lib/api.ts` | Add email list/detail/body fetch functions |
| `src/web/src/contexts/agent-context.tsx` | Pass `email_handle` through create flow |
