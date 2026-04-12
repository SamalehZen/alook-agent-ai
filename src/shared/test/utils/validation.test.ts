import { describe, it, expect } from "vitest"
import { isValidToken, isValidEmail } from "../../src/utils/validation"
describe("isValidToken", () => {
  it("accepts alook_tk_ + 12", () => expect(isValidToken("alook_tk_abcdefghijkl")).toBe(true))
  it("rejects wrong prefix", () => expect(isValidToken("sk_abcdefghijkl")).toBe(false))
  it("rejects short suffix", () => expect(isValidToken("alook_tk_short")).toBe(false))
})
describe("isValidEmail", () => {
  it("valid", () => expect(isValidEmail("u@example.com")).toBe(true))
  it("invalid", () => expect(isValidEmail("notanemail")).toBe(false))
})
