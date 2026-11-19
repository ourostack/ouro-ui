import { type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { useThemePreset, type ThemePresetValue } from "@/registry/ouro/lib/ouro/theme-preset";

const roots: Root[] = [];
let mounted: Element[] = [];
const html = document.documentElement;
const presets = ["pearl", "abyss", "brass"];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
}

function Probe({ seen, names = presets, storageKey }: { seen: ThemePresetValue[]; names?: string[]; storageKey?: string }) {
  seen.push(useThemePreset(names, storageKey ? { storageKey } : {}));
  return null;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
  for (const key of ["ouro-theme-preset", "app-look", "private-look"]) localStorage.removeItem(key);
  html.removeAttribute("data-theme");
});

describe("useThemePreset", () => {
  it("reports the first preset until a choice is kept, and a kept one after", async () => {
    const seen: ThemePresetValue[] = [];
    await render(<Probe seen={seen} />);
    expect(seen.at(-1)!.preset).toBe("pearl");
    localStorage.setItem("ouro-theme-preset", "brass");
    await render(<Probe seen={seen} />);
    expect(seen.at(-1)!.preset).toBe("brass");
  });

  it("keeps a choice, sets data-theme and tells every reader", async () => {
    const first: ThemePresetValue[] = [];
    const second: ThemePresetValue[] = [];
    await render(<Probe seen={first} />);
    await render(<Probe seen={second} />);
    await act(async () => first.at(-1)!.setPreset("abyss"));
    expect(localStorage.getItem("ouro-theme-preset")).toBe("abyss");
    expect(html.getAttribute("data-theme")).toBe("abyss");
    expect(first.at(-1)!.preset).toBe("abyss");
    expect(second.at(-1)!.preset).toBe("abyss");
  });

  it("refuses a name that is not a preset", async () => {
    const seen: ThemePresetValue[] = [];
    await render(<Probe seen={seen} />);
    await act(async () => seen.at(-1)!.setPreset("sepia"));
    expect(localStorage.getItem("ouro-theme-preset")).toBeNull();
    expect(html.hasAttribute("data-theme")).toBe(false);
  });

  it("follows another tab's choice", async () => {
    const seen: ThemePresetValue[] = [];
    await render(<Probe seen={seen} storageKey="app-look" />);
    localStorage.setItem("app-look", "abyss");
    await act(async () => void window.dispatchEvent(new StorageEvent("storage", { key: "app-look" })));
    expect(seen.at(-1)!.preset).toBe("abyss");
  });

  it("still switches where the browser refuses localStorage", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    const seen: ThemePresetValue[] = [];
    await render(<Probe seen={seen} storageKey="private-look" />);
    await act(async () => seen.at(-1)!.setPreset("brass"));
    expect(seen.at(-1)!.preset).toBe("brass");
    expect(html.getAttribute("data-theme")).toBe("brass");
  });
});
