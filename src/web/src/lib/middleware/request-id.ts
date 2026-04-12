import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

export function getRequestId(req: Request): string {
  return req.headers.get("X-Request-ID") || randomUUID();
}

export function setRequestIdHeader(
  response: NextResponse,
  requestId: string
): NextResponse {
  response.headers.set("X-Request-ID", requestId);
  return response;
}
