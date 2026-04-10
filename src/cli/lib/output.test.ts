import { vi, describe, it, expect, beforeEach } from "vitest";
import { printJSON, printTable } from "./output.js";

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.restoreAllMocks();
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("printJSON", () => {
  it("outputs pretty-printed JSON with 2-space indent", () => {
    const data = { name: "test", count: 42 };
    printJSON(data);
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify(data, null, 2));
  });
});

describe("printTable", () => {
  it("prints aligned columns with headers and separator", () => {
    const headers = ["ID", "NAME", "STATUS"];
    const rows = [
      ["1", "alpha", "active"],
      ["22", "beta-long", "inactive"],
    ];

    printTable(headers, rows);

    const calls = logSpy.mock.calls.map((c) => c[0]);

    expect(calls[0]).toBe("ID  NAME       STATUS  ");
    expect(calls[1]).toBe("--  ---------  --------");
    expect(calls[2]).toBe("1   alpha      active  ");
    expect(calls[3]).toBe("22  beta-long  inactive");
  });
});
