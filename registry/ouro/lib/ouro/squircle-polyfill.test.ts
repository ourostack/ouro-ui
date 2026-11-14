import { describe, expect, it, vi } from "vitest";
import { registerHyperellipse } from "hyperellipse";
import { registerSquirclePolyfill } from "@/registry/ouro/lib/ouro/squircle-polyfill";

vi.mock("hyperellipse", () => ({ registerHyperellipse: vi.fn(() => () => {}) }));

describe("registerSquirclePolyfill", () => {
  it("loads and registers the polyfill only when called", async () => {
    expect(registerHyperellipse).not.toHaveBeenCalled();
    await registerSquirclePolyfill();
    expect(registerHyperellipse).toHaveBeenCalledTimes(1);
  });
});
