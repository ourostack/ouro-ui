import { describe, expect, it, vi } from "vitest";
import { registerSquirclePolyfill } from "@/registry/ouro/lib/ouro/squircle-polyfill";

const registerHyperellipse = vi.hoisted(() => vi.fn(() => () => {}));

vi.mock("hyperellipse", () => ({ registerHyperellipse }));

describe("registerSquirclePolyfill", () => {
  it("loads and registers the polyfill only when called", async () => {
    expect(registerHyperellipse).not.toHaveBeenCalled();
    await registerSquirclePolyfill();
    expect(registerHyperellipse).toHaveBeenCalledTimes(1);
  });
});
