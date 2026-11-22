import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { ThemePicker } from "@/registry/ouro/components/ouro/theme-picker/theme-picker";
import { pressTab } from "@/registry/ouro/lib/ouro/testing/tab";
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
  it("keeps its swatches 32px from sm up, at a compact --spacing", async () => {
    const [width, height] = [window.innerWidth, window.innerHeight];
    await page.viewport(1024, 768);
    try {
      const host = await render(<ThemePicker presets={presets} />);
      const swatch = () => getComputedStyle(host.querySelector<HTMLElement>("span[data-theme]")!);
      expect([swatch().width, swatch().height]).toEqual(["32px", "32px"]);
      host.style.setProperty("--spacing", "0.2rem");
      expect([swatch().width, swatch().height]).toEqual(["32px", "32px"]);
    } finally {
      await page.viewport(width, height);
    }
  });

  it("keeps its fixed sizes at a compact --spacing", async () => {
    const host = await render(<ThemePicker presets={presets} />);
    const swatch = () => getComputedStyle(host.querySelector<HTMLElement>("span[data-theme]")!);
    expect([swatch().width, swatch().height]).toEqual(["24px", "24px"]);
    host.style.setProperty("--spacing", "0.2rem");
    expect([swatch().width, swatch().height]).toEqual(["24px", "24px"]);
  });
  it("is one Tab stop on the chosen dot, moves with the arrow keys, and rings keyboard focus on the swatch", async () => {
    const el = await render(<ThemePicker presets={[...presets, { name: "dusk", label: "Dusk" }]} defaultPreset="abyss" />);
    const dots = [...el.querySelectorAll<HTMLButtonElement>("button")];
    expect(dots.map((dot) => dot.tabIndex)).toEqual([-1, 0, -1]);
    await pressTab();
    expect(document.activeElement).toBe(dots[1]);
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(dots[2]);
    expect(dots[2]!.getAttribute("aria-pressed")).toBe("false");
    const swatch = getComputedStyle(dots[2]!.querySelector("span")!);
    expect([getComputedStyle(dots[2]!).outlineStyle, swatch.outlineStyle, swatch.outlineWidth, swatch.outlineOffset]).toEqual(["none", "solid", "2px", "2px"]);
  });
  it("rings a focused dot in a system colour under forced colours, so the chosen dot's Highlight cannot hide it", async () => {
    const el = await render(<ThemePicker presets={presets} />);
    const dot = el.querySelector<HTMLButtonElement>("button")!;
    await pressTab();
    expect(document.activeElement).toBe(dot);
    const ring = () => getComputedStyle(dot.querySelector("span")!).outlineColor;
    const normal = ring();
    await commands.emulateMedia({ forcedColors: "active" });
    try {
      await expect.poll(ring).not.toBe(normal);
    } finally {
      await commands.emulateMedia({ forcedColors: "none" });
    }
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

  it("shows each look's own page colour and primary in its swatch whatever is chosen, light and dark", async () => {
    // What mendelow.me's check-swatches.mjs checked on the built site, as a component test: each swatch paints from
    // its own preset's tokens in the page's scheme, never the chosen look's.
    const looks = document.createElement("style");
    looks.textContent = [
      '[data-theme="pearl"] { --background: rgb(255, 255, 255); --primary: rgb(0, 102, 204); }',
      '[data-theme="abyss"] { --background: rgb(230, 246, 244); --primary: rgb(15, 118, 110); }',
      '[data-theme="dusk"] { --background: rgb(246, 239, 224); --primary: rgb(138, 83, 28); }',
      '.dark [data-theme="pearl"], .dark[data-theme="pearl"] { --background: rgb(0, 0, 0); --primary: rgb(41, 151, 255); }',
      '.dark [data-theme="abyss"], .dark[data-theme="abyss"] { --background: rgb(3, 26, 24); --primary: rgb(45, 212, 191); }',
      '.dark [data-theme="dusk"], .dark[data-theme="dusk"] { --background: rgb(28, 20, 12); --primary: rgb(224, 164, 88); }',
    ].join("\n");
    document.head.append(looks);
    const three = [...presets, { name: "dusk", label: "Dusk" }];
    try {
      const el = await render(<ThemePicker presets={three} />);
      const tokens = (element: Element) => {
        const style = getComputedStyle(element);
        return { background: style.getPropertyValue("--background").trim(), primary: style.getPropertyValue("--primary").trim() };
      };
      for (const dark of [false, true]) {
        html.classList.toggle("dark", dark);
        const expected = Object.fromEntries(
          three.map((look) => {
            const probe = document.createElement("div");
            probe.setAttribute("data-theme", look.name);
            document.body.append(probe);
            const read = tokens(probe);
            probe.remove();
            return [look.name, read];
          }),
        );
        expect(new Set(Object.values(expected).map((look) => look.background)).size).toBe(three.length);
        for (const chosen of three) {
          await act(async () => el.querySelector<HTMLButtonElement>(`[aria-label="${chosen.label}"]`)!.click());
          expect(tokens(html), `${dark ? "dark" : "light"}: choosing ${chosen.name} paints the page with it`).toEqual(expected[chosen.name]);
          const shown = Object.fromEntries([...el.querySelectorAll("span[data-theme]")].map((swatch) => [swatch.getAttribute("data-theme"), tokens(swatch)]));
          expect(shown, `${dark ? "dark" : "light"}, ${chosen.name} chosen`).toEqual(expected);
        }
      }
    } finally {
      looks.remove();
      html.classList.remove("dark");
    }
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
