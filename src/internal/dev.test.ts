import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { devThrow, devWarn } from "./dev.ts";
import { isProduction } from "./env.ts";

// Vite replaces `process.env.NODE_ENV` with "test" at transform time, so the
// production branch is exercised by mocking the environment check itself.
vi.mock("./env.ts", { spy: true });

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(isProduction).mockReset();
});

const production = () => vi.mocked(isProduction).mockReturnValue(true);

describe("devWarn", () => {
  it("uses the spec format", () => {
    devWarn("Button", "bg-red-500 sets appearance", 'tone="danger"', {});
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/^\[ouro-ui\] Button: .+\. Fix: .+\.$/);
  });

  it("warns once per key", () => {
    const key = {};
    devWarn("Button", "problem one", "fix one", key);
    devWarn("Button", "problem one", "fix one", key);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("warns separately for different keys and different messages on one key", () => {
    const a = {};
    devWarn("Button", "same problem", "same fix", a);
    devWarn("Button", "same problem", "same fix", {});
    devWarn("Button", "another problem", "same fix", a);
    expect(warn).toHaveBeenCalledTimes(3);
  });

  it("de-duplicates by message text when there is no key", () => {
    devWarn("Dialog", "keyless problem", "keyless fix");
    devWarn("Dialog", "keyless problem", "keyless fix");
    devWarn("Dialog", "other keyless problem", "keyless fix");
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("does not double a trailing period", () => {
    devWarn("Sheet", "ends with a period.", "also does.", {});
    expect(warn).toHaveBeenCalledWith("[ouro-ui] Sheet: ends with a period. Fix: also does.");
  });

  it("is a no-op in production", () => {
    production();
    devWarn("Button", "production problem", "production fix", {});
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("devThrow", () => {
  it("throws the full message in development", () => {
    expect(() => devThrow("Sheet.Title", "outside Sheet", "<Sheet title='x' />")).toThrow(
      "[ouro-ui] Sheet.Title: outside Sheet. Fix: <Sheet title='x' />.",
    );
  });

  it("throws without the fix in production", () => {
    production();
    expect(() => devThrow("Sheet.Title", "outside Sheet", "<Sheet title='x' />")).toThrow(
      /^\[ouro-ui\] Sheet\.Title: outside Sheet$/,
    );
  });
});
