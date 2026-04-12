export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

export class Logger {
  private level: number;

  constructor(level: LogLevel = "info") {
    this.level = LEVELS[level];
  }

  debug(msg: string, ctx?: Record<string, unknown>): void {
    this.write("debug", msg, ctx);
  }

  info(msg: string, ctx?: Record<string, unknown>): void {
    this.write("info", msg, ctx);
  }

  warn(msg: string, ctx?: Record<string, unknown>): void {
    this.write("warn", msg, ctx);
  }

  error(msg: string, ctx?: Record<string, unknown>): void {
    this.write("error", msg, ctx);
  }

  private write(
    level: Exclude<LogLevel, "silent">,
    msg: string,
    ctx?: Record<string, unknown>,
  ): void {
    if (LEVELS[level] < this.level) return;

    const entry: Record<string, unknown> = {
      level,
      msg,
      ...ctx,
      ts: new Date().toISOString(),
    };

    // Serialize Error objects in context
    for (const [k, v] of Object.entries(entry)) {
      if (v instanceof Error) {
        entry[k] = v.message;
      }
    }

    const line = JSON.stringify(entry);
    const dest = level === "error" ? process.stderr : process.stdout;
    dest.write(line + "\n");
  }
}

const envLevel = (process.env.ALOOK_LOG_LEVEL as LogLevel) || "info";
export const log = new Logger(envLevel);
