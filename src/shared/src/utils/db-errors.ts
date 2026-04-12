/**
 * Returns true when the error represents a SQLite UNIQUE constraint violation,
 * whether thrown directly by the driver or wrapped by DrizzleQueryError (0.44+).
 */
export function isUniqueConstraintError(err: unknown): boolean {
  if (err instanceof Error) {
    const e = err as Error & { code?: string; cause?: unknown };
    if (e.code === "SQLITE_CONSTRAINT_UNIQUE") return true;
    if (e.message.includes("UNIQUE")) return true;
    // DrizzleQueryError (0.44+) wraps the driver error as .cause
    if (e.cause) return isUniqueConstraintError(e.cause);
  }
  return false;
}
