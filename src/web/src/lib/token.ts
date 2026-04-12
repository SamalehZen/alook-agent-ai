import { randomBytes } from "crypto";

export function generateMachineToken(): string {
  const bytes = randomBytes(24);
  return "al_" + bytes.toString("hex");
}
