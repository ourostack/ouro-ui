import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemePicker } from "@/registry/ouro/components/ouro/theme-picker/theme-picker";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const presets = [
  { name: "pearl", label: "Pearl", mood: "Clean white" },
  { name: "abyss", label: "Abyss", mood: "Pale aqua" },
];
const html = document.documentElement;
let host: HTMLElement | undefined;
let root: Root | undefined;

async function render(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
  return host;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => root?.unmount());
  host?.remove();
  localStorage.removeItem("ouro-theme-preset");
  html.removeAttribute("data-theme");
});

describe("ThemePicker", () => {
  it("keeps its fixed sizes at a compact --spacing", async () => {
    const host = await render(<ThemePicker presets={presets} />);
    const swatch = () => getComputedStyle(host.querySelector<HTMLElement>("span[data-theme]")!);
    expect([swatch().width, swatch().height]).toEqual(["24px", "24px"]);
    host.style.setProperty("--spacing", "0.2rem");
    expect([swatch().width, swatch().height]).toEqual(["24px", "24px"]);
  });
  it("switches the page, keeps the choice and presses the chosen dot", async () => {
    const el = await render(<ThemePicker presets={presets} />);
    const pearl = el.querySelector<HTMLButtonElement>('[aria-label="Pearl"]')!;
    const abyss = el.querySelector<HTMLButtonElement>('[aria-label="Abyss"]')!;
    expect(pearl.getAttribute("aria-pressed")).toBe("true");
    expect(el.textContent).toContain("Clean white");
    await act(async () => abyss.click());
    expect(abyss.getAttribute("aria-pressed")).toBe("true");
    expect(pearl.getAttribute("aria-pressed")).toBe("false");
    expect(html.getAttribute("data-theme")).toBe("abyss");
    expect(localStorage.getItem("ouro-theme-preset")).toBe("abyss");
    expect(el.textContent).toContain("Pale aqua");
  });

  it("names its group, and hides the description when asked", async () => {
    const el = await render(<ThemePicker presets={presets} label="Look" describe={false} />);
    expect(el.querySelector('[role="group"]')!.getAttribute("aria-label")).toBe("Look");
    expect(el.textContent).toBe("");
    expect(el.querySelector('[data-ouro="theme-picker"]')).not.toBeNull();
  });

  it("starts on a kept choice", async () => {
    localStorage.setItem("ouro-theme-preset", "abyss");
    const el = await render(<ThemePicker presets={presets} />);
    expect(el.querySelector('[aria-label="Abyss"]')!.getAttribute("aria-pressed")).toBe("true");
  });

  it("says in development when there are no presets", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await render(<ThemePicker presets={[]} />);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("[ouro-ui] ThemePicker: presets is empty"));
  });

  it("names its group Theme by default and draws the chosen dot with a solid border", async () => {
    const el = await render(<ThemePicker presets={presets} />);
    expect(el.querySelector('[role="group"]')!.getAttribute("aria-label")).toBe("Theme");
    const dot = (name: string) => el.querySelector(`[aria-label="${name}"] [data-theme]`)!.className.split(" ");
    expect(dot("Pearl")).toContain("border-foreground");
    expect(dot("Pearl")).not.toContain("border-foreground/20");
    expect(dot("Abyss")).toContain("border-foreground/20");
    expect(dot("Abyss")).not.toContain("border-foreground");
  });

  it("keeps the choice under the key it is given, and starts on the default it is given", async () => {
    const el = await render(<ThemePicker presets={presets} storageKey="app-look" defaultPreset="abyss" />);
    expect(el.querySelector('[aria-label="Abyss"]')!.getAttribute("aria-pressed")).toBe("true");
    await act(async () => el.querySelector<HTMLButtonElement>('[aria-label="Pearl"]')!.click());
    expect(localStorage.getItem("app-look")).toBe("pearl");
    localStorage.removeItem("app-look");
  });

  it("names the fix when an appearance class is passed, and for no presets", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await render(<ThemePicker presets={[]} className="bg-red-500" />);
    const text = warn.mock.calls.map((call) => String(call[0])).join("\n");
    expect(text).toContain('[ouro-ui] ThemePicker: "bg-red-500" sets appearance, and className is for layout only. Fix: remove "bg-red-500"; ThemePicker draws its dots from the presets');
    expect(text).toContain('Fix: <ThemePicker presets={[{ name: "pearl", label: "Pearl" }]} />');
  });
});
