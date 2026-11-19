import { afterEach, describe, expect, it, vi } from "vitest";
import { themePresetScript } from "@/registry/ouro/lib/ouro/theme-preset-script";

const root = document.documentElement;
const run = (script: string) => new Function(script)() as void;

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.removeItem("ouro-theme-preset");
  localStorage.removeItem("app-look");
  root.removeAttribute("data-theme");
});

describe("themePresetScript", () => {
  it("sets a kept preset as data-theme", () => {
    localStorage.setItem("ouro-theme-preset", "abyss");
    run(themePresetScript(["pearl", "abyss"]));
    expect(root.getAttribute("data-theme")).toBe("abyss");
  });

  it("falls back to the first preset, or the one the app names, when nothing is kept", () => {
    run(themePresetScript(["pearl", "abyss"]));
    expect(root.getAttribute("data-theme")).toBe("pearl");
    run(themePresetScript(["pearl", "abyss"], { defaultPreset: "abyss" }));
    expect(root.getAttribute("data-theme")).toBe("abyss");
  });

  it("ignores a kept name that is not one of the presets", () => {
    localStorage.setItem("ouro-theme-preset", "sepia");
    run(themePresetScript(["pearl", "abyss"]));
    expect(root.getAttribute("data-theme")).toBe("pearl");
  });

  it("reads the app's own key, and escapes it", () => {
    localStorage.setItem("app-look", "abyss");
    run(themePresetScript(["pearl", "abyss"], { storageKey: "app-look" }));
    expect(root.getAttribute("data-theme")).toBe("abyss");
    expect(themePresetScript(["a"], { storageKey: 'a"b' })).toContain('localStorage.getItem("a\\"b")');
  });

  it("uses the default when the browser refuses localStorage, and sets nothing without presets", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    run(themePresetScript(["pearl", "abyss"]));
    expect(root.getAttribute("data-theme")).toBe("pearl");
    root.removeAttribute("data-theme");
    run(themePresetScript([]));
    expect(root.hasAttribute("data-theme")).toBe(false);
  });
});
