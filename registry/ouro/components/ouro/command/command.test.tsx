import { useState, type ReactElement, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { Avatar } from "@/registry/ouro/components/ouro/avatar/avatar";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Command, type CommandEntry, type CommandProps } from "@/registry/ouro/components/ouro/command/command";
import { queryRanges } from "@/registry/ouro/components/ouro/command/command-styles";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { parseDuration } from "@/registry/ouro/lib/ouro/testing/motion";
import { useCommandShortcut } from "@/registry/ouro/lib/ouro/use-command-shortcut";
import { audit, axeExclude, describeFindings, measureTextContrast } from "@/registry/ouro/lib/ouro/testing/axe";
import { pressTab } from "@/registry/ouro/lib/ouro/testing/tab";
import { watchAnnouncements } from "@/registry/ouro/lib/ouro/testing/announcements";

/** The colour behind an element: the nearest background around it that is not transparent. */
function behind(element: Element): string {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const color = getComputedStyle(node).backgroundColor;
    if (color !== "transparent" && !/rgba\(.*,\s*0\)$/.test(color)) return color;
  }
  return "rgb(255, 255, 255)";
}


// Runs in Chromium and WebKit.

const FIX = "Pass trigger={<Button>…</Button>} for an uncontrolled command palette, or open and onOpenChange to control it.";

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode, parent: Element = document.body) {
  const host = document.createElement("div");
  host.style.padding = "40px";
  parent.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return host;
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(async () => {
  await page.viewport(1280, 800);
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
  delete (navigator as { userAgentData?: unknown }).userAgentData;
  delete (navigator as { platform?: unknown }).platform;
  // Most tests never touch media: resetMedia skips the round trip when it is already at rest, instead
  // of paying one on every test regardless, which a loaded WebKit shard feels most.
  await commands.resetMedia();
});

/** Pretends the browser runs on `platform`, through the modern API and the legacy one, so a shortcut's form is deterministic. */
function onPlatform(platform: "macOS" | "Windows" | "Linux") {
  const legacy = { macOS: "MacIntel", Windows: "Win32", Linux: "Linux x86_64" }[platform];
  Object.defineProperty(navigator, "userAgentData", { configurable: true, value: { platform } });
  Object.defineProperty(navigator, "platform", { configurable: true, value: legacy });
}

const warnings = () => warn.mock.calls.map((call: unknown[]) => call[0]);
const popup = () => document.querySelector<HTMLElement>("[data-ouro-presentation]");
const trigger = () => document.querySelector<HTMLElement>('[data-ouro="button"]')!;
const input = () => page.getByRole("combobox", { name: "Search commands" });
const options = () => [...document.querySelectorAll<HTMLElement>('[role="option"]')].map((option) => option.querySelector("[data-ouro-command-label]")!.textContent);

async function settled() {
  await expect
    .poll(() => {
      const element = popup();
      return Boolean(element && !element.hasAttribute("data-starting-style") && element.getAnimations().length === 0);
    })
    .toBe(true);
  return popup()!;
}

const actions = { newRecipe: vi.fn(), import: vi.fn(), theme: vi.fn(), signOut: vi.fn() };

function entries(): CommandEntry[] {
  return [
    {
      label: "Recipes",
      items: [
        { label: "New recipe", onSelect: actions.newRecipe, shortcut: ["mod", "n"] },
        { label: "Import from a link", onSelect: actions.import, keywords: ["url", "paste"] },
      ],
    },
    { label: "Settings", items: [{ label: "Switch theme", onSelect: actions.theme, keywords: ["dark mode"] }] },
    { label: "Sign out", onSelect: actions.signOut, disabled: true },
  ];
}

async function openPalette(props: Partial<CommandProps> = {}) {
  await render(<Command title="Command palette" trigger={<Button>Search</Button>} items={entries()} {...(props as object)} />);
  await userEvent.click(trigger());
  return settled();
}

/** The palette, controlled, open or closed. `flushSync` opens it in the same frame the test reads it, before the browser starts any transition. */
const controlled = (open: boolean) => <Command title="Command palette" items={entries()} open={open} onOpenChange={() => {}} />;

const palettePopup = () => document.querySelector<HTMLElement>("[data-ouro-presentation]");
const paletteBackdrop = () => document.querySelector<HTMLElement>('[data-ouro="dialog-backdrop"]');

/** Nothing left to enter or leave: no starting style and no animation still listed on the element. */
const quiet = (element: Element) => !element.hasAttribute("data-starting-style") && element.getAnimations().length === 0;

/** The CSS transitions still running on the element, each property with its duration in milliseconds. */
function runningTransitions(element: Element): Record<string, number> {
  const running = element
    .getAnimations()
    .filter((animation): animation is CSSTransition => animation instanceof CSSTransition && animation.playState !== "finished" && animation.playState !== "idle");
  return Object.fromEntries(running.map((animation) => [animation.transitionProperty, Math.round(Number(animation.effect?.getComputedTiming().duration))]));
}

/** The first (or last) keyframe of the running transition of `property`, read before the browser ends it. */
function keyframeOf(element: Element, property: string, end: boolean): Record<string, unknown> {
  const animation = element.getAnimations().find((running): running is CSSTransition => running instanceof CSSTransition && running.transitionProperty === property)!;
  return (animation.effect as KeyframeEffect).getKeyframes().at(end ? -1 : 0)!;
}

describe("Command motion", () => {
  // Base UI starts the enter one frame after the popup mounts, when it drops data-starting-style, so no
  // transition runs yet when the popup mounts: the test waits for them to start, then reads them.
  it("fades and scales in from 0.96 on the Dialog's slow token, and only fades with reduced motion", async () => {
    const tokens = getComputedStyle(document.documentElement);
    const slow = parseDuration(tokens.getPropertyValue("--ouro-duration-slow"));
    const base = parseDuration(tokens.getPropertyValue("--ouro-duration-base"));
    await render(controlled(false));
    const root = roots.at(-1)!;
    for (const reduced of [false, true]) {
      await commands.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
      flushSync(() => root.render(controlled(true)));
      const popup = palettePopup()!;
      const backdrop = paletteBackdrop()!;
      expect(popup.hasAttribute("data-starting-style")).toBe(true);
      expect(Number(getComputedStyle(popup).opacity)).toBe(0);
      if (reduced) {
        expect(getComputedStyle(popup).transform).toBe("none");
      } else {
        expect(new DOMMatrix(getComputedStyle(popup).transform).a).toBeCloseTo(0.96);
      }
      await expect.poll(() => popup.getAnimations().length > 0 && backdrop.getAnimations().length > 0).toBe(true);
      expect(runningTransitions(popup)).toEqual(reduced ? { opacity: base } : { opacity: slow, transform: slow });
      expect(runningTransitions(backdrop)).toEqual({ opacity: slow });
      if (!reduced) {
        expect(Number(keyframeOf(popup, "opacity", false).opacity)).toBe(0);
        expect(new DOMMatrix(String(keyframeOf(popup, "transform", false).transform)).a).toBeCloseTo(0.96);
      }
      await expect.poll(() => quiet(popup) && quiet(backdrop)).toBe(true);
      expect(getComputedStyle(popup).opacity).toBe("1");
      flushSync(() => root.render(controlled(false)));
      await expect.poll(palettePopup).toBeNull();
    }
  });

  it("fades and scales out on the base token, and only fades with reduced motion", async () => {
    const tokens = getComputedStyle(document.documentElement);
    const base = parseDuration(tokens.getPropertyValue("--ouro-duration-base"));
    await render(controlled(false));
    const root = roots.at(-1)!;
    for (const reduced of [false, true]) {
      await commands.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
      flushSync(() => root.render(controlled(true)));
      const popup = palettePopup()!;
      const backdrop = paletteBackdrop()!;
      // Closing while the backdrop still fades in would reverse that transition, which runs shorter than the exit.
      await expect.poll(() => quiet(popup) && quiet(backdrop)).toBe(true);
      flushSync(() => root.render(controlled(false)));
      expect(runningTransitions(popup)).toEqual(reduced ? { opacity: base } : { opacity: base, transform: base });
      expect(runningTransitions(backdrop)).toEqual({ opacity: base });
      if (!reduced) {
        expect(Number(keyframeOf(popup, "opacity", true).opacity)).toBe(0);
        expect(new DOMMatrix(String(keyframeOf(popup, "transform", true).transform)).a).toBeCloseTo(0.96);
      }
      await expect.poll(palettePopup).toBeNull();
    }
  });
});

describe("Command", () => {
  beforeEach(() => Object.values(actions).forEach((action) => action.mockClear()));

  it("keeps its fixed sizes at a compact --spacing: an item's icon column and glyph, and the search's glyph", async () => {
    await openPalette({ items: [{ label: "Settings", onSelect: () => {}, icon: <svg viewBox="0 0 16 16" /> }] } as object);
    const settings = page.getByRole("option", { name: /^Settings/ }).element();
    const measure = () => [
      settings.querySelector("[data-ouro-command-icon]")!.getBoundingClientRect().width,
      settings.querySelector("[data-ouro-command-icon] svg")!.getBoundingClientRect().width,
      document.querySelector("[data-ouro-command-search] svg")!.getBoundingClientRect().width,
    ];
    expect(measure()).toEqual([24, 16, 16]);
    document.body.style.setProperty("--spacing", "0.2rem");
    try {
      expect(measure()).toEqual([24, 16, 16]);
    } finally {
      document.body.style.removeProperty("--spacing");
    }
  });

  it("opens a dialog named by its title, with the search input focused and every group listed", async () => {
    const element = await openPalette();
    await expect.element(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
    expect(element.getAttribute("data-ouro-presentation")).toBe("dialog");
    expect(trigger().getAttribute("aria-haspopup")).toBe("dialog");
    await expect.poll(() => document.activeElement).toBe(input().element());
    expect(input().element().getAttribute("placeholder")).toBe("Type a command or search…");
    await expect.element(page.getByRole("group", { name: "Recipes" })).toBeVisible();
    await expect.element(page.getByRole("group", { name: "Settings" })).toBeVisible();
    expect(options()).toEqual(["New recipe", "Import from a link", "Switch theme", "Sign out"]);
    expect(page.getByRole("option", { name: /^New recipe/ }).element().querySelector('[data-ouro="kbd"]')).not.toBeNull();
  });

  it("filters by label and keywords, ignoring case and accents, and hides empty groups", async () => {
    await openPalette();
    await userEvent.type(input(), "PASTE");
    await expect.poll(options).toEqual(["Import from a link"]);
    expect(page.getByRole("group", { name: "Settings" }).query()).toBeNull();
    expect(page.getByRole("group", { name: "Recipes" }).query()).not.toBeNull();
    await userEvent.clear(input());
    await userEvent.type(input(), "thème");
    await expect.poll(options).toEqual(["Switch theme"]);
  });

  const slipItems = () => [
    { label: "Dialog guide", onSelect: actions.newRecipe },
    { label: "Edit sheet", onSelect: actions.import },
    { label: "Dialog", onSelect: actions.theme },
    { label: "Confirmation", onSelect: actions.signOut },
    { label: "Opt-out", onSelect: actions.signOut },
    { label: "Operator settings", onSelect: actions.signOut },
    { label: "किताबें", onSelect: actions.signOut },
  ];

  it("forgives one slip in a word of four letters or more: a letter dropped, added, changed, or two swapped", async () => {
    await openPalette({ items: slipItems() });
    for (const typed of ["dialg", "dialogg", "dialig", "dailog"]) {
      await userEvent.clear(input());
      await userEvent.type(input(), typed);
      await expect.poll(options).toEqual(["Dialog guide", "Dialog"]);
    }
    // Two letters swapped is one slip; two neighbouring letters changed, or one changed beside a letter that moved, is two.
    for (const typed of ["daxlog", "dxilog", "dxylog"]) {
      await userEvent.clear(input());
      await userEvent.type(input(), typed);
      await expect.poll(options).toEqual([]);
    }
  });

  it("finds a slip in a later word, a word of four letters, a hyphenated word and Devanagari, and only one slip", async () => {
    await openPalette({ items: slipItems() });
    // A word of four letters, after the first word of a label.
    await userEvent.clear(input());
    await userEvent.type(input(), "shet");
    await expect.poll(options).toEqual(["Edit sheet"]);
    // A word of four letters is a slip of a whole word only, not of every word sharing its first three letters.
    await userEvent.clear(input());
    await userEvent.type(input(), "opem");
    await expect.poll(options).toEqual([]);
    // A word keeps its vowel signs, so a slip in Devanagari is found too.
    await userEvent.clear(input());
    await userEvent.type(input(), "कताबें");
    await expect.poll(options).toEqual(["किताबें"]);
    // A word after a hyphen is a word too.
    await userEvent.clear(input());
    await userEvent.type(input(), "ouut");
    await expect.poll(options).toEqual(["Opt-out"]);
  });

  it("forgives a slip in the start of a longer word, and finds nothing for two slips or a word of three letters", async () => {
    await openPalette({ items: slipItems() });
    // A slip in the start of a longer word: two letters swapped, one dropped, one added.
    for (const typed of ["confr", "confrim", "confrma", "confiirm"]) {
      await userEvent.clear(input());
      await userEvent.type(input(), typed);
      await expect.poll(options).toEqual(["Confirmation"]);
    }
    // Two slips find nothing.
    await userEvent.clear(input());
    await userEvent.type(input(), "dalg");
    await expect.poll(options).toEqual([]);
    // A word of three letters must be exact: "edt" is one slip from "edit".
    await userEvent.clear(input());
    await userEvent.type(input(), "edt");
    await expect.poll(options).toEqual([]);
  });

  it("ranks a command that starts with the search first, then one that holds it, then one a slip away", async () => {
    await openPalette({
      items: [
        { label: "Dialog", onSelect: actions.newRecipe },
        { label: "Edit dialg notes", onSelect: actions.import },
        { label: "Dialg notes", onSelect: actions.theme },
      ],
    });
    await userEvent.type(input(), "dialg");
    await expect.poll(options).toEqual(["Dialg notes", "Edit dialg notes", "Dialog"]);
  });

  it("ranks a command whose keywords or description hold the search above one a slip away", async () => {
    await openPalette({
      items: [
        { label: "Thema", onSelect: actions.newRecipe },
        { label: "Look", keywords: ["theme"], onSelect: actions.import },
        { label: "Paint", description: "Pick a theme", onSelect: actions.theme },
      ],
    });
    await userEvent.type(input(), "theme");
    await expect.poll(options).toEqual(["Look", "Paint", "Thema"]);
  });

  it("finds a command by words in its description, and only the commands whose description has them", async () => {
    await openPalette({
      items: [
        { label: "Weekly sync", description: "Mondays, here in the studio", onSelect: actions.newRecipe },
        { label: "Design reviews", onSelect: actions.import },
        { label: "Launch planning", onSelect: actions.theme },
      ],
    });
    await userEvent.type(input(), "here");
    await expect.poll(options).toEqual(["Weekly sync"]);
  });

  it("shows the empty state when nothing matches", async () => {
    await openPalette({ emptyLabel: "Nothing found" });
    await userEvent.type(input(), "zzz");
    await expect.poll(options).toEqual([]);
    await expect.element(page.getByText("Nothing found")).toBeVisible();
  });

  it("centres the empty state in the room the results had, and gives the results all of it again", async () => {
    await openPalette({ emptyLabel: "Nothing found" });
    const room = document.querySelector<HTMLElement>("[data-ouro-command-list]")!;
    const middle = (element: Element) => {
      const { top, height } = element.getBoundingClientRect();
      return top + height / 2;
    };
    await userEvent.type(input(), "zzz");
    await expect.element(page.getByText("Nothing found")).toBeVisible();
    expect(Math.abs(middle(document.querySelector("[data-ouro-command-empty]")!) - middle(room))).toBeLessThanOrEqual(1);
    await userEvent.clear(input());
    await expect.poll(() => document.querySelector("[data-ouro-command-empty]")).toBeNull();
    // The empty state's live region stays in the list's room, taking none of it.
    expect(room.querySelector('[role="status"]')!.getBoundingClientRect().height).toBe(0);
  });

  it("hides the empty list from assistive technology while nothing matches, so the gate passes with only the empty state", async () => {
    await openPalette({ emptyLabel: "Nothing found" });
    await userEvent.type(input(), "zzz");
    await expect.element(page.getByText("Nothing found")).toBeVisible();
    const list = document.querySelector('[role="listbox"]')!;
    expect(list.hasAttribute("hidden")).toBe(true);
    expect(describeFindings(await audit({ include: [document.documentElement], exclude: axeExclude.map((selector) => [selector]) }))).toBe("");
    await userEvent.clear(input());
    await expect.poll(() => list.hasAttribute("hidden")).toBe(false);
  });

  it("scrolls a long list by the arrow keys from the search, which keeps focus and Tab, and passes axe", async () => {
    const many = Array.from({ length: 14 }, (_, index) => ({ label: `Conversation ${index + 1}`, onSelect: () => {} }));
    await openPalette({ items: many });
    await expect.poll(() => document.activeElement).toBe(input().element());
    const listbox = document.querySelector<HTMLElement>('[role="listbox"]')!;
    // The list is the combobox's own popup, which scrolls: axe leaves it to the combobox.
    expect(listbox.scrollHeight).toBeGreaterThan(listbox.clientHeight);
    expect(input().element().getAttribute("aria-controls")).toBe(listbox.id);
    expect(describeFindings(await audit({ include: [document.documentElement], exclude: axeExclude.map((selector) => [selector]) }))).toBe("");
    // The palette's tab stops are the search and its close button: the list is reached by the arrow keys.
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    const stops = [...dialog.querySelectorAll<HTMLElement>("*")].filter((element) => element.tabIndex >= 0 && !element.hasAttribute("data-base-ui-focus-guard"));
    expect(stops).toEqual([input().element(), dialog.querySelector("[data-ouro-command-close]")]);
    await pressTab();
    expect(document.activeElement).toBe(dialog.querySelector("[data-ouro-command-close]"));
    await pressTab({ shift: true });
    expect(document.activeElement).toBe(input().element());
    const last = page.getByRole("option", { name: "Conversation 14" }).element();
    await userEvent.keyboard("{ArrowUp}");
    expect(input().element().getAttribute("aria-activedescendant")).toBe(last.id);
    expect(document.activeElement).toBe(input().element());
    await expect.poll(() => listbox.scrollTop).toBeGreaterThan(0);
    const [box, row] = [listbox.getBoundingClientRect(), last.getBoundingClientRect()];
    expect(row.bottom).toBeLessThanOrEqual(box.bottom + 1);
  });

  it("runs the highlighted command on Enter, closes, and returns focus to the trigger", async () => {
    await openPalette();
    await userEvent.type(input(), "import");
    await userEvent.keyboard("{Enter}");
    expect(actions.import).toHaveBeenCalledOnce();
    await expect.poll(popup).toBeNull();
    await expect.poll(() => document.activeElement).toBe(trigger());
  });

  it("shows the highlighted command in the system's highlight colours under forced colours, where its fill is dropped", async () => {
    await openPalette();
    await expect.poll(() => document.querySelector("[data-highlighted]")).not.toBeNull();
    await commands.emulateMedia({ forcedColors: "active" });
    try {
      const highlighted = document.querySelector("[data-highlighted]")!;
      expect(getComputedStyle(highlighted).backgroundColor).not.toBe(behind(highlighted));
    } finally {
      await commands.emulateMedia({ forcedColors: "none" });
    }
  });

  it("moves the highlight with the arrow keys", async () => {
    await openPalette();
    await expect.poll(() => document.querySelector("[data-highlighted] [data-ouro-command-label]")?.textContent).toBe("New recipe");
    await userEvent.keyboard("{ArrowDown}");
    expect(document.querySelector("[data-highlighted] [data-ouro-command-label]")?.textContent).toBe("Import from a link");
    await userEvent.keyboard("{Enter}");
    expect(actions.import).toHaveBeenCalledOnce();
  });

  it("runs a command on click, and never a disabled one", async () => {
    await openPalette();
    await userEvent.click(page.getByRole("option", { name: "Sign out" }), { force: true });
    expect(actions.signOut).not.toHaveBeenCalled();
    await userEvent.click(page.getByRole("option", { name: "Switch theme" }));
    expect(actions.theme).toHaveBeenCalledOnce();
    await expect.poll(popup).toBeNull();
  });

  it("closes on Escape, with or without a query", async () => {
    await openPalette();
    await userEvent.type(input(), "new");
    await userEvent.keyboard("{Escape}");
    await expect.poll(popup).toBeNull();
    await userEvent.click(trigger());
    await settled();
    expect((input().element() as HTMLInputElement).value).toBe("");
    await userEvent.keyboard("{Escape}");
    await expect.poll(popup).toBeNull();
  });

  it("keeps its size while results filter, so the search input stays put", async () => {
    const element = await openPalette();
    const before = element.getBoundingClientRect();
    const field = input().element().getBoundingClientRect().top;
    await userEvent.type(input(), "import");
    await expect.poll(options).toEqual(["Import from a link"]);
    expect(element.getBoundingClientRect().height).toBe(before.height);
    await userEvent.type(input(), "zzz");
    await expect.poll(options).toEqual([]);
    expect(element.getBoundingClientRect().height).toBe(before.height);
    expect(input().element().getBoundingClientRect().top).toBe(field);
  });

  it("labels the search input and its close button, translated", async () => {
    await openPalette({ searchLabel: "Find", placeholder: "Find…", closeLabel: "Dismiss" });
    await expect.element(page.getByRole("combobox", { name: "Find" })).toBeVisible();
    expect(page.getByRole("combobox", { name: "Find" }).element().getAttribute("placeholder")).toBe("Find…");
    const close = page.getByRole("button", { name: "Dismiss" }).element();
    expect(close.className).toContain("sr-only");
  });

  it("prompts with its search label when no placeholder is given, so what the field says and what it is named agree", async () => {
    await openPalette({ searchLabel: "Search orders" });
    await expect.element(page.getByRole("combobox", { name: "Search orders" })).toHaveAttribute("placeholder", "Search orders…");
  });

  it("keeps the trigger's own onClick, which can stop the palette opening", async () => {
    const onClick = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    await render(<Command title="Command palette" trigger={<Button onClick={onClick}>Search</Button>} items={entries()} />);
    await userEvent.click(trigger());
    expect(onClick).toHaveBeenCalledOnce();
    await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    expect(popup()).toBeNull();
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
  });

  it("lists loose items without a group heading", async () => {
    const run = vi.fn();
    await render(<Command title="Go to" trigger={<Button>Go</Button>} items={[{ label: "Home", onSelect: run }, { label: "Pantry", onSelect: run }]} />);
    await userEvent.click(trigger());
    await settled();
    expect(options()).toEqual(["Home", "Pantry"]);
    expect(document.querySelector("[data-ouro-command-group-label]")).toBeNull();
  });

  it("passes the accessibility gate open, in light and dark, from the page's main landmark", async () => {
    // As an app places it: its trigger in the page's main, under the page's heading.
    const main = document.createElement("main");
    main.innerHTML = "<h1>Recipes</h1>";
    document.body.append(main);
    mounted.push(main);
    await render(<Command title="Go to" trigger={<Button>Go</Button>} items={[{ label: "Home", onSelect: () => {} }]} />, main);
    await userEvent.click(trigger());
    await settled();
    for (const scheme of ["light", "dark"]) {
      document.documentElement.classList.toggle("dark", scheme === "dark");
      expect(describeFindings(await audit({ include: [document.documentElement], exclude: axeExclude.map((selector) => [selector]) }))).toBe("");
    }
    document.documentElement.classList.remove("dark");
  });
});

describe("Command width", () => {
  const long = "Export every recipe in the collection as a printable cookbook, with photos, notes, ratings and the shopping list";
  const run = () => {};
  const width = (element: HTMLElement) => element.getBoundingClientRect().width;

  it("fits short commands at 32rem, the narrowest a dialog fits", async () => {
    expect(width(await openPalette())).toBe(512);
  });

  it("widens to fit a longer command, up to 40rem", async () => {
    // A label about 560px wide in this browser's font, so the test holds wherever the text measures differently.
    const probe = (await openPalette({ items: [{ label: "probe", onSelect: run }] })).querySelector<HTMLElement>("[data-ouro-command-label]")!;
    probe.textContent = "recipe ".repeat(20);
    const medium = "recipe ".repeat(Math.round((560 / probe.scrollWidth) * 20)).trim();
    await act(async () => roots.splice(0).forEach((root) => root.unmount()));
    const fitting = await openPalette({ items: [{ label: medium, onSelect: run }] });
    expect(width(fitting)).toBeGreaterThan(512);
    expect(width(fitting)).toBeLessThan(640);
    const label = fitting.querySelector<HTMLElement>("[data-ouro-command-label]")!;
    expect(label.scrollWidth).toBeLessThanOrEqual(label.clientWidth);
    await act(async () => roots.splice(0).forEach((root) => root.unmount()));
    expect(width(await openPalette({ items: [{ label: long, onSelect: run }] }))).toBe(640);
  });

  it("keeps the width it opened at while results filter", async () => {
    const element = await openPalette({ items: [{ label: long, onSelect: run }, { label: "Switch theme", onSelect: run }] });
    const opened = width(element);
    await userEvent.type(input(), "theme");
    await expect.poll(options).toEqual(["Switch theme"]);
    expect(width(element)).toBe(opened);
  });

  it("keeps the width it opened at while a server search's results change, and cuts a longer result with an ellipsis", async () => {
    function Server() {
      const [items, setItems] = useState<CommandEntry[]>([{ label: "Switch theme", onSelect: run }]);
      return (
        <Command
          title="Command palette"
          trigger={<Button>Search</Button>}
          items={items}
          onQueryChange={(query) => setItems([{ label: query === "ex" ? long : "Switch theme", onSelect: run }])}
        />
      );
    }
    await render(<Server />);
    await userEvent.click(trigger());
    const element = await settled();
    expect(width(element)).toBe(512);
    await userEvent.type(input(), "ex");
    await expect.poll(options).toEqual([long]);
    expect(width(element)).toBe(512);
    const label = element.querySelector<HTMLElement>("[data-ouro-command-label]")!;
    expect(getComputedStyle(label).textOverflow).toBe("ellipsis");
    expect(label.scrollWidth).toBeGreaterThan(label.clientWidth);
    await userEvent.type(input(), "t");
    await expect.poll(options).toEqual(["Switch theme"]);
    expect(width(element)).toBe(512);
  });
});

describe("Command search focus", () => {
  it("draws the search row's line in the ring colour while the search input has keyboard focus", async () => {
    const element = await openPalette();
    const ring = document.createElement("i");
    ring.className = "border-ring";
    document.body.append(ring);
    mounted.push(ring);
    const line = () => getComputedStyle(element.querySelector("[data-ouro-command-search]")!).borderBottomColor;
    await expect.poll(() => document.activeElement).toBe(input().element());
    expect(line()).toBe(getComputedStyle(ring).borderTopColor);
    await pressTab();
    expect(document.activeElement).not.toBe(input().element());
    expect(line()).not.toBe(getComputedStyle(ring).borderTopColor);
    await act(async () => input().element().focus());
    expect(line()).toBe(getComputedStyle(ring).borderTopColor);
  });
});

describe("Command results that stream in", () => {
  const run = () => {};
  /** A palette whose results come from a slow source: the test sets them as they arrive. */
  const palette = (labels: (string | [label: string, value: string])[], props: Partial<CommandProps> = {}) => (
    <Command
      title="Go to"
      open
      onOpenChange={() => {}}
      onQueryChange={() => {}}
      items={labels.map((entry) => (typeof entry === "string" ? { label: entry, onSelect: run } : { label: entry[0], value: entry[1], onSelect: run }))}
      {...(props as object)}
    />
  );
  const highlighted = () => document.querySelector("[data-highlighted] [data-ouro-command-label]")?.textContent;
  const arrive = (next: ReturnType<typeof palette>) => act(async () => roots[0]!.render(next));
  /** Waits for the search input to have focus, so the arrow keys reach the list. */
  const ready = () => expect.poll(() => document.activeElement).toBe(input().element());

  it("keeps the highlight on the same command when results arrive above it", async () => {
    await render(palette(["Launch planning", "Weekly sync"]));
    await settled();
    await ready();
    await expect.poll(highlighted).toBe("Launch planning");
    await userEvent.keyboard("{ArrowDown}");
    await expect.poll(highlighted).toBe("Weekly sync");
    await arrive(palette(["New chat", "Design reviews", "Launch planning", "Weekly sync"]));
    await expect.poll(highlighted).toBe("Weekly sync");
    await arrive(palette(["Weekly sync", "Launch planning"]));
    await expect.poll(highlighted).toBe("Weekly sync");
  });

  it("keeps the first command highlighted by default where it is when results arrive above it", async () => {
    await render(palette(["Launch planning", "Weekly sync"]));
    await settled();
    await expect.poll(highlighted).toBe("Launch planning");
    await arrive(palette(["New chat", "Launch planning", "Weekly sync"]));
    await expect.poll(highlighted).toBe("Launch planning");
  });

  it("goes to the first command when the highlighted one leaves the results", async () => {
    await render(palette(["Launch planning", "Weekly sync", "Design reviews"]));
    await settled();
    await ready();
    await expect.poll(highlighted).toBe("Launch planning");
    await userEvent.keyboard("{ArrowDown}");
    await expect.poll(highlighted).toBe("Weekly sync");
    await arrive(palette(["Design reviews", "Launch planning"]));
    await expect.poll(highlighted).toBe("Design reviews");
    await arrive(palette([]));
    await expect.poll(() => document.querySelector("[data-ouro-command-empty]")).not.toBeNull();
    await arrive(palette(["Weekly sync", "Design reviews"]));
    await expect.poll(highlighted).toBe("Weekly sync");
  });

  it("highlights the first result for a new search, though the command highlighted before is among them", async () => {
    await render(palette(["Launch planning", "Weekly sync"]));
    await settled();
    await ready();
    await userEvent.keyboard("{ArrowDown}");
    await expect.poll(highlighted).toBe("Weekly sync");
    await userEvent.type(input(), "w");
    await arrive(palette(["Weekly notes", "Weekly sync"]));
    await expect.poll(highlighted).toBe("Weekly notes");
  });

  it("highlights the first result for a new search, though the command highlighted by default before is among them further down", async () => {
    await render(palette(["Launch planning", "Weekly sync"]));
    await settled();
    await ready();
    await expect.poll(highlighted).toBe("Launch planning");
    await userEvent.type(input(), "w");
    await arrive(palette(["Weekly notes", "Launch planning", "Weekly sync"]));
    await expect.poll(highlighted).toBe("Weekly notes");
  });

  it("tells commands with the same label apart by value", async () => {
    await render(palette([["Noor Haddad", "noor-1"], ["Noor Haddad", "noor-2"]]));
    await settled();
    const second = () => document.querySelector("[data-highlighted]")?.getAttribute("data-ouro-command-value");
    await expect.poll(second).toBe("noor-1");
    await ready();
    await userEvent.keyboard("{ArrowDown}");
    await expect.poll(second).toBe("noor-2");
    await arrive(palette([["Ines Park", "ines"], ["Noor Haddad", "noor-1"], ["Noor Haddad", "noor-2"]]));
    await expect.poll(second).toBe("noor-2");
  });

  it("highlights the best match again when the person types, even where the highlighted command still matches", async () => {
    await openPalette();
    await userEvent.keyboard("{ArrowDown}");
    await expect.poll(highlighted).toBe("Import from a link");
    await userEvent.type(input(), "e");
    await expect.poll(options).toContain("Import from a link");
    await expect.poll(highlighted).toBe("New recipe");
  });

  it("says how many results there are, politely and once, after they settle", async () => {
    const said = watchAnnouncements();
    try {
      await render(palette(["Launch planning", "Weekly sync"], { loading: true }));
      await settled();
      await userEvent.type(input(), "la");
      // Two answers in quick succession: only the settled one is said.
      await arrive(palette(["Launch planning", "Launch review", "Lab notes"], { loading: false }));
      await arrive(palette(["Launch planning"], { loading: false }));
      const region = () => document.querySelector("[data-ouro-command-results]")!;
      await expect.poll(() => region().textContent).toBe("1 result");
      expect(said.count("3 results")).toBe(0);
      expect(region().getAttribute("role")).toBe("status");
      await arrive(palette(["Launch planning", "Lab notes"], { loading: false }));
      await expect.poll(() => region().textContent).toBe("2 results");
      await arrive(palette(["Launch planning", "Lab notes", "Launch review"], { loading: false, resultsLabel: (count: number) => `${count} matches` }));
      await expect.poll(() => region().textContent).toBe("3 matches");
      // With nothing found, the empty state speaks, and the count goes quiet.
      await arrive(palette([], { loading: false }));
      await expect.poll(() => document.querySelector("[data-ouro-command-results]")!.textContent).toBe("");
    } finally {
      said.stop();
    }
  });

  it("says nothing of an empty search's results, which are the palette's own list", async () => {
    const said = watchAnnouncements();
    try {
      await render(palette(["Launch planning", "Weekly sync"]));
      await settled();
      // real clock: the count is said 400ms after results settle; this waits past that to show none comes.
      await new Promise((resolve) => setTimeout(resolve, 600));
      expect(document.querySelector("[data-ouro-command-results]")!.textContent).toBe("");
      expect(said.count("2 results")).toBe(0);
      // Nor of results still loading.
      await arrive(palette(["Launch planning", "Weekly sync"], { loading: true }));
      await userEvent.type(input(), "la");
      // real clock: as above, past the moment a settled count would be said.
      await new Promise((resolve) => setTimeout(resolve, 600));
      expect(document.querySelector("[data-ouro-command-results]")!.textContent).toBe("");
    } finally {
      said.stop();
    }
  });
});

describe("Command rows shown whatever the search", () => {
  const run = () => {};
  const note = () => document.querySelector<HTMLElement>("[data-ouro-command-no-match]")!;

  it("shows a row marked alwaysShown whatever the search, after the matches, and the empty state above it, said politely once, when only such rows match", async () => {
    const said = watchAnnouncements();
    try {
      const items = [
        { label: "Settings", onSelect: run },
        { label: "Help center search", onSelect: run, alwaysShown: true },
        { label: "Profile", onSelect: run },
      ];
      await render(<Command title="Commands" open onOpenChange={() => {}} items={items} emptyLabel="No commands match." />);
      await settled();
      expect(note().textContent).toBe("");
      await userEvent.type(input(), "pro");
      await expect.poll(options).toEqual(["Profile", "Help center search"]);
      expect(note().textContent).toBe("");
      await userEvent.type(input(), "zq");
      await expect.poll(options).toEqual(["Help center search"]);
      await expect.poll(() => note().textContent).toBe("No commands match.");
      expect(note().getAttribute("role")).toBe("status");
      expect(note().getAttribute("aria-live")).toBe("polite");
      // The region stays in the accessibility tree while it is empty, so the note is heard as it comes.
      await userEvent.clear(input());
      await expect.poll(() => note().textContent).toBe("");
      expect(getComputedStyle(note()).display).not.toBe("none");
      await userEvent.type(input(), "prozq");
      await expect.poll(() => note().textContent).toBe("No commands match.");
      // Typing on while only that row matches leaves the note as it was: it is not said again, so twice in all, once each time it came.
      await userEvent.type(input(), "x");
      await act(async () => {});
      expect(said.count("No commands match.")).toBe(2);
      // With no such row, nothing matching is the empty state's to say, not the note's.
      await act(async () => roots[0]!.render(<Command title="Commands" open onOpenChange={() => {}} items={items.filter((item) => !item.alwaysShown)} emptyLabel="No commands match." />));
      await expect.poll(() => document.querySelector("[data-ouro-command-empty]")?.textContent).toBe("No commands match.");
      expect(note().textContent).toBe("");
    } finally {
      said.stop();
    }
  });

  it("shows the empty state among a server's always-shown rows, and leaves those rows out of the result count", async () => {
    const said = watchAnnouncements();
    try {
      const empty = <strong>No chats by that name.</strong>;
      const palette = (labels: string[]) => (
        <Command
          title="Jump to a chat"
          open
          onOpenChange={() => {}}
          onQueryChange={() => {}}
          empty={empty}
          items={[...labels.map((label) => ({ label, onSelect: run })), { label: "Jump to a chat by its address", onSelect: run, alwaysShown: true }]}
        />
      );
      // The empty search's list is the palette's own, though it holds only that row: no note.
      await render(palette([]));
      await settled();
      expect(note().textContent).toBe("");
      await userEvent.type(input(), "zq");
      await expect.poll(() => note().querySelector("strong")?.textContent).toBe("No chats by that name.");
      await expect.poll(() => said.count("No chats by that name.")).toBe(1);
      expect(document.querySelector("[data-ouro-command-empty]")).toBeNull();
      // real clock: the count is said 400ms after results settle; this waits past that to show none comes.
      await new Promise((resolve) => setTimeout(resolve, 600));
      expect(document.querySelector("[data-ouro-command-results]")!.textContent).toBe("");
      await act(async () => roots[0]!.render(palette(["Zq launch", "Zq review"])));
      await expect.poll(() => note().textContent).toBe("");
      await expect.poll(() => document.querySelector("[data-ouro-command-results]")!.textContent).toBe("2 results");
    } finally {
      said.stop();
    }
  });

  const groupLabels = () => [...document.querySelectorAll("[data-ouro-command-group-label]")].map((label) => label.textContent);

  it("shows every row of a group marked alwaysShown whatever the search, under its label, and the empty state above them, said politely once, when only they match", async () => {
    const said = watchAnnouncements();
    try {
      const items: CommandEntry[] = [
        { label: "Chats", items: [{ label: "Launch planning", onSelect: run }, { label: "Design review", onSelect: run }] },
        { label: "Go to", alwaysShown: true, items: [{ label: "Jump to a chat by its address", onSelect: run }, { label: "Search messages", onSelect: run }] },
      ];
      await render(<Command title="Commands" open onOpenChange={() => {}} items={items} emptyLabel="No chats match." />);
      await settled();
      expect(note().textContent).toBe("");
      await userEvent.type(input(), "launch");
      await expect.poll(options).toEqual(["Launch planning", "Jump to a chat by its address", "Search messages"]);
      expect(groupLabels()).toEqual(["Chats", "Go to"]);
      expect(note().textContent).toBe("");
      await userEvent.clear(input());
      await userEvent.type(input(), "zq");
      await expect.poll(options).toEqual(["Jump to a chat by its address", "Search messages"]);
      expect(groupLabels()).toEqual(["Go to"]);
      await expect.poll(() => note().textContent).toBe("No chats match.");
      expect(document.querySelector("[data-ouro-command-empty]")).toBeNull();
      await userEvent.type(input(), "x");
      await act(async () => {});
      expect(said.count("No chats match.")).toBe(1);
    } finally {
      said.stop();
    }
  });

  it("shows the empty state among a server's rows in a group marked alwaysShown, and leaves those rows out of the result count", async () => {
    const said = watchAnnouncements();
    try {
      const palette = (labels: string[]) => (
        <Command
          title="Jump to a chat"
          open
          onOpenChange={() => {}}
          onQueryChange={() => {}}
          emptyLabel="No chats by that name."
          items={[
            ...(labels.length > 0 ? [{ label: "Chats", items: labels.map((label) => ({ label, onSelect: run })) }] : []),
            { label: "Go to", alwaysShown: true, items: [{ label: "Jump to a chat by its address", onSelect: run }, { label: "Search messages", onSelect: run }] },
          ]}
        />
      );
      await render(palette([]));
      await settled();
      expect(note().textContent).toBe("");
      await userEvent.type(input(), "zq");
      await expect.poll(() => note().textContent).toBe("No chats by that name.");
      await expect.poll(() => said.count("No chats by that name.")).toBe(1);
      expect(groupLabels()).toEqual(["Go to"]);
      // real clock: the count is said 400ms after results settle; this waits past that to show none comes.
      await new Promise((resolve) => setTimeout(resolve, 600));
      expect(document.querySelector("[data-ouro-command-results]")!.textContent).toBe("");
      await act(async () => roots[0]!.render(palette(["Zq launch", "Zq review"])));
      await expect.poll(() => note().textContent).toBe("");
      await expect.poll(() => document.querySelector("[data-ouro-command-results]")!.textContent).toBe("2 results");
    } finally {
      said.stop();
    }
  });
});

describe("Command match highlighting", () => {
  const run = () => {};
  const recipes: CommandEntry[] = [
    { label: "Import from a link", description: "Paste a link to any recipe page", onSelect: run },
    { label: "Weeknight dinners", description: "Quick recipes for a busy night", onSelect: run },
  ];
  const marks = (row: Element) => [...row.querySelectorAll("mark")].map((mark) => mark.textContent);
  const row = (label: string) => [...document.querySelectorAll('[role="option"]')].find((option) => option.querySelector("[data-ouro-command-label]")!.textContent === label)!;

  it("marks the words of the search in each command's label and description, and keeps the text as it was", async () => {
    await openPalette({ items: recipes, highlightMatches: true });
    expect(document.querySelectorAll('[role="option"] mark')).toHaveLength(0);
    await userEvent.type(input(), "link Recipe");
    await expect.poll(options).toEqual(["Import from a link"]);
    const option = row("Import from a link");
    expect(marks(option)).toEqual(["link", "link", "recipe"]);
    expect(option.querySelector("[data-ouro-command-label]")!.textContent).toBe("Import from a link");
    expect(option.querySelector("[data-ouro-command-description]")!.textContent).toBe("Paste a link to any recipe page");
    await expect.element(page.getByRole("option", { name: /^Import from a link/ })).toBeVisible();
  });

  it("marks what the app's ranges say, in place of the search's words", async () => {
    await openPalette({
      items: [{ label: "Launch planning", description: "Notes from the launch review", highlight: { label: [[0, 6], [8, 8]], description: [[15, 21], [100, 120]] }, onSelect: run }],
      highlightMatches: true,
    });
    expect(marks(row("Launch planning"))).toEqual(["Launch", "launch"]);
  });

  it("finds where each word of the search starts and ends in a text, each time it appears", () => {
    expect(queryRanges("Paste a link to any recipe page", "LINK pa")).toEqual([
      [0, 2],
      [8, 12],
      [27, 29],
    ]);
  });

  it("keeps a standalone accent in place, so a word folding to a different length does not shift a match", () => {
    expect(queryRanges("The launch list is done. \u00b7 Two left", "launch")).toEqual([[4, 10]]);
    expect(queryRanges("Re^set filters", "set")).toEqual([[3, 6]]);
  });

  it("merges the search's words where they meet or overlap, in the text's order", async () => {
    await openPalette({
      items: [
        { label: "Import from a link", description: "Paste a link to any recipe page", onSelect: run },
        { label: "Labs", onSelect: run },
      ],
      highlightMatches: true,
    });
    await userEvent.type(input(), "link in paste");
    await expect.poll(() => marks(row("Import from a link"))).toEqual(["link", "Paste", "link"]);
    await userEvent.clear(input());
    await userEvent.type(input(), "la bs");
    await expect.poll(() => marks(row("Labs"))).toEqual(["Labs"]);
  });

  it("marks a word in a label that holds a part whose folding changes length, mapping its range back", async () => {
    await openPalette({
      items: [
        { label: "한글 notes", onSelect: run },
        { label: "Launch notes", description: "Notes from the review", highlight: { label: [[0, 6]] }, onSelect: run },
      ],
      highlightMatches: true,
    });
    await userEvent.type(input(), "notes");
    await expect.poll(options).toEqual(["한글 notes", "Launch notes"]);
    expect(marks(row("한글 notes"))).toEqual(["notes"]);
    expect(marks(row("Launch notes"))).toEqual(["Launch"]);
  });

  it("marks nothing without highlightMatches, and searches a command's description", async () => {
    await openPalette({ items: recipes });
    await userEvent.type(input(), "busy");
    await expect.poll(options).toEqual(["Weeknight dinners"]);
    expect(document.querySelectorAll('[role="option"] mark')).toHaveLength(0);
    // Only the command's own words, each apart: nothing for a word none of them has, for "undefined", or for two run together.
    for (const word of ["stryker", "undefined", "dinnersquick"]) {
      await userEvent.clear(input());
      await userEvent.type(input(), word);
      await expect.poll(options).toEqual([]);
    }
  });

  it("keeps a long label on one line over its description, in bold while unread", async () => {
    const long = "Import from a link, with every photo, note, rating, comment, shopping list and cooking time the page has, kept just as it was on the page it came from";
    await openPalette({ items: [{ label: long, description: "Paste a link to any recipe page", unread: true, onSelect: run }] });
    const label = document.querySelector<HTMLElement>("[data-ouro-command-label]")!;
    expect(label.scrollWidth).toBeGreaterThan(label.clientWidth);
    expect(label.getBoundingClientRect().height).toBeLessThan(2 * parseFloat(getComputedStyle(label).lineHeight));
    expect(getComputedStyle(label).fontWeight).toBe("600");
  });

  it("draws marked words that keep their contrast in light and dark, highlighted or not, and in forced colours", async () => {
    for (const dark of [false, true]) {
      document.documentElement.classList.toggle("dark", dark);
      try {
        await openPalette({ items: recipes, highlightMatches: true });
        await userEvent.type(input(), "link");
        await expect.poll(() => document.querySelectorAll('[role="option"] mark').length).toBe(2);
        for (const mark of document.querySelectorAll('[role="option"] mark')) {
          expect(await measureTextContrast(mark, 4.5), `${dark ? "dark" : "light"}: ${mark.textContent}`).toEqual({ pass: true });
          expect(getComputedStyle(mark).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
        }
        await act(async () => roots.splice(0).forEach((root) => root.unmount()));
      } finally {
        document.documentElement.classList.remove("dark");
      }
    }
    await commands.emulateMedia({ forcedColors: "active" });
    try {
      await openPalette({ items: recipes, highlightMatches: true });
      await userEvent.type(input(), "link");
      const mark = await expect.poll(() => document.querySelector('[role="option"] mark')).not.toBeNull().then(() => document.querySelector<HTMLElement>('[role="option"] mark')!);
      const probe = document.createElement("span");
      probe.style.cssText = "background: Mark; color: MarkText";
      document.body.append(probe);
      mounted.push(probe);
      expect(getComputedStyle(mark).backgroundColor).toBe(getComputedStyle(probe).backgroundColor);
      expect(getComputedStyle(mark).color).toBe(getComputedStyle(probe).color);
    } finally {
      await commands.emulateMedia({ forcedColors: "none" });
    }
  });
});

describe("Command and focus after a choice", () => {
  it("returns focus to its trigger after a choice, and leaves it where the choice put it with restoreFocus false", async () => {
    const target = document.createElement("button");
    target.textContent = "Conversation";
    document.body.append(target);
    mounted.push(target);
    await render(
      <Command
        title="Go to"
        trigger={<Button>Go to</Button>}
        items={[
          { label: "Stay", onSelect: () => target.focus() },
          { label: "Open the conversation", restoreFocus: false, onSelect: () => target.focus() },
        ]}
      />,
    );
    await userEvent.click(trigger());
    await settled();
    await userEvent.keyboard("{Enter}");
    await expect.poll(popup).toBeNull();
    await expect.poll(() => document.activeElement).toBe(trigger());
    await userEvent.click(trigger());
    await settled();
    await userEvent.keyboard("{ArrowDown}{Enter}");
    await expect.poll(popup).toBeNull();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    expect(document.activeElement).toBe(target);
    // Only that choice: the next close, by Escape, returns focus to the trigger again, even when
    // the palette opened while focus was somewhere else.
    trigger().click();
    await settled();
    await userEvent.keyboard("{Escape}");
    await expect.poll(popup).toBeNull();
    await expect.poll(() => document.activeElement).toBe(trigger());
  });

  it("leaves focus where a command that navigates put it, unless it says restoreFocus", async () => {
    const target = document.createElement("button");
    target.textContent = "Conversation";
    document.body.append(target);
    mounted.push(target);
    await render(
      <Command
        title="Go to"
        trigger={<Button>Go to</Button>}
        items={[
          { label: "Open the conversation", navigates: true, onSelect: () => target.focus() },
          { label: "Preview the conversation", navigates: true, restoreFocus: true, onSelect: () => target.focus() },
        ]}
      />,
    );
    await userEvent.click(trigger());
    await settled();
    await userEvent.keyboard("{Enter}");
    await expect.poll(popup).toBeNull();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    expect(document.activeElement).toBe(target);
    await userEvent.click(trigger());
    await settled();
    await userEvent.keyboard("{ArrowDown}{Enter}");
    await expect.poll(popup).toBeNull();
    await expect.poll(() => document.activeElement).toBe(trigger());
  });
});

describe("controlled Command", () => {
  function Controlled({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Open palette
        </button>
        <Command
          title="Command palette"
          open={open}
          onOpenChange={(next) => {
            onOpenChange?.(next);
            setOpen(next);
          }}
          items={entries()}
        />
      </>
    );
  }

  it("opens from the app's state and reports closing through onOpenChange", async () => {
    const onOpenChange = vi.fn();
    await render(<Controlled onOpenChange={onOpenChange} />);
    const opener = page.getByRole("button", { name: "Open palette" }).element() as HTMLElement;
    opener.focus();
    await userEvent.keyboard("{Enter}");
    await settled();
    await expect.poll(() => document.activeElement).toBe(input().element());
    await userEvent.keyboard("{Escape}");
    await expect.poll(popup).toBeNull();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    await expect.poll(() => document.activeElement).toBe(opener);
  });

  it("focuses the palette, not the input, after a pen tap, so no keyboard pops up", async () => {
    await render(<Controlled />);
    const opener = page.getByRole("button", { name: "Open palette" }).element() as HTMLElement;
    await act(() => opener.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "pen", bubbles: true })));
    await act(() => opener.dispatchEvent(new MouseEvent("click", { detail: 1, bubbles: true })));
    await settled();
    await expect.poll(() => document.activeElement).toBe(popup());
  });
});

describe("Command with useCommandShortcut", () => {
  it("opens on mod+K from anywhere on the page, and the shortcut closes it again", async () => {
    function App() {
      const [open, setOpen] = useCommandShortcut("mod+k");
      return <Command title="Command palette" open={open} onOpenChange={setOpen} items={entries()} />;
    }
    await render(<App />);
    const mod = /mac|iphone|ipad/i.test(navigator.platform) ? "Meta" : "Control";
    await userEvent.keyboard(`{${mod}>}k{/${mod}}`);
    await settled();
    await expect.poll(() => document.activeElement).toBe(input().element());
    await userEvent.keyboard(`{${mod}>}k{/${mod}}`);
    await expect.poll(popup).toBeNull();
  });
});

describe("Command presentation", () => {
  it("sizes a short palette's sheet to its commands below 640px, not full height", async () => {
    await page.viewport(390, 844);
    const element = await openPalette();
    expect(element.getAttribute("data-ouro-presentation")).toBe("sheet");
    await expect.element(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
    const body = element.querySelector<HTMLElement>("[data-ouro-sheet-content]")!;
    // The sheet ends where its commands end, with the body's padding below them, so no blank part of it is left over.
    const list = element.querySelector<HTMLElement>("[data-ouro-command-list]")!;
    const padding = parseFloat(getComputedStyle(body).paddingBottom);
    expect(Math.abs(innerHeight - list.getBoundingClientRect().bottom - padding)).toBeLessThan(2);
    expect(element.getBoundingClientRect().top).toBeGreaterThan(innerHeight / 2);
  });

  it("keeps the sheet's height and the search input's place while the results filter below 640px", async () => {
    await page.viewport(390, 844);
    const element = await openPalette();
    const sheetTop = element.getBoundingClientRect().top;
    const top = input().element().getBoundingClientRect().top;
    await userEvent.type(input(), "import");
    await expect.poll(options).toEqual(["Import from a link"]);
    expect(input().element().getBoundingClientRect().top).toBe(top);
    expect(element.getBoundingClientRect().top).toBe(sheetTop);
    await userEvent.type(input(), "zzz");
    await expect.poll(options).toEqual([]);
    expect(input().element().getBoundingClientRect().top).toBe(top);
    expect(element.getBoundingClientRect().top).toBe(sheetTop);
    await userEvent.keyboard("{Escape}");
    await expect.poll(popup).toBeNull();
    await expect.poll(() => document.activeElement).toBe(trigger());
  });

  it("keeps the size it opened at through a resize across 640px, though typing has filtered the results since", async () => {
    await page.viewport(390, 844);
    const element = await openPalette();
    const sheetTop = element.getBoundingClientRect().top;
    await userEvent.type(input(), "import");
    await expect.poll(options).toEqual(["Import from a link"]);
    await page.viewport(1280, 800);
    await expect.poll(() => popup()?.getAttribute("data-ouro-presentation")).toBe("dialog");
    await page.viewport(390, 844);
    await expect.poll(() => popup()?.getAttribute("data-ouro-presentation")).toBe("sheet");
    expect(Math.abs((await settled()).getBoundingClientRect().top - sheetTop)).toBeLessThan(1);
  });

  it("opens a palette whose commands overflow the phone's screen at full height", async () => {
    await page.viewport(390, 844);
    const run = vi.fn();
    const element = await openPalette({ items: [{ label: "Recipes", items: Array.from({ length: 30 }, (_, index) => ({ label: `Recipe ${index + 1}`, onSelect: run })) }] });
    expect(Math.round(element.getBoundingClientRect().bottom)).toBe(innerHeight);
    expect(element.getBoundingClientRect().top).toBeLessThan(innerHeight / 10);
  });

  it("opens a server-searched palette at full height below 640px", async () => {
    await page.viewport(390, 844);
    const element = await openPalette({ onQueryChange: () => {} });
    expect(Math.round(element.getBoundingClientRect().bottom)).toBe(innerHeight);
    expect(element.getBoundingClientRect().top).toBeLessThan(innerHeight / 10);
  });

  it("puts focus in the phone sheet's search after a click below 640px, so the keys typed next land in it", async () => {
    await page.viewport(390, 844);
    await openPalette();
    expect(popup()!.getAttribute("data-ouro-presentation")).toBe("sheet");
    await expect.poll(() => document.activeElement).toBe(input().element());
    await userEvent.keyboard("import");
    await expect.poll(options).toEqual(["Import from a link"]);
  });

  it("puts focus in the phone sheet's search after a key press below 640px", async () => {
    await page.viewport(390, 844);
    await render(<KeyOpened seen={{ focus: null }} />);
    document.querySelector<HTMLElement>("[data-test-harness]")!.focus();
    await userEvent.keyboard("k");
    await settled();
    expect(popup()!.getAttribute("data-ouro-presentation")).toBe("sheet");
    await expect.poll(() => document.activeElement).toBe(input().element());
  });

  it("puts focus in the phone sheet's search in the key's own task below 640px, before a frame is drawn", async () => {
    await page.viewport(390, 844);
    const seen = { focus: null as Element | null };
    await render(<KeyOpened seen={seen} />);
    document.querySelector<HTMLElement>("[data-test-harness]")!.focus();
    await userEvent.keyboard("k");
    await expect.poll(() => seen.focus).not.toBeNull();
    expect(popup()!.getAttribute("data-ouro-presentation")).toBe("sheet");
    expect(seen.focus).toBe(input().element());
  });

  it.each(["touch", "pen"])("focuses the phone sheet itself, not its search, after a %s tap below 640px, so no keyboard pops up", async (pointerType) => {
    await page.viewport(390, 844);
    await render(<KeyOpened seen={{ focus: null }} />);
    const opener = document.querySelector<HTMLElement>("[data-test-harness]")!;
    await act(() => opener.dispatchEvent(new PointerEvent("pointerdown", { pointerType, bubbles: true })));
    await act(() => opener.dispatchEvent(new MouseEvent("click", { detail: 1, bubbles: true })));
    await settled();
    expect(popup()!.getAttribute("data-ouro-presentation")).toBe("sheet");
    await expect.poll(() => document.activeElement).toBe(popup());
  });

  it("leaves focus where Tab moved it before the phone sheet's first frame, below 640px", async () => {
    await page.viewport(390, 844);
    function TabbedAtOnce() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button
            type="button"
            data-test-harness=""
            onKeyDown={(event) => {
              if (event.key !== "k") return;
              event.preventDefault();
              flushSync(() => setOpen(true));
              // Tab from the search goes to the sheet's close button; here it lands before the sheet's first frame.
              queueMicrotask(() => queueMicrotask(() => document.querySelector<HTMLElement>("[data-ouro-sheet-close]")!.focus()));
            }}
          >
            Page
          </button>
          <Command title="Command palette" items={entries()} open={open} onOpenChange={setOpen} />
        </>
      );
    }
    await render(<TabbedAtOnce />);
    document.querySelector<HTMLElement>("[data-test-harness]")!.focus();
    await userEvent.keyboard("k");
    const close = document.querySelector<HTMLElement>("[data-ouro-sheet-close]")!;
    await expect.poll(() => document.activeElement).toBe(close);
    await act(async () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(document.activeElement).toBe(close);
  });

  it("puts focus in the phone sheet's search when the palette mounts already open below 640px", async () => {
    await page.viewport(390, 844);
    function OnDemand() {
      const [shown, setShown] = useState(false);
      return (
        <>
          <button type="button" data-test-harness="" onClick={() => setTimeout(() => setShown(true))}>
            Search
          </button>
          {shown && <Command title="Command palette" items={entries()} open onOpenChange={setShown} />}
        </>
      );
    }
    await render(<OnDemand />);
    document.querySelector<HTMLElement>("[data-test-harness]")!.focus();
    await userEvent.keyboard("{Enter}");
    await expect.element(input()).toBeInTheDocument();
    expect(popup()!.getAttribute("data-ouro-presentation")).toBe("sheet");
    await expect.poll(() => document.activeElement).toBe(input().element());
  });

  it("stays open when a resize crosses 640px", async () => {
    await openPalette();
    await page.viewport(390, 844);
    await expect.poll(() => popup()?.getAttribute("data-ouro-presentation")).toBe("sheet");
    await page.viewport(1280, 800);
    await expect.poll(() => popup()?.getAttribute("data-ouro-presentation")).toBe("dialog");
  });
});

/** A search the test answers by hand, in any order: `answer("ab", ["Abba"])`, or `fail("ab")`. */
function fakeServer() {
  const pending = new Map<string, { resolve: (labels: string[]) => void; reject: (error: Error) => void }>();
  const asked: string[] = [];
  const settle = async (run: () => void) => {
    await act(async () => {
      run();
      await Promise.resolve();
      await Promise.resolve();
    });
  };
  return {
    asked,
    search: (query: string) =>
      new Promise<string[]>((resolve, reject) => {
        asked.push(query);
        pending.set(query, { resolve, reject });
      }),
    answer: (query: string, labels: string[]) => settle(() => pending.get(query)!.resolve(labels)),
    fail: (query: string) => settle(() => pending.get(query)!.reject(new Error("offline"))),
  };
}

/**
 * How an app wires Command to a server search: the signal drops a response that a newer
 * query replaced, and loading clears when the request fails or its signal aborts.
 */
function ServerPalette({ server, onSelect = () => {} }: { server: ReturnType<typeof fakeServer>; onSelect?: () => void }) {
  const [open, setOpen] = useState(true);
  const [labels, setLabels] = useState(["Shakshuka", "Salad"]);
  const [loading, setLoading] = useState(false);
  return (
    <>
      <button type="button" data-testid="reopen" onClick={() => setOpen(true)}>
        Reopen
      </button>
      <Command
        title="Recipe search"
        open={open}
        onOpenChange={setOpen}
        loading={loading}
        items={[{ label: "Recipes", items: labels.map((label) => ({ label, onSelect })) }]}
        onQueryChange={(query, { signal }) => {
          setLoading(true);
          signal.addEventListener("abort", () => setLoading(false));
          server.search(query).then(
            (next) => {
              if (signal.aborted) return;
              setLabels(next);
              setLoading(false);
            },
            () => {
              if (!signal.aborted) setLoading(false);
            },
          );
        }}
      />
    </>
  );
}

/** A palette the app opens from a key, as a shortcut does, recording where focus is before the next frame. */
function KeyOpened({ keepMounted, onQueryChange, seen, items = entries() }: { keepMounted?: boolean; onQueryChange?: CommandProps["onQueryChange"]; seen: { focus: Element | null }; items?: CommandEntry[] }) {
  const [open, setOpen] = useState(false);
  const openNow = () => {
    flushSync(() => setOpen(true));
    // Two microtasks on, still in the task that opened it: before any frame is drawn.
    queueMicrotask(() => queueMicrotask(() => (seen.focus = document.activeElement)));
  };
  return (
    <>
      <button
        type="button"
        data-test-harness=""
        onKeyDown={(event) => {
          if (event.key !== "k") return;
          event.preventDefault();
          openNow();
        }}
        onClick={openNow}
      >
        Page
      </button>
      <Command title="Command palette" items={items} open={open} onOpenChange={setOpen} keepMounted={keepMounted} {...(onQueryChange ? { onQueryChange } : {})} />
    </>
  );
}

describe("Command opened by a key", () => {
  it.each([false, true])("puts focus in the search in the key's own task, before a frame is drawn (keepMounted %s)", async (keepMounted) => {
    const seen = { focus: null as Element | null };
    await render(<KeyOpened keepMounted={keepMounted} seen={seen} />);
    document.querySelector<HTMLElement>("[data-test-harness]")!.focus();
    await userEvent.keyboard("k");
    await expect.poll(() => seen.focus).not.toBeNull();
    expect(seen.focus).toBe(input().element());
  });

  it.each([
    ["in the task that opened it", false],
    ["in the next task", false],
    ["in the task that opened it", true],
    ["in the next task", true],
  ] as const)("leaves focus where Tab moved it %s, before a frame is drawn (keepMounted %s)", async (when, keepMounted) => {
    function TabbedAtOnce() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button
            type="button"
            data-test-harness=""
            onKeyDown={(event) => {
              if (event.key !== "k") return;
              event.preventDefault();
              flushSync(() => setOpen(true));
              // Tab from the search goes to the close button; here it lands before the dialog's first frame.
              const tab = () => document.querySelector<HTMLElement>("[data-ouro-command-close]")!.focus();
              if (when === "in the next task") setTimeout(tab);
              else queueMicrotask(() => queueMicrotask(tab));
            }}
          >
            Page
          </button>
          <Command title="Command palette" items={entries()} open={open} onOpenChange={setOpen} keepMounted={keepMounted} />
        </>
      );
    }
    await render(<TabbedAtOnce />);
    document.querySelector<HTMLElement>("[data-test-harness]")!.focus();
    await userEvent.keyboard("k");
    const close = document.querySelector<HTMLElement>("[data-ouro-command-close]")!;
    await expect.poll(() => document.activeElement).toBe(close);
    await act(async () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(document.activeElement).toBe(close);
  });

  it("puts focus in the search of a palette that mounts already open, as one loaded on demand does", async () => {
    function OnDemand() {
      const [shown, setShown] = useState(false);
      return (
        <>
          {/* The palette's code arrives later, so it mounts open in an update outside the press's own task. */}
          <button type="button" data-test-harness="" onClick={() => setTimeout(() => setShown(true))}>
            Search
          </button>
          {shown && <Command title="Command palette" items={entries()} open onOpenChange={setShown} />}
        </>
      );
    }
    await render(<OnDemand />);
    document.querySelector<HTMLElement>("[data-test-harness]")!.focus();
    await userEvent.keyboard("{Enter}");
    await expect.element(input()).toBeInTheDocument();
    await expect.poll(() => document.activeElement).toBe(input().element());
  });

  it.each(["touch", "pen"])("puts no focus in the search after a %s tap opens it, so no software keyboard pops up", async (pointerType) => {
    const seen = { focus: null as Element | null };
    await render(<KeyOpened keepMounted seen={seen} />);
    const harness = document.querySelector<HTMLElement>("[data-test-harness]")!;
    harness.dispatchEvent(new PointerEvent("pointerdown", { pointerType, bubbles: true }));
    harness.click();
    await expect.poll(() => seen.focus).not.toBeNull();
    expect(seen.focus).not.toBe(input().element());
    // A frame later the palette itself has focus.
    await expect.poll(() => document.activeElement).toBe(popup());
  });

  it.each([true, false])("puts no focus in a search the palette closed in the same task as it opened (keepMounted %s)", async (keepMounted) => {
    function OpenAndShut() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button
            type="button"
            data-test-harness=""
            onKeyDown={(event) => {
              if (event.key !== "k") return;
              flushSync(() => setOpen(true));
              flushSync(() => setOpen(false));
            }}
          >
            Page
          </button>
          <Command title="Command palette" items={entries()} open={open} onOpenChange={setOpen} keepMounted={keepMounted} />
        </>
      );
    }
    await render(<OpenAndShut />);
    const page = document.querySelector<HTMLElement>("[data-test-harness]")!;
    page.focus();
    await userEvent.keyboard("k");
    await act(async () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(document.activeElement).toBe(page);
  });
});

describe("Command kept mounted", () => {
  it("keeps its rows mounted and hidden while closed, with no dialog role, and opens them at once", async () => {
    const seen = { focus: null as Element | null };
    await render(<KeyOpened keepMounted seen={seen} />);
    const row = document.querySelector<HTMLElement>('[data-ouro-command-value="New recipe"]');
    expect(row).not.toBeNull();
    expect(row!.checkVisibility()).toBe(false);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.querySelector('[data-ouro-command-close]')!.checkVisibility()).toBe(false);
    document.querySelector<HTMLElement>("[data-test-harness]")!.focus();
    await userEvent.keyboard("k");
    await expect.element(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
    // The same row, shown: nothing mounted afresh.
    expect(document.querySelector('[data-ouro-command-value="New recipe"]')).toBe(row);
    expect(row!.checkVisibility()).toBe(true);
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.querySelector('[data-ouro-command-value="New recipe"]')).toBe(row);
  });

  it.each([true, false])("empties the search once it has closed, asking the app for the empty search's results, only when kept mounted (%s)", async (keepMounted) => {
    const queries: string[] = [];
    const seen = { focus: null as Element | null };
    await render(<KeyOpened keepMounted={keepMounted} seen={seen} onQueryChange={(query) => void queries.push(query)} />);
    document.querySelector<HTMLElement>("[data-test-harness]")!.focus();
    await userEvent.keyboard("k");
    await expect.element(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
    await userEvent.keyboard("ab");
    await expect.poll(() => (input().element() as HTMLInputElement).value).toBe("ab");
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => document.querySelector('[role="dialog"]')).toBeNull();
    // Opening asks once for the empty search, each key asks again, and only a kept palette asks once more, once its
    // closing transition has ended. One that is not kept unmounts only after that, so nothing more comes for it.
    await expect.poll(() => queries).toEqual(keepMounted ? ["", "a", "ab", ""] : ["", "a", "ab"]);
    await act(async () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(queries).toEqual(keepMounted ? ["", "a", "ab", ""] : ["", "a", "ab"]);
    if (keepMounted) expect(document.querySelector<HTMLInputElement>('[data-ouro-part="input"]')!.value).toBe("");
  });

  it("lets go of the width it held and holds the width it draws at each opening", async () => {
    const seen = { focus: null as Element | null };
    await render(<KeyOpened keepMounted seen={seen} />);
    const open = async () => {
      document.querySelector<HTMLElement>("[data-test-harness]")!.focus();
      await userEvent.keyboard("k");
      await expect.element(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
    };
    await open();
    const element = popup()!;
    await expect.poll(() => element.style.width).toMatch(/^min\(100%, \d+(\.\d+)?px\)$/);
    const drawn = element.style.width;
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => document.querySelector('[role="dialog"]')).toBeNull();
    // A width held from an earlier opening, when the commands were fewer or the screen narrower.
    element.style.width = "min(100%, 600px)";
    await open();
    expect(popup()).toBe(element);
    await expect.poll(() => element.style.width).toBe(drawn);
  });
});

describe("Command server search", () => {
  const status = () => document.querySelector<HTMLElement>("[data-ouro-command-status]")!;

  it("passes each query to onQueryChange, shows the app's results unfiltered, and keeps stale results while loading", async () => {
    const server = fakeServer();
    await render(<ServerPalette server={server} />);
    await settled();
    await userEvent.type(input(), "zz");
    // Opening asks for the empty query's results; then each keystroke asks again.
    expect(server.asked).toEqual(["", "z", "zz"]);
    // Nothing matches "zz" on the client, but the server owns the results: the stale ones stay.
    expect(options()).toEqual(["Shakshuka", "Salad"]);
    expect(document.body.textContent).not.toContain("No results");
    await server.answer("zz", ["Pizza"]);
    await expect.poll(options).toEqual(["Pizza"]);
  });

  it("drops a slow earlier response that arrives after a newer one", async () => {
    const server = fakeServer();
    await render(<ServerPalette server={server} />);
    await settled();
    await userEvent.type(input(), "ab");
    await server.answer("ab", ["Abba cake"]);
    await expect.poll(options).toEqual(["Abba cake"]);
    await server.answer("a", ["Apple pie", "Avocado toast"]);
    expect(options()).toEqual(["Abba cake"]);
  });

  it("says it is searching politely, once while typing goes on, and shows the empty state only after loading", async () => {
    const server = fakeServer();
    await render(<ServerPalette server={server} />);
    await settled();
    expect(status().getAttribute("aria-live")).toBe("polite");
    // The opening's search for "" is the one announcement.
    await expect.poll(() => status().textContent).toBe("Searching…");
    await server.answer("", ["Shakshuka", "Salad"]);
    await expect.poll(() => status().textContent).toBe("");
    const changes: string[] = [];
    const observer = new MutationObserver(() => changes.push(status().textContent ?? ""));
    observer.observe(status(), { childList: true, characterData: true, subtree: true });
    await userEvent.type(input(), "xyz");
    await server.answer("x", []);
    await server.answer("xy", []);
    expect(document.body.textContent).not.toContain("No results");
    await server.answer("xyz", []);
    await expect.poll(() => document.body.textContent).toContain("No results");
    observer.disconnect();
    expect(changes).toEqual([]);
    expect(status().textContent).toBe("");
  });

  it("shows the empty state at once while loading finds nothing yet, with the loading line under it, and alone once loading ends", async () => {
    const jump = (loading: boolean, labels: string[] = []) => (
      <Command
        title="Jump to a chat"
        open
        onOpenChange={() => {}}
        items={labels.map((label) => ({ label, onSelect() {} }))}
        onQueryChange={() => {}}
        loading={loading}
        emptyLabel="No chats by that name."
        loadingLabel="Searching the directory…"
      />
    );
    await render(jump(true));
    await settled();
    const empty = () => document.querySelector<HTMLElement>("[data-ouro-command-empty]");
    // The text without the word joiner Base UI adds so that its live region speaks the empty state.
    const text = (element: Element | null | undefined) => element?.textContent?.replace(/\u2060/g, "");
    expect(text(empty())).toBe("No chats by that name.Searching the directory…");
    expect(document.querySelector("[data-ouro-command-loading]")).toBeNull();
    // Nothing matches yet, so no result-shaped rows sit under the empty state.
    expect(document.querySelector("[data-ouro-command-loading-rows]")).toBeNull();
    await act(async () => roots[0]!.render(jump(false)));
    expect(text(empty())).toBe("No chats by that name.");
    await act(async () => roots[0]!.render(jump(true, ["Noor Haddad"])));
    expect(empty()).toBeNull();
    expect(document.querySelector("[data-ouro-command-loading]")?.textContent).toBe("Searching the directory…");
  });

  it("holds the place of results on their way with rows a result's height, gone once loading ends", async () => {
    const jump = (loading: boolean) => (
      <Command title="Jump to a chat" open onOpenChange={() => {}} items={[{ label: "Noor Haddad", onSelect() {} }]} onQueryChange={() => {}} loading={loading} />
    );
    await render(jump(true));
    await settled();
    const block = document.querySelector<HTMLElement>("[data-ouro-command-loading-rows]")!;
    expect(block.getAttribute("aria-hidden")).toBe("true");
    const rows = [...block.children] as HTMLElement[];
    expect(rows).toHaveLength(3);
    const item = document.querySelector<HTMLElement>('[data-ouro-part="item"]')!;
    for (const row of rows) {
      expect(row.getBoundingClientRect().height).toBe(item.getBoundingClientRect().height);
      expect(row.querySelectorAll('[data-ouro="skeleton"]')).toHaveLength(2);
    }
    // Their lines differ in width, as results' labels do.
    const widths = rows.map((row) => row.querySelector<HTMLElement>('[data-shape="text"]')!.getBoundingClientRect().width / row.getBoundingClientRect().width);
    expect(new Set(widths.map((w) => w.toFixed(2))).size).toBe(3);
    for (const w of widths) expect(w).toBeLessThan(0.8);
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(1);
    await act(async () => roots[0]!.render(jump(false)));
    expect(document.querySelector("[data-ouro-command-loading-rows]")).toBeNull();
  });

  it("keeps the highlighted result where it is, and highlighted, as the loading rows go", async () => {
    const jump = (loading: boolean) => (
      <Command
        title="Jump to a chat"
        open
        onOpenChange={() => {}}
        items={[{ label: "Noor Haddad", onSelect() {} }, { label: "Ana Lind", onSelect() {} }]}
        onQueryChange={() => {}}
        loading={loading}
      />
    );
    await render(jump(true));
    await settled();
    const highlighted = () => document.querySelector<HTMLElement>("[data-highlighted]");
    // The arrow key reaches the list only once the search input has focus and the first result is highlighted.
    await expect.poll(() => document.activeElement?.getAttribute("role")).toBe("combobox");
    await expect.poll(() => highlighted()?.textContent).toBe("Noor Haddad");
    await userEvent.keyboard("{ArrowDown}");
    await expect.poll(() => highlighted()?.textContent).toBe("Ana Lind");
    const top = highlighted()!.getBoundingClientRect().top;
    await act(async () => roots[0]!.render(jump(false)));
    expect(document.querySelector("[data-ouro-command-loading-rows]")).toBeNull();
    expect(highlighted()?.textContent).toBe("Ana Lind");
    expect(highlighted()!.getBoundingClientRect().top).toBe(top);
  });

  it("takes content for its empty state, such as a picture with words, with the loading line under it while loading", async () => {
    const empty = (
      <figure data-testid="nothing" style={{ margin: 0 }}>
        <svg aria-hidden="true" width="48" height="48" />
        <figcaption>Nothing matches that.</figcaption>
      </figure>
    );
    const jump = (loading: boolean) => <Command title="Jump to a chat" open onOpenChange={() => {}} items={[]} onQueryChange={() => {}} loading={loading} empty={empty} emptyLabel="Unused" loadingLabel="Searching the directory…" />;
    await render(jump(true));
    await settled();
    const region = document.querySelector<HTMLElement>("[data-ouro-command-empty]")!;
    expect(region.querySelector('[data-testid="nothing"]')).not.toBeNull();
    expect(region.textContent!.replace(/\u2060/g, "")).toBe("Nothing matches that.Searching the directory…");
    await act(async () => roots[0]!.render(jump(false)));
    expect(document.querySelector("[data-ouro-command-empty]")!.textContent!.replace(/\u2060/g, "")).toBe("Nothing matches that.");
  });

  it("takes a translated loading label, and aborts the last search when the palette closes", async () => {
    const signals: AbortSignal[] = [];
    await render(
      <Command title="Recherche" open onOpenChange={() => {}} loading loadingLabel="Recherche…" items={[]} onQueryChange={(_query, { signal }) => signals.push(signal)} />,
    );
    await settled();
    await expect.poll(() => status().textContent).toBe("Recherche…");
    await userEvent.type(input(), "a");
    await act(async () => roots.splice(0).forEach((root) => root.unmount()));
    expect(signals.at(-1)!.aborted).toBe(true);
  });

  it("announces loading again after the palette closes and opens", async () => {
    const palette = (open: boolean) => <Command title="Recipe search" open={open} onOpenChange={() => {}} loading items={[]} onQueryChange={() => {}} />;
    await render(palette(true));
    await settled();
    await expect.poll(() => status().textContent).toBe("Searching…");
    await act(async () => roots[0]!.render(palette(false)));
    await expect.poll(popup).toBeNull();
    await act(async () => roots[0]!.render(palette(true)));
    await settled();
    await expect.poll(() => status().textContent).toBe("Searching…");
  });

  const loadingShown = () => document.querySelector("[data-ouro-command-loading]") !== null;

  it("asks again for the empty query when reopened after closing mid-search, leaving no stale results or loading", async () => {
    const server = fakeServer();
    await render(<ServerPalette server={server} />);
    await settled();
    await server.answer("", ["Shakshuka", "Salad"]);
    await userEvent.type(input(), "pa");
    await server.answer("pa", ["Pasta", "Paella"]);
    await expect.poll(options).toEqual(["Pasta", "Paella"]);
    await userEvent.type(input(), "x");
    expect(loadingShown()).toBe(true);
    await userEvent.keyboard("{Escape}");
    await expect.poll(popup).toBeNull();
    await userEvent.click(page.getByTestId("reopen"));
    await settled();
    expect((input().element() as HTMLInputElement).value).toBe("");
    expect(server.asked.at(-1)).toBe("");
    await server.answer("", ["Shakshuka", "Salad"]);
    await expect.poll(options).toEqual(["Shakshuka", "Salad"]);
    expect(loadingShown()).toBe(false);
    // The answer to "pax", from before the close, never lands.
    await server.answer("pax", ["Paxlava"]);
    expect(options()).toEqual(["Shakshuka", "Salad"]);
  });

  it("asks for the empty query when reopened before the close animation ends", async () => {
    const server = fakeServer();
    await render(<ServerPalette server={server} />);
    await settled();
    await server.answer("", ["Shakshuka", "Salad"]);
    await userEvent.type(input(), "pa");
    await server.answer("pa", ["Pasta", "Paella"]);
    await expect.poll(options).toEqual(["Pasta", "Paella"]);
    await userEvent.type(input(), "x");
    // A slow fade-out, so the palette is still closing when it reopens, whatever the
    // app's stylesheet or the runner's speed (an installed app may have no transition).
    const slow = Object.assign(document.createElement("style"), {
      textContent: "[data-ouro-presentation] { transition: opacity 3s linear !important } [data-ouro-presentation][data-ending-style] { opacity: 0 !important }",
    });
    document.head.append(slow);
    mounted.push(slow);
    await userEvent.keyboard("{Escape}");
    // Reopen at once, while the palette is still fading out.
    // A real click would wait for the backdrop to go, so the button is clicked directly, as ⌘K would toggle it.
    expect(popup()?.hasAttribute("data-ending-style")).toBe(true);
    const fading = popup();
    await act(async () => (page.getByTestId("reopen").element() as HTMLElement).click());
    // The same palette comes back: it was never unmounted.
    expect(popup()).toBe(fading);
    await expect.poll(() => popup()?.hasAttribute("data-ending-style")).toBe(false);
    expect((input().element() as HTMLInputElement).value).toBe("");
    await expect.poll(() => server.asked.at(-1)).toBe("");
    await server.answer("", ["Shakshuka", "Salad"]);
    await expect.poll(options).toEqual(["Shakshuka", "Salad"]);
    expect(loadingShown()).toBe(false);
    await server.answer("pax", ["Paxlava"]);
    expect(options()).toEqual(["Shakshuka", "Salad"]);
  });

  it("clears loading when a search fails, and then shows the empty state if nothing matches", async () => {
    const server = fakeServer();
    await render(<ServerPalette server={server} />);
    await settled();
    await userEvent.type(input(), "q");
    expect(loadingShown()).toBe(true);
    await server.fail("q");
    await expect.poll(loadingShown).toBe(false);
    expect(options()).toEqual(["Shakshuka", "Salad"]);
  });

  it("asks again for the current query when the palette switches between dialog and sheet across 640px", async () => {
    const server = fakeServer();
    await render(<ServerPalette server={server} />);
    await settled();
    await userEvent.type(input(), "pa");
    await server.answer("pa", ["Pasta"]);
    await expect.poll(options).toEqual(["Pasta"]);
    const asked = server.asked.length;
    await page.viewport(390, 844);
    await expect.poll(() => popup()?.getAttribute("data-ouro-presentation")).toBe("sheet");
    // The sheet keeps the search text and asks for its results again.
    await expect.poll(() => server.asked.length).toBeGreaterThan(asked);
    expect(server.asked.at(-1)).toBe("pa");
    expect((input().element() as HTMLInputElement).value).toBe("pa");
    await server.answer("pa", ["Pasta", "Paella"]);
    await expect.poll(options).toEqual(["Pasta", "Paella"]);
    expect(loadingShown()).toBe(false);
  });

  it("keeps the phone sheet's search input still while server results change", async () => {
    await page.viewport(390, 844);
    const server = fakeServer();
    await render(<ServerPalette server={server} />);
    await settled();
    const top = (input().element() as HTMLElement).getBoundingClientRect().top;
    await userEvent.type(input(), "p");
    await server.answer("p", Array.from({ length: 30 }, (_, index) => `Pasta ${index + 1}`));
    await expect.poll(() => options().length).toBe(30);
    expect((input().element() as HTMLElement).getBoundingClientRect().top).toBe(top);
    await userEvent.type(input(), "q");
    await server.answer("pq", []);
    await expect.poll(() => options().length).toBe(0);
    expect((input().element() as HTMLElement).getBoundingClientRect().top).toBe(top);
  });
});

describe("Command media", () => {
  const picture = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";

  it("shows labelContent in place of the label, while the search and the row's name still use the label", async () => {
    const onSelect = vi.fn();
    await openPalette({
      items: [
        { label: "Release crew 🎉", labelContent: <>Release crew <img alt="" data-testid="party" src={picture} width={16} height={16} /></>, onSelect },
        { label: "Sign out", onSelect: () => {} },
      ],
    } as object);
    const crew = page.getByRole("option", { name: "Release crew 🎉", exact: true }).element() as HTMLElement;
    const shown = label(crew).querySelector<HTMLElement>('[aria-hidden="true"]')!;
    expect(shown.textContent).toBe("Release crew ");
    expect(shown.querySelector('[data-testid="party"]')).not.toBeNull();
    expect(label(crew).querySelector(".sr-only")!.textContent).toBe("Release crew 🎉");
    // A row without it shows its label as before.
    const signOut = label(page.getByRole("option", { name: "Sign out", exact: true }).element() as HTMLElement);
    expect(signOut.textContent).toBe("Sign out");
    expect(signOut.querySelector('[aria-hidden="true"], .sr-only')).toBeNull();
    await userEvent.type(input(), "crew");
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(1);
    await userEvent.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
  const gear = <svg data-testid="gear" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="currentColor" /></svg>;
  const row = (name: string) => page.getByRole("option", { name: new RegExp(`^${name}`) }).element() as HTMLElement;
  const label = (option: HTMLElement) => option.querySelector<HTMLElement>("[data-ouro-command-label]")!;
  const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  it("shows an avatar from a picture or an element, and a muted icon, before the label", async () => {
    await openPalette({
      items: [
        { label: "Grace Hopper", onSelect: () => {}, avatar: picture },
        { label: "Ana Lind", onSelect: () => {}, avatar: <Avatar name="Ana Lind" alt="" size="xs" initials="A" idForColor="person-2" /> },
        { label: "Settings", onSelect: () => {}, icon: gear },
        { label: "Sign out", onSelect: () => {} },
      ],
    } as object);
    const [grace, ana, settings, signOut] = ["Grace Hopper", "Ana Lind", "Settings", "Sign out"].map(row);
    const picked = grace!.querySelector<HTMLElement>('[data-ouro-command-avatar] [data-ouro="avatar"]')!;
    expect(picked.getAttribute("aria-hidden")).toBe("true");
    expect(picked.getBoundingClientRect().width).toBe(24);
    expect(before(picked, label(grace!))).toBe(true);
    // The app's own element, as it is, not a picture's URL.
    expect(ana!.querySelector("[data-ouro-command-avatar]")!.querySelector("[data-ouro-avatar-initials]")!.getAttribute("data-ouro-avatar-initials")).toBe("A");
    const icon = settings!.querySelector<HTMLElement>("[data-ouro-command-icon]")!;
    expect(icon.getAttribute("aria-hidden")).toBe("true");
    expect(icon.querySelector("svg")!.getBoundingClientRect().width).toBe(16);
    expect(before(icon, label(settings!))).toBe(true);
    expect(getComputedStyle(icon).color).not.toBe(getComputedStyle(label(settings!)).color);
    // The icon takes the avatar's width, so the labels line up.
    expect(label(settings!).getBoundingClientRect().left).toBe(label(grace!).getBoundingClientRect().left);
    expect(signOut!.querySelector("[data-ouro-command-avatar], [data-ouro-command-icon]")).toBeNull();
    // An avatar keeps the row the height of the others.
    expect(grace!.getBoundingClientRect().height).toBe(signOut!.getBoundingClientRect().height);
    expect(options()).toEqual(["Grace Hopper", "Ana Lind", "Settings", "Sign out"]);
  });

  it("marks an unread command with a bold label, a dot and a spoken label", async () => {
    await openPalette({
      unreadLabel: "Non lu",
      items: [
        { label: "Grace Hopper", onSelect: () => {}, unread: true },
        { label: "Ana Lind", onSelect: () => {} },
      ],
    } as object);
    const [grace, ana] = ["Grace Hopper", "Ana Lind"].map(row);
    expect(Number(getComputedStyle(label(grace!)).fontWeight)).toBeGreaterThanOrEqual(600);
    expect(Number(getComputedStyle(label(ana!)).fontWeight)).toBe(400);
    const unread = grace!.querySelector<HTMLElement>("[data-ouro-command-unread]")!;
    expect(unread.textContent).toBe("Non lu");
    expect(unread.querySelector('[aria-hidden="true"]')!.getBoundingClientRect().width).toBe(8);
    expect(before(label(grace!), unread)).toBe(true);
    expect(ana!.querySelector("[data-ouro-command-unread]")).toBeNull();
    await expect.element(page.getByRole("option", { name: /Grace Hopper.*Non lu/ })).toBeVisible();
  });

  it("ends the row with a mark in the unread dot's place, before the shortcut", async () => {
    await openPalette({
      items: [
        { label: "Launch team", onSelect: () => {}, unread: true, mark: <Badge>3</Badge>, shortcut: ["mod", "1"] },
        { label: "Weekly notes", onSelect: () => {}, mark: "Draft" },
        { label: "Kai Sample", onSelect: () => {}, mark: false, icon: null },
        { label: "Jo Park", onSelect: () => {} },
      ],
    } as object);
    const [team, notes, kai, jo] = ["Launch team", "Weekly notes", "Kai Sample", "Jo Park"].map(row);
    for (const quiet of [kai!, jo!]) expect(quiet.querySelector("[data-ouro-command-mark], [data-ouro-command-icon], [data-ouro-command-unread]")).toBeNull();
    const mark = team!.querySelector<HTMLElement>("[data-ouro-command-mark]")!;
    expect(mark.querySelector('[data-ouro="badge"]')!.textContent).toBe("3");
    const unread = team!.querySelector<HTMLElement>("[data-ouro-command-unread]")!;
    expect(unread.textContent).toBe("Unread");
    expect(unread.querySelector('[aria-hidden="true"]')).toBeNull();
    expect(unread.getBoundingClientRect().width).toBeLessThanOrEqual(1);
    expect(before(label(team!), mark)).toBe(true);
    expect(before(mark, team!.querySelector('[data-ouro="kbd"]')!)).toBe(true);
    const words = notes!.querySelector<HTMLElement>("[data-ouro-command-mark]")!;
    expect(words.textContent).toBe("Draft");
    expect(parseFloat(getComputedStyle(words).fontSize)).toBeLessThan(parseFloat(getComputedStyle(label(notes!)).fontSize));
    expect(notes!.querySelector("[data-ouro-command-unread]")).toBeNull();
  });

  it("still searches only the labels and keywords", async () => {
    await openPalette({
      items: [
        { label: "Grace Hopper", onSelect: () => {}, avatar: picture, mark: "Draft" },
        { label: "Ana Lind", onSelect: () => {}, icon: gear, keywords: ["engine"] },
      ],
    } as object);
    await userEvent.type(input(), "draft");
    await expect.poll(options).toEqual([]);
    await userEvent.clear(input());
    await userEvent.type(input(), "engine");
    await expect.poll(options).toEqual(["Ana Lind"]);
  });
});

describe("Command closing", () => {
  it("starts empty, with every command, when opened again", async () => {
    await openPalette();
    await userEvent.type(input(), "swi");
    await userEvent.keyboard("{Escape}");
    await expect.poll(popup).toBeNull();
    await userEvent.click(trigger());
    await settled();
    expect((input().element() as HTMLInputElement).value).toBe("");
    expect(options()).toEqual(["New recipe", "Import from a link", "Switch theme", "Sign out"]);
  });
});

describe("Command duplicate labels", () => {
  it("renders two commands with the same label in one group without a key warning", async () => {
    const error = vi.spyOn(console, "error");
    const first = vi.fn();
    const second = vi.fn();
    await openPalette({ items: [{ label: "Recipes", items: [{ label: "Export", onSelect: first }, { label: "Export", onSelect: second }] }] } as object);
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(2);
    expect(error.mock.calls.map((call) => String(call[0])).filter((text) => text.includes("same key"))).toEqual([]);
    await userEvent.click(page.getByRole("option").nth(1));
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
  });
});

describe("Command shortcuts' platform", () => {
  it.each([
    ["macOS", "Meta"],
    ["Windows", "Control"],
    ["Linux", "Control"],
  ] as const)("names a command's mod as %s's own modifier, and no other", async (platform, modifier) => {
    onPlatform(platform);
    await openPalette();
    expect(page.getByRole("option", { name: /^New recipe/ }).element().getAttribute("aria-keyshortcuts")).toBe(`${modifier}+N`);
  });
});

describe("Command server rendering", () => {
  it("renders only the trigger on the server", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = renderToString(<Command title="Command palette" trigger={<Button>Search</Button>} items={entries()} />);
    expect(html).toContain(">Search<");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).not.toContain("data-ouro-presentation");
    expect(error).not.toHaveBeenCalled();
  });

  it("renders a trigger that a Server Component passed as a lazy wrapper", () => {
    // What React's Flight client hands a client component for an element prop
    // (https://github.com/facebook/react/issues/32392): no `type` and no `props`.
    const fromServer = { $$typeof: Symbol.for("react.lazy"), _payload: <Button>Search</Button>, _init: (payload: unknown) => payload } as unknown as ReactElement;
    const html = renderToString(<Command title="Command palette" trigger={fromServer} items={entries()} />);
    expect(html).toContain(">Search<");
    expect(html).toContain('aria-haspopup="dialog"');
  });
});

describe("Command dev messages", () => {
  it("throws the exact fix when neither trigger nor open is passed", () => {
    // @ts-expect-error -- neither trigger nor open
    const element = <Command title="Command palette" items={entries()} />;
    expect(() => renderToString(element)).toThrow(`[ouro-ui] Command: needs trigger or open with onOpenChange. Fix: ${FIX}`);
  });

  it("throws the exact fix when items is missing", () => {
    // @ts-expect-error -- no items
    const element = <Command title="Command palette" trigger={<Button>Search</Button>} />;
    expect(() => renderToString(element)).toThrow(
      '[ouro-ui] Command: needs items. Fix: <Command items={[{ label: "New recipe", onSelect: create }]}>.',
    );
  });

  it.each([[""], [undefined]])("warns when the title is missing (%j)", async (title) => {
    await openPalette({ title } as object);
    expect(warnings()).toEqual(['[ouro-ui] Command: title is required; it names the palette for screen readers. Fix: <Command title="Command palette">.']);
  });

  it("warns once about guessed props, and about an item's onClick or forceMount", async () => {
    await openPalette({
      isOpen: true,
      onClose: () => {},
      children: "x",
      commands: [],
      items: [{ label: "Home", onClick: () => {} }, { label: "Jump to chat", onSelect: () => {}, forceMount: true }],
    } as object);
    expect(warnings()).toEqual([
      "[ouro-ui] Command: isOpen is not a prop. Fix: <Command open={open} onOpenChange={setOpen}>.",
      "[ouro-ui] Command: onClose is not a prop. Fix: <Command open={open} onOpenChange={setOpen}>.",
      '[ouro-ui] Command: children is not a prop; the commands are items. Fix: <Command items={[{ label: "New recipe", onSelect: create }]}>.',
      '[ouro-ui] Command: commands is not a prop; the commands are items. Fix: <Command items={[{ label: "New recipe", onSelect: create }]}>.',
      '[ouro-ui] Command: the item "Home" has onClick; a command runs onSelect. Fix: { label: "Home", onSelect: run }.',
      '[ouro-ui] Command: the item "Jump to chat" has forceMount; a row shown whatever the search is says alwaysShown. Fix: { label: "Jump to chat", onSelect: run, alwaysShown: true }.',
    ]);
  });

  it("names the fix once for a group with forceMount, which says alwaysShown", async () => {
    await openPalette({
      items: [{ label: "Go to", forceMount: true, items: [{ label: "Jump to chat", onSelect: () => {} }] }],
    } as object);
    expect(warnings()).toEqual([
      '[ouro-ui] Command: the group "Go to" has forceMount; a group shown whatever the search is says alwaysShown. Fix: { label: "Go to", items, alwaysShown: true }.',
    ]);
  });

  it("names the fix once for an item with both avatar and icon, and shows the avatar", async () => {
    await openPalette({
      items: [
        { label: "Grace Hopper", onSelect: () => {}, avatar: "data:image/gif;base64,R0lGODlhAQABAAAAACw=", icon: <svg viewBox="0 0 16 16" /> },
        { label: "Ana Lind", onSelect: () => {}, avatar: "data:image/gif;base64,R0lGODlhAQABAAAAACw=" },
        { label: "Settings", onSelect: () => {}, icon: <svg viewBox="0 0 16 16" /> },
        { label: "Sign out", onSelect: () => {} },
      ],
    } as object);
    expect(warnings()).toEqual([
      '[ouro-ui] Command: the item "Grace Hopper" has both avatar and icon, and shows only the avatar; pass one. Fix: { label: "Grace Hopper", avatar: picture }.',
    ]);
    const grace = page.getByRole("option", { name: /^Grace Hopper/ }).element();
    expect(grace.querySelector("[data-ouro-command-avatar]")).not.toBeNull();
    expect(grace.querySelector("[data-ouro-command-icon]")).toBeNull();
  });

  it("warns about an appearance class", async () => {
    const element = await openPalette({ className: "mt-8 bg-white" });
    expect(element.classList.contains("mt-8")).toBe(true);
    expect(warnings()).toEqual(['[ouro-ui] Command: "bg-white" sets appearance, and className is for layout only. Fix: :root { --popover: …; } .dark { --popover: …; }.']);
  });
});

describe("Command's trigger and a page scroll at the press", () => {
  // A smooth scroll begins as the press goes down, ahead of the trigger's own handlers: the press
  // stops it where it is, the release (or the key) clicks the trigger, and the dialog opens there.
  const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  afterEach(() => {
    document.documentElement.removeAttribute("style");
    window.scrollTo({ top: 0, behavior: "instant" });
  });

  for (const input of ["pointer", "Enter"] as const) {
    it(`stops a smooth scroll where ${input === "pointer" ? "a press" : "Enter"} on its trigger found it, and opens`, async () => {
      const pointerDown = vi.fn();
      const keyDown = vi.fn();
      await render(
        <div style={{ height: 5000 }}>
          <header style={{ position: "sticky", top: 0, height: 100 }}>
            <Command title="Command palette" trigger={<button type="button" data-opener="" onPointerDown={pointerDown} onKeyDown={keyDown}>
              Search
            </button>} items={entries()} />
          </header>
        </div>,
      );
      window.scrollTo({ top: 2000, behavior: "instant" });
      document.documentElement.style.scrollBehavior = "smooth";
      document.addEventListener(input === "pointer" ? "pointerdown" : "keydown", () => window.scrollTo({ top: 4000 }), { capture: true, once: true });
      const opener = document.querySelector<HTMLElement>('[data-opener]')!;
      if (input === "pointer") {
        await commands.pointerPress({ selector: '[data-opener]', action: "down" });
        for (let index = 0; index < 10; index++) await frame();
        await commands.pointerPress({ action: "up" });
      } else {
        opener.focus({ preventScroll: true });
        await userEvent.keyboard("{Enter}");
      }
      await expect.poll(() => opener.getAttribute("aria-expanded") === "true").toBe(true);
      await frame();
      await frame();
      expect(window.scrollY).toBe(2000);
      expect((input === "pointer" ? pointerDown : keyDown).mock.calls.length).toBe(1);
    });
  }
});

describe("Command's Button trigger and the keyboard", () => {
  it("opens at Enter on a Button trigger that has no key handler of its own", async () => {
    await render(<Command title="Command palette" trigger={<Button>Search</Button>} items={entries()} />);
    const errors: string[] = [];
    const onError = (event: ErrorEvent) => {
      errors.push(event.message);
      event.preventDefault();
    };
    window.addEventListener("error", onError);
    document.querySelector<HTMLElement>('[data-ouro="button"]')!.focus();
    await userEvent.keyboard("{Enter}");
    await expect.poll(() => document.querySelector('[data-ouro="button"]')!.getAttribute("aria-expanded")).toBe("true");
    window.removeEventListener("error", onError);
    expect(errors).toEqual([]);
  });
});

