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

  it("keeps the polyfill's own colour transitions from marking corners dirty", async () => {
    await registerSquirclePolyfill();
    const seen = vi.fn();
    const make = (type: string, propertyName: string) => {
      const event = new Event(type, { bubbles: true });
      Object.assign(event, { propertyName });
      document.body.dispatchEvent(event);
    };
    for (const type of ["transitionrun", "transitionend"]) {
      document.body.addEventListener(type, seen);
      for (const name of ["border-top-color", "outline-color", "box-shadow"]) make(type, name);
      expect(seen).not.toHaveBeenCalled();
      for (const name of ["width", "xborder-top-color", "border-top-colorx", "xbox-shadow", "box-shadowx"]) make(type, name);
      expect(seen).toHaveBeenCalledTimes(5);
      document.body.removeEventListener(type, seen);
      seen.mockClear();
    }
  });
});
