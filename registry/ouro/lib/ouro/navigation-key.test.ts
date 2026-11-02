import { afterEach, describe, expect, it, vi } from "vitest";
import { navigationKey } from "@/registry/ouro/lib/ouro/navigation-key";

const press = (key: string, held: Partial<Record<"altKey" | "ctrlKey" | "metaKey" | "shiftKey", boolean>> = {}) => ({ key, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...held });

/** Runs the browser as `platform`, through User-Agent Client Hints where the browser has them. */
function onPlatform(platform: string) {
  vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
  if ("userAgentData" in navigator) vi.spyOn(navigator as Navigator & { userAgentData: { platform: string } }, "userAgentData", "get").mockReturnValue({ platform } as never);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("navigationKey", () => {
  it("reads a key with no modifier as itself, on any platform", () => {
    for (const platform of ["MacIntel", "Win32"]) {
      onPlatform(platform);
      expect(["ArrowUp", "Home", "PageDown", "a"].map((key) => navigationKey(press(key)))).toEqual(["ArrowUp", "Home", "PageDown", "a"]);
    }
  });

  it("reads ⌘↑ and ⌘↓ as Home and End, and ⌥↑ and ⌥↓ as Page Up and Page Down, on an Apple platform", () => {
    for (const platform of ["MacIntel", "macOS", "iPad", "iPhone"]) {
      onPlatform(platform);
      expect(navigationKey(press("ArrowUp", { metaKey: true }))).toBe("Home");
      expect(navigationKey(press("ArrowDown", { metaKey: true }))).toBe("End");
      expect(navigationKey(press("ArrowUp", { altKey: true }))).toBe("PageUp");
      expect(navigationKey(press("ArrowDown", { altKey: true }))).toBe("PageDown");
    }
  });

  it("asks User-Agent Client Hints for the platform first, and navigator.platform without them", () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("Win32");
    Object.defineProperty(navigator, "userAgentData", { configurable: true, get: () => ({ platform: "macOS" }) });
    expect(navigationKey(press("ArrowUp", { metaKey: true }))).toBe("Home");
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    Object.defineProperty(navigator, "userAgentData", { configurable: true, get: () => undefined });
    expect(navigationKey(press("ArrowUp", { metaKey: true }))).toBe("Home");
    delete (navigator as unknown as Record<string, unknown>).userAgentData;
  });

  it("leaves a key with a modifier alone, and the same keys elsewhere than an Apple platform", () => {
    onPlatform("MacIntel");
    expect(navigationKey(press("ArrowLeft", { metaKey: true }))).toBeNull();
    expect(navigationKey(press("Home", { altKey: true }))).toBeNull();
    expect(navigationKey(press("ArrowUp", { metaKey: true, altKey: true }))).toBeNull();
    expect(navigationKey(press("ArrowUp", { metaKey: true, shiftKey: true }))).toBeNull();
    expect(navigationKey(press("ArrowDown", { ctrlKey: true }))).toBeNull();
    expect(navigationKey(press("ArrowDown", { shiftKey: true }))).toBeNull();
    for (const platform of ["Win32", "Linux x86_64"]) {
      onPlatform(platform);
      expect(navigationKey(press("ArrowUp", { metaKey: true }))).toBeNull();
      expect(navigationKey(press("ArrowDown", { altKey: true }))).toBeNull();
    }
  });
});
