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
});
