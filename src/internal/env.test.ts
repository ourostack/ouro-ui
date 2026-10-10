import { afterEach, describe, expect, it, vi } from "vitest";
import { isProduction } from "./env.ts";

afterEach(() => vi.unstubAllGlobals());

// The test bundler replaces `process.env.NODE_ENV` with "test" at transform
// time, so a real "production" value cannot be injected here. These tests cover
// both operands of the guard; consumers' bundlers do the real replacement.
describe("isProduction", () => {
  it("is false in a browser with no process object", () => {
    expect(typeof process).toBe("undefined");
    expect(isProduction()).toBe(false);
  });

  it("is false when a process object exists and NODE_ENV is not production", () => {
    vi.stubGlobal("process", { env: { NODE_ENV: "development" } });
    expect(isProduction()).toBe(false);
  });
});
