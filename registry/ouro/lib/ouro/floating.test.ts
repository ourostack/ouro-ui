import { describe, expect, it } from "vitest";
import { floatingHint } from "@/registry/ouro/lib/ouro/floating";

describe("floatingHint", () => {
  const hint = floatingHint('<Popover title="…">', "</Popover>");

  it("points a radius class at the theme radius", () => {
    expect(hint("rounded-xl")).toBe(":root { --radius: 0.75rem }");
  });

  it("wraps a text class around the body", () => {
    expect(hint("text-lg")).toBe('<Popover title="…"><div className="text-lg">…</div></Popover>');
  });

  it("points a color class at the popover colors", () => {
    expect(hint("bg-white")).toBe(":root { --popover: …; } .dark { --popover: …; }");
  });
});
