import { drizzle, type AnyD1Database } from "drizzle-orm/d1";
import * as schema from "./schema";

export function createDb(d1: AnyD1Database) {
  return drizzle(d1, { schema });
}

export type Database = ReturnType<typeof createDb>;
