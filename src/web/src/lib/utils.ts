import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const CLI_CMD =
  process.env.NODE_ENV === "development" ? "pnpm dev:cli" : "npx @alook/cli";
