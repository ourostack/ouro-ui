import { useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { commands, userEvent } from "vitest/browser";
import { ThemePicker, type ThemePickerProps } from "@/registry/ouro/components/ouro/theme-picker/theme-picker";
import { pressTab } from "@/registry/ouro/lib/ouro/testing/tab";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { watchAnnouncements } from "@/registry/ouro/lib/ouro/testing/announcements";
import { honesty } from "@/registry/ouro/lib/ouro/testing/honesty";

// Two looks with their own paper, ink, primary and heading face, light and dark, so each wordmark can be checked
// against the look it names.
const LOOKS = `
[data-theme="pearl"] { --background: rgb(255, 255, 255); --foreground: rgb(29, 29, 31); --primary: rgb(0, 102, 204); --font-heading: ui-sans-serif, sans-serif; }
[data-theme="abyss"] { --background: rgb(230, 246, 244); --foreground: rgb(6, 48, 44); --primary: rgb(15, 118, 110); --font-heading: ui-monospace, monospace; }
[data-theme="dusk"] { --background: rgb(246, 239, 224); --foreground: rgb(42, 31, 20); --primary: rgb(138, 83, 28); --font-heading: ui-serif, serif; }
.dark [data-theme="pearl"], .dark[data-theme="pearl"] { --background: rgb(0, 0, 0); --foreground: rgb(245, 245, 247); --primary: rgb(41, 151, 255); }
.dark [data-theme="abyss"], .dark[data-theme="abyss"] { --background: rgb(3, 26, 24); --foreground: rgb(213, 245, 240); --primary: rgb(45, 212, 191); }
.dark [data-theme="dusk"], .dark[data-theme="dusk"] { --background: rgb(28, 20, 12); --foreground: rgb(243, 231, 211); --primary: rgb(224, 164, 88); }
`;

const presets = [
  { name: "pearl", label: "Pearl", mood: "Clean white" },
  { name: "abyss", label: "Abyss", mood: "Pale aqua" },
];
const three = [...presets, { name: "dusk", label: "Dusk" }];
const html = document.documentElement;
let host: HTMLElement | undefined;
let root: Root | undefined;
let looks: HTMLStyleElement | undefined;

async function render(node: React.ReactNode) {
  looks = document.createElement("style");
  looks.textContent = LOOKS;
  document.head.append(looks);
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
  looks?.remove();
  localStorage.removeItem("ouro-theme-preset");
  html.removeAttribute("data-theme");
  html.classList.remove("dark");
});

const option = (el: ParentNode, name: string) => el.querySelector<HTMLButtonElement>(`button[data-preset="${name}"]`)!;
const tile = (button: HTMLElement) => button.querySelector<HTMLElement>("[data-theme]")!;

const pickerParts = () => [
  ...document.querySelectorAll('[data-ouro="theme-picker"], [data-ouro="theme-picker"] *, [data-ouro="popover"]:has([data-preset]), [data-ouro="popover"]:has([data-preset]) *'),
];

async function openPopover(el: HTMLElement) {
  const trigger = el.querySelector<HTMLButtonElement>('[data-ouro-part="trigger"]')!;
  await userEvent.click(trigger);
  await expect
    .poll(() => {
      const popup = document.querySelector<HTMLElement>('[data-ouro="popover"]');
      return Boolean(popup && !popup.hasAttribute("data-starting-style") && popup.getAnimations().length === 0);
    })
    .toBe(true);
  return document.querySelector<HTMLElement>('[data-ouro="popover"]')!;
}

describe("ThemePicker", () => {
  it("is a listbox of options, so a screen reader gives each look's name, its place in the list and whether it is selected, and speaks a choice through that state alone", async () => {
    const el = await render(<ThemePicker presets={three} defaultPreset="abyss" />);
    const list = el.querySelector('[role="listbox"]')!;
    expect(list.getAttribute("aria-label")).toBe("Theme");
    expect(list.getAttribute("aria-orientation")).toBe("horizontal");
    const options = [...list.children] as HTMLElement[];
    expect(options.map((look) => [look.getAttribute("role"), look.getAttribute("aria-label"), look.getAttribute("aria-selected")])).toEqual([
      ["option", "Pearl", "false"],
      ["option", "Abyss", "true"],
      ["option", "Dusk", "false"],
    ]);
    expect(el.querySelector("[aria-pressed]")).toBeNull();
    const announcements = watchAnnouncements();
    try {
      await act(async () => option(el, "dusk").click());
      expect(option(el, "dusk").getAttribute("aria-selected")).toBe("true");
      expect(option(el, "abyss").getAttribute("aria-selected")).toBe("false");
      expect(announcements.changes).toEqual([]);
    } finally {
      announcements.stop();
    }
  });

  it("rings keyboard focus beyond the chosen look's ring, so a focused look is never mistaken for the chosen one", async () => {
    const el = await render(<ThemePicker presets={three} />);
    await pressTab();
    await userEvent.keyboard("{ArrowRight}");
    const focused = getComputedStyle(document.activeElement!);
    expect(document.activeElement).toBe(option(el, "abyss"));
    expect(focused.boxShadow).toBe("none");
    expect(Number.parseFloat(focused.outlineOffset)).toBeGreaterThanOrEqual(6);
    expect(getComputedStyle(option(el, "pearl")).boxShadow).toMatch(/0px 0px 0px 4px/);
  });

  it("is one Tab stop on the chosen look, moves with the arrow keys, Home and End, and rings keyboard focus outside the choice", async () => {
    const el = await render(<ThemePicker presets={three} defaultPreset="abyss" />);
    const looks = [...el.querySelectorAll<HTMLButtonElement>("button")];
    expect(looks.map((look) => look.tabIndex)).toEqual([-1, 0, -1]);
    await pressTab();
    expect(document.activeElement).toBe(looks[1]);
    const chosen = getComputedStyle(looks[1]!);
    expect([chosen.outlineStyle, chosen.outlineWidth, chosen.outlineOffset]).toEqual(["solid", "2px", "6px"]);
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(looks[2]);
    expect(looks[2]!.getAttribute("aria-selected")).toBe("false");
    const focused = getComputedStyle(looks[2]!);
    expect([focused.outlineStyle, focused.outlineWidth, focused.outlineOffset]).toEqual(["solid", "2px", "6px"]);
    await userEvent.keyboard("{Home}");
    expect(document.activeElement).toBe(looks[0]);
    await userEvent.keyboard("{End}");
    expect(document.activeElement).toBe(looks[2]);
    await userEvent.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(looks[1]);
  });

  it("rings the chosen look in the page's ink with a gap of page paper, flat, and nothing else", async () => {
    const el = await render(<ThemePicker presets={presets} defaultPreset="abyss" />);
    const ink = getComputedStyle(el.querySelector('[role="listbox"]')!).getPropertyValue("--ouro-tp-ink").trim();
    expect(ink).not.toBe("");
    const ring = getComputedStyle(option(el, "abyss")).boxShadow;
    expect(ring).toMatch(/0px 0px 0px 2px/);
    expect(ring).toMatch(/0px 0px 0px 4px/);
    expect(getComputedStyle(option(el, "pearl")).boxShadow).toBe("none");
  });

  it("draws the choice as a Highlight outline under forced colours, which drop the ring", async () => {
    const el = await render(<ThemePicker presets={presets} />);
    const chosen = option(el, "pearl");
    await commands.emulateMedia({ forcedColors: "active" });
    try {
      await expect.poll(() => getComputedStyle(chosen).outlineStyle).toBe("solid");
    } finally {
      await commands.emulateMedia({ forcedColors: "none" });
    }
  });

  it("switches the page, keeps the choice and presses the chosen look", async () => {
    const el = await render(<ThemePicker presets={presets} />);
    expect(option(el, "pearl").getAttribute("aria-selected")).toBe("true");
    await act(async () => option(el, "abyss").click());
    expect(option(el, "abyss").getAttribute("aria-selected")).toBe("true");
    expect(option(el, "pearl").getAttribute("aria-selected")).toBe("false");
    expect(html.getAttribute("data-theme")).toBe("abyss");
    expect(localStorage.getItem("ouro-theme-preset")).toBe("abyss");
  });

  it("previews a look on the page while the pointer rests on it, and puts the choice back as it leaves", async () => {
    const el = await render(<ThemePicker presets={three} />);
    await userEvent.hover(option(el, "dusk"));
    await expect.poll(() => html.getAttribute("data-theme")).toBe("dusk");
    expect(option(el, "pearl").getAttribute("aria-selected")).toBe("true");
    await userEvent.unhover(option(el, "dusk"));
    await expect.poll(() => html.getAttribute("data-theme")).toBe("pearl");
    expect(localStorage.getItem("ouro-theme-preset")).toBeNull();
  });

  it("previews the look keyboard focus reaches, and puts the choice back on Escape and when focus leaves", async () => {
    await render(<ThemePicker presets={three} defaultPreset="abyss" />);
    await pressTab();
    expect(html.getAttribute("data-theme")).toBe("abyss");
    await userEvent.keyboard("{ArrowRight}");
    expect(html.getAttribute("data-theme")).toBe("dusk");
    await userEvent.keyboard("{Escape}");
    expect(html.getAttribute("data-theme")).toBe("abyss");
    await userEvent.keyboard("{ArrowLeft}");
    expect(html.getAttribute("data-theme")).toBe("abyss");
    await userEvent.keyboard("{Home}");
    expect(html.getAttribute("data-theme")).toBe("pearl");
    await act(async () => (document.activeElement as HTMLElement).blur());
    expect(html.getAttribute("data-theme")).toBe("abyss");
  });

  it("keeps a look chosen while previewing it, and puts the choice back if it unmounts mid-preview", async () => {
    const el = await render(<ThemePicker presets={three} />);
    await userEvent.hover(option(el, "dusk"));
    await userEvent.click(option(el, "dusk"));
    await userEvent.unhover(option(el, "dusk"));
    await expect.poll(() => html.getAttribute("data-theme")).toBe("dusk");
    expect(localStorage.getItem("ouro-theme-preset")).toBe("dusk");
    await userEvent.hover(option(el, "abyss"));
    await expect.poll(() => html.getAttribute("data-theme")).toBe("abyss");
    await act(async () => root?.unmount());
    root = undefined;
    expect(html.getAttribute("data-theme")).toBe("dusk");
  });

  it("leaves the page's look alone when it unmounts with no preview running", async () => {
    await render(<ThemePicker presets={three} defaultPreset="abyss" />);
    html.setAttribute("data-theme", "dusk");
    await act(async () => root?.unmount());
    root = undefined;
    expect(html.getAttribute("data-theme")).toBe("dusk");
  });

  it("tells the app a preview ended when a controlled picker unmounts mid-preview, and only then", async () => {
    const onPreviewChange = vi.fn();
    const el = await render(<ThemePicker presets={three} value="pearl" onPreviewChange={onPreviewChange} />);
    await userEvent.hover(option(el, "dusk"));
    await expect.poll(() => onPreviewChange.mock.calls.at(-1)).toEqual(["dusk"]);
    await act(async () => root?.unmount());
    root = undefined;
    expect(onPreviewChange.mock.calls.at(-1)).toEqual([null]);
    // The mouse still rests where dusk was, so the next picker would render under it and preview: it leaves the page first.
    await userEvent.hover(document.documentElement, { position: { x: -8, y: -8 }, force: true });
    const quiet = vi.fn();
    await render(<ThemePicker presets={three} value="pearl" onPreviewChange={quiet} />);
    await act(async () => root?.unmount());
    root = undefined;
    expect(quiet).not.toHaveBeenCalled();
  });

  it("ends a preview once: one the pointer already ended is not ended again on unmount", async () => {
    const onPreviewChange = vi.fn();
    const el = await render(<ThemePicker presets={three} value="pearl" onPreviewChange={onPreviewChange} />);
    await userEvent.hover(option(el, "dusk"));
    await userEvent.unhover(option(el, "dusk"));
    await expect.poll(() => onPreviewChange.mock.calls.at(-1)).toEqual([null]);
    const calls = onPreviewChange.mock.calls.length;
    await act(async () => root?.unmount());
    root = undefined;
    expect(onPreviewChange.mock.calls).toHaveLength(calls);
  });

  it("tells the app's latest onPreviewChange, after a render gave it a new one", async () => {
    const first = vi.fn();
    const latest = vi.fn();
    const el = await render(<ThemePicker presets={three} value="pearl" onPreviewChange={first} />);
    await act(async () => root!.render(<ThemePicker presets={three} value="pearl" onPreviewChange={latest} />));
    await userEvent.hover(option(el, "dusk"));
    await expect.poll(() => latest.mock.calls.at(-1)).toEqual(["dusk"]);
    await act(async () => root?.unmount());
    root = undefined;
    expect(latest.mock.calls.at(-1)).toEqual([null]);
    expect(first).not.toHaveBeenCalled();
  });

  it("previews nothing for a finger, whose pointerenter comes with the tap, or for focus that is not the keyboard's", async () => {
    const el = await render(<ThemePicker presets={three} />);
    option(el, "dusk").dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "touch" }));
    option(el, "dusk").dispatchEvent(new PointerEvent("pointerenter", { pointerType: "touch" }));
    option(el, "abyss").dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await act(async () => {});
    expect(html.getAttribute("data-theme")).toBe("pearl");
  });

  it("keeps a preview through keys other than Escape", async () => {
    const el = await render(<ThemePicker presets={three} />);
    await pressTab();
    await userEvent.hover(option(el, "dusk"));
    await expect.poll(() => html.getAttribute("data-theme")).toBe("dusk");
    await userEvent.keyboard("a");
    expect(html.getAttribute("data-theme")).toBe("dusk");
    await userEvent.keyboard("{Escape}");
    expect(html.getAttribute("data-theme")).toBe("pearl");
  });

  it("previews safely when the app keeps the choice and asks for no preview", async () => {
    const errors: unknown[] = [];
    const onError = (event: ErrorEvent) => errors.push(event.error);
    window.addEventListener("error", onError);
    try {
      const el = await render(<ThemePicker presets={three} value="abyss" />);
      await userEvent.hover(option(el, "dusk"));
      await userEvent.unhover(option(el, "dusk"));
      expect(errors).toEqual([]);
      expect(html.hasAttribute("data-theme")).toBe(false);
    } finally {
      window.removeEventListener("error", onError);
    }
  });

  it("tells the app what to preview when it keeps the choice, and leaves the page alone", async () => {
    const previewed = vi.fn();
    const el = await render(<ThemePicker presets={three} value="abyss" onPreviewChange={previewed} />);
    await userEvent.hover(option(el, "dusk"));
    await expect.poll(() => previewed.mock.calls.at(-1)).toEqual(["dusk"]);
    await userEvent.unhover(option(el, "dusk"));
    await expect.poll(() => previewed.mock.calls.at(-1)).toEqual([null]);
    expect(html.hasAttribute("data-theme")).toBe(false);
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

  it("names each look by its label, set in the look's own heading face, ending in a square of its primary", async () => {
    const el = await render(<ThemePicker presets={presets} />);
    const abyss = option(el, "abyss");
    expect(abyss.getAttribute("aria-label")).toBe("Abyss");
    expect(abyss.textContent).toBe("Abyss");
    const name = tile(abyss).children[1] as HTMLElement;
    expect(getComputedStyle(name).fontFamily).toContain("monospace");
    expect(getComputedStyle(name).fontSizeAdjust).toMatch(/0\.53/);
    const square = tile(abyss).children[2] as HTMLElement;
    expect(getComputedStyle(square).backgroundColor).toBe("rgb(15, 118, 110)");
  });

  it("tells Ouro check that the chosen look's ring, standing off its wordmark, is a mark and not a second border", async () => {
    const el = await render(<ThemePicker presets={presets} />);
    for (const name of ["pearl", "abyss"]) {
      expect(option(el, name).getAttribute("data-ouro-allow")).toBe("nested-frame");
      expect(option(el, name).getAttribute("data-ouro-allow-why")).toBe("the chosen look's ring stands off its wordmark by a gap of page paper, marking the choice, not a second border");
    }
  });

  it("sets a look's name in its --font-wordmark where the look gives one, a face holding only the name's letters", async () => {
    const wordmark = document.createElement("style");
    wordmark.textContent = '[data-theme="abyss"] { --font-wordmark: fantasy; }';
    document.head.append(wordmark);
    try {
      const el = await render(<ThemePicker presets={presets} />);
      expect(getComputedStyle(tile(option(el, "abyss")).children[1]!).fontFamily).toBe("fantasy");
      expect(getComputedStyle(tile(option(el, "pearl")).children[1]!).fontFamily).toContain("sans-serif");
    } finally {
      wordmark.remove();
    }
  });

  it("shows each look's own paper, ink and primary whatever is chosen, light and dark", async () => {
    const el = await render(<ThemePicker presets={three} />);
    for (const dark of [false, true]) {
      html.classList.toggle("dark", dark);
      for (const chosen of three) {
        await act(async () => option(el, chosen.name).click());
        expect(html.getAttribute("data-theme")).toBe(chosen.name);
        // What each look paints the page with in this scheme, read off <html> with that look set.
        const expected = Object.fromEntries(
          three.map((item) => {
            const probe = document.createElement("div");
            probe.setAttribute("data-theme", item.name);
            document.body.append(probe);
            const style = getComputedStyle(probe);
            const read = { background: style.getPropertyValue("--background").trim(), foreground: style.getPropertyValue("--foreground").trim(), primary: style.getPropertyValue("--primary").trim() };
            probe.remove();
            return [item.name, read];
          }),
        );
        expect(new Set(Object.values(expected).map((look) => look.background)).size).toBe(three.length);
        for (const item of three) {
          const style = getComputedStyle(tile(option(el, item.name)));
          expect({ background: style.getPropertyValue("--background").trim(), foreground: style.getPropertyValue("--foreground").trim(), primary: style.getPropertyValue("--primary").trim() }, `${dark ? "dark" : "light"}, ${chosen.name} chosen: ${item.name}`).toEqual(expected[item.name]);
        }
      }
    }
  });

  it("paints an option with another look's CSS when its preset names a theme", async () => {
    const el = await render(<ThemePicker presets={[...presets, { name: "live", label: "Live", theme: "pearl" }]} />);
    expect(tile(option(el, "live")).getAttribute("data-theme")).toBe("pearl");
    expect(tile(option(el, "live")).getAttribute("data-preset")).toBe("live");
  });

  it("names its group, and shows the chosen look's mood when asked", async () => {
    const el = await render(<ThemePicker presets={presets} label="Look" describe />);
    expect(el.querySelector('[role="listbox"]')!.getAttribute("aria-label")).toBe("Look");
    expect(el.querySelector("p")!.textContent).toBe("PearlClean white");
    await act(async () => option(el, "abyss").click());
    expect(el.querySelector("p")!.textContent).toBe("AbyssPale aqua");
  });

  it("names its group Theme by default and shows no description", async () => {
    const el = await render(<ThemePicker presets={presets} />);
    expect(el.querySelector('[role="listbox"]')!.getAttribute("aria-label")).toBe("Theme");
    expect(el.querySelector("p")).toBeNull();
  });

  it("starts on a kept choice", async () => {
    localStorage.setItem("ouro-theme-preset", "abyss");
    const el = await render(<ThemePicker presets={presets} />);
    expect(option(el, "abyss").getAttribute("aria-selected")).toBe("true");
  });

  it("keeps the choice under the key it is given, and starts on the default it is given", async () => {
    const changed = vi.fn();
    const el = await render(<ThemePicker presets={presets} storageKey="app-look" defaultPreset="abyss" onValueChange={changed} />);
    expect(option(el, "abyss").getAttribute("aria-selected")).toBe("true");
    await act(async () => option(el, "pearl").click());
    expect(localStorage.getItem("app-look")).toBe("pearl");
    expect(changed).toHaveBeenCalledWith("pearl", expect.objectContaining({ type: "click" }));
    localStorage.removeItem("app-look");
  });

  it("leaves the page and storage alone when the app keeps the choice", async () => {
    const changed = vi.fn();
    function Kept() {
      const [look, setLook] = useState("abyss");
      return (
        <ThemePicker
          presets={presets}
          value={look}
          onValueChange={(name, event) => {
            changed(name, event.type);
            setLook(name);
          }}
        />
      );
    }
    const el = await render(<Kept />);
    expect(option(el, "abyss").getAttribute("aria-selected")).toBe("true");
    await act(async () => option(el, "pearl").click());
    expect(changed).toHaveBeenCalledWith("pearl", "click");
    expect(option(el, "pearl").getAttribute("aria-selected")).toBe("true");
    expect(html.hasAttribute("data-theme")).toBe(false);
    expect(localStorage.getItem("ouro-theme-preset")).toBeNull();
  });

  it("does nothing on a press with a value and no onValueChange", async () => {
    const el = await render(<ThemePicker presets={presets} value="abyss" />);
    await act(async () => option(el, "pearl").click());
    expect(option(el, "abyss").getAttribute("aria-selected")).toBe("true");
  });

  it("says in development when there are no presets, and names the fix for an appearance class", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await render(<ThemePicker presets={[]} className="bg-red-500" />);
    const text = warn.mock.calls.map((call) => String(call[0])).join("\n");
    expect(text).toContain('[ouro-ui] ThemePicker: "bg-red-500" sets appearance, and className is for layout only. Fix: remove "bg-red-500"; ThemePicker paints each wordmark from its preset');
    expect(text).toContain('[ouro-ui] ThemePicker: presets is empty, so there is nothing to choose. Fix: <ThemePicker presets={[{ name: "pearl", label: "Pearl" }]} />');
  });

  it("renders the defaults for an unknown size or presentation, names the fix, and says children need the popover", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const props = { presets, size: "xl", presentation: "menu" } as unknown as ThemePickerProps;
    const el = await render(
      <ThemePicker {...props}>
        <span>Extra</span>
      </ThemePicker>,
    );
    expect(el.querySelector('[data-ouro="theme-picker"]')!.getAttribute("data-presentation")).toBe("inline");
    expect(getComputedStyle(tile(option(el, "pearl"))).height).toBe("44px");
    const text = warn.mock.calls.map((call) => String(call[0])).join("\n");
    expect(text).toContain('size="xl" is not a size; use "md" or "lg". Fix: <ThemePicker size="md" />');
    expect(text).toContain('presentation="menu" is not a presentation; use "inline" or "popover". Fix: <ThemePicker presentation="popover" />');
    expect(text).toContain("children show only in the popover. Fix: <ThemePicker presentation=\"popover\">…</ThemePicker>");
    expect(el.textContent).not.toContain("Extra");
  });

  it("draws md wordmarks 40px tall and lg ones 44px, at a compact --spacing too", async () => {
    const el = await render(
      <>
        <ThemePicker presets={presets} size="md" />
        <ThemePicker presets={presets} storageKey="other" />
      </>,
    );
    const [md, lg] = [...el.querySelectorAll<HTMLElement>('[data-ouro="theme-picker"]')];
    el.style.setProperty("--spacing", "0.2rem");
    expect(getComputedStyle(tile(option(md!, "pearl"))).height).toBe("40px");
    expect(getComputedStyle(tile(option(lg!, "pearl"))).height).toBe("44px");
  });

  it("takes either size and either presentation as given, with no warning, and lays the inline row out as a grid", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const el = await render(
      <>
        <ThemePicker presets={presets} presentation="inline" size="md" />
        <ThemePicker presets={presets} presentation="popover" size="lg" storageKey="other" />
      </>,
    );
    const [inline, popover] = [...el.querySelectorAll<HTMLElement>('[data-ouro="theme-picker"]')];
    expect(getComputedStyle(inline!).display).toBe("grid");
    expect(getComputedStyle(tile(option(inline!, "pearl"))).height).toBe("40px");
    expect(warn).not.toHaveBeenCalled();
    const popup = await openPopover(popover!);
    expect(getComputedStyle(tile(option(popup, "pearl"))).height).toBe("44px");
  });

  it("paints each tile and its square on a surface behind its text, with the page's squircle radius to clip it where corner-shape is missing", async () => {
    const el = await render(<ThemePicker presets={presets} />);
    const surfaces = [...option(el, "pearl").querySelectorAll<HTMLElement>("[data-ouro-surface]")];
    expect(surfaces).toHaveLength(2);
    for (const surface of surfaces) expect(getComputedStyle(surface).zIndex).toBe("-1");
    expect(getComputedStyle(el.querySelector('[role="listbox"]')!).getPropertyValue("--ouro-tp-sq").trim()).not.toBe("");
  });
});

describe("ThemePicker popover", () => {
  it("shows the chosen wordmark, opens the looks, and closes on Escape with focus back on the button", async () => {
    const el = await render(
      <ThemePicker presets={three} presentation="popover" defaultPreset="dusk">
        <button type="button">Light or dark</button>
      </ThemePicker>,
    );
    const trigger = el.querySelector<HTMLButtonElement>('[data-ouro-part="trigger"]')!;
    const shown = [...trigger.querySelectorAll<HTMLElement>("[data-shows]")].filter((wordmark) => !wordmark.hidden);
    expect(shown.map((wordmark) => wordmark.dataset.shows)).toEqual(["dusk"]);
    expect(trigger.textContent).toContain("Theme: Dusk");
    expect(trigger.getAttribute("aria-label")).toBeNull();
    // The chevron after the wordmark says the button opens something.
    expect(trigger.querySelector("svg[aria-hidden='true']")).not.toBeNull();
    const popup = await openPopover(el);
    expect(popup.textContent).toContain("Light or dark");
    expect(option(popup, "dusk").getAttribute("aria-selected")).toBe("true");
    expect(getComputedStyle(tile(option(popup, "dusk"))).height).toBe("40px");
    await act(async () => option(popup, "abyss").click());
    expect(html.getAttribute("data-theme")).toBe("abyss");
    expect([...trigger.querySelectorAll<HTMLElement>("[data-shows]")].filter((wordmark) => !wordmark.hidden).map((wordmark) => wordmark.dataset.shows)).toEqual(["abyss"]);
    option(popup, "abyss").focus();
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => document.querySelector('[data-ouro="popover"]')).toBeNull();
    await expect.poll(() => document.activeElement).toBe(trigger);
  });

  it("is flat: its panel has a hairline and no shadow", async () => {
    const el = await render(<ThemePicker presets={presets} presentation="popover" />);
    const popup = await openPopover(el);
    const shadow = getComputedStyle(popup).boxShadow;
    expect(shadow).not.toBe("none");
    expect(honesty([popup]).problems).toEqual([]);
  });
});

describe("ThemePicker honesty", () => {
  it("paints no gradient, rounds every corner as a squircle and blurs no shadow, inline and in its popover, light and dark", async () => {
    const el = await render(
      <>
        <ThemePicker presets={three} defaultPreset="abyss" />
        <ThemePicker presets={three} presentation="popover" storageKey="header" />
      </>,
    );
    await openPopover(el);
    for (const dark of [false, true]) {
      html.classList.toggle("dark", dark);
      const result = honesty(pickerParts());
      expect(result.elements).toBeGreaterThan(40);
      expect(result.rounded).toBeGreaterThan(40);
      expect(result.problems).toEqual([]);
    }
  });

  it("finds a gradient, a round corner and a blurred shadow when one is added", async () => {
    const el = await render(<ThemePicker presets={presets} />);
    const look = option(el, "abyss");
    look.style.backgroundImage = "linear-gradient(red, blue)";
    look.style.setProperty("corner-shape", "round");
    look.style.boxShadow = "0 4px 12px black";
    const problems = honesty(pickerParts()).problems.filter((line) => line.startsWith("button[preset][abyss]"));
    expect(problems.some((line) => line.includes("gradient"))).toBe(true);
    expect(problems.some((line) => line.includes("not a squircle"))).toBe(true);
    expect(problems.some((line) => line.includes("blurred box-shadow"))).toBe(true);
  });
});
