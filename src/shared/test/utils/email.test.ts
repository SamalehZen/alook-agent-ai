import { describe, it, expect } from "vitest"
import { parseEmailHandle, toAlookAddress, isValidHandle } from "../../src/utils/email"
describe("parseEmailHandle", () => {
  it("extracts handle", () => expect(parseEmailHandle("jarvis@alook.ai")).toBe("jarvis"))
  it("empty for non-alook", () => expect(parseEmailHandle("u@gmail.com")).toBe(""))
})
describe("toAlookAddress", () => { it("appends domain", () => expect(toAlookAddress("jarvis")).toBe("jarvis@alook.ai")) })
describe("isValidHandle", () => {
  it("accepts 4+ alphanum+dash", () => { expect(isValidHandle("jarvis")).toBe(true); expect(isValidHandle("my-bot")).toBe(true) })
  it("rejects <4", () => expect(isValidHandle("abc")).toBe(false))
  it("rejects spaces/underscores", () => { expect(isValidHandle("my agent")).toBe(false); expect(isValidHandle("my_bot")).toBe(false) })
})
