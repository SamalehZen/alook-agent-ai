import { log } from "../logger";

export function logRequest(
  method: string,
  path: string,
  status: number,
  durationMs: number,
  requestId?: string,
  userId?: string
): void {
  if (path === "/health" || path === "/api/health") return;

  const ctx: Record<string, unknown> = {
    method,
    path,
    status,
    duration: `${durationMs}ms`,
  };
  if (requestId) ctx.request_id = requestId;
  if (userId) ctx.user_id = userId;

  if (status >= 500) log.error("http request", ctx);
  else if (status >= 400) log.warn("http request", ctx);
  else log.info("http request", ctx);
}
