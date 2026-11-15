import { describe, expect, it } from "vitest";
import { registerSquirclePolyfill } from "@/registry/ouro/lib/ouro/squircle-polyfill";

describe("registerSquirclePolyfill", () => {
  it("keeps the polyfill's own colour transitions from marking corners dirty", async () => {
    expect(document.querySelector("style[data-hyperellipse]")).toBeNull();
    await registerSquirclePolyfill();
    expect(document.querySelector("style[data-hyperellipse]")).not.toBeNull();
    const make = (type: string, propertyName: string) => {
      const event = new Event(type, { bubbles: true });
      Object.assign(event, { propertyName });
      return event;
    };
    let count = 0;
    const count1 = () => count++;
    for (const type of ["transitionrun", "transitionend"]) {
      document.body.addEventListener(type, count1);
      for (const name of ["border-top-color", "outline-color", "box-shadow"]) document.body.dispatchEvent(make(type, name));
      expect(count).toBe(0);
      for (const name of ["width", "xborder-top-color", "border-top-colorx", "xbox-shadow", "box-shadowx"]) document.body.dispatchEvent(make(type, name));
      expect(count).toBe(5);
      document.body.removeEventListener(type, count1);
      count = 0;
    }
  });
});
