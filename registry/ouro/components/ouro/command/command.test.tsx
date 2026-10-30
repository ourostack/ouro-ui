import { useState, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { Avatar } from "@/registry/ouro/components/ouro/avatar/avatar";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Command, type CommandEntry, type CommandProps } from "@/registry/ouro/components/ouro/command/command";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { useCommandShortcut } from "@/registry/ouro/lib/ouro/use-command-shortcut";
import { audit, axeExclude, describeFindings } from "@/registry/ouro/lib/ouro/testing/axe";

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
  await commands.emulateMedia({ reducedMotion: "no-preference" });
});

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

describe("Command motion", () => {
  it("opens and closes without animating, its backdrop included, because a shortcut opens it", async () => {
    const element = await openPalette();
    const backdrop = document.querySelector<HTMLElement>('[data-ouro="dialog-backdrop"]')!;
    for (const surface of [element, backdrop]) {
      expect(getComputedStyle(surface).transitionProperty).toBe("none");
    }
    for (const surface of [element, backdrop]) surface.setAttribute("data-ending-style", "");
    for (const surface of [element, backdrop]) expect(getComputedStyle(surface).transitionProperty).toBe("none");
  });
});

describe("Command", () => {
  beforeEach(() => Object.values(actions).forEach((action) => action.mockClear()));

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

  it("shows the empty state when nothing matches", async () => {
    await openPalette({ emptyLabel: "Nothing found" });
    await userEvent.type(input(), "zzz");
    await expect.poll(options).toEqual([]);
    await expect.element(page.getByText("Nothing found")).toBeVisible();
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
  it("is a full-height bottom sheet below 640px, whose search input stays put while results filter", async () => {
    await page.viewport(390, 844);
    const element = await openPalette();
    expect(element.getAttribute("data-ouro-presentation")).toBe("sheet");
    await expect.element(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
    expect(Math.round(element.getBoundingClientRect().bottom)).toBe(innerHeight);
    const top = input().element().getBoundingClientRect().top;
    const height = element.getBoundingClientRect().height;
    await userEvent.type(input(), "import");
    await expect.poll(options).toEqual(["Import from a link"]);
    expect(input().element().getBoundingClientRect().top).toBe(top);
    await userEvent.type(input(), "zzz");
    await expect.poll(options).toEqual([]);
    expect(input().element().getBoundingClientRect().top).toBe(top);
    expect(element.getBoundingClientRect().height).toBe(height);
    await userEvent.keyboard("{Escape}");
    await expect.poll(popup).toBeNull();
    await expect.poll(() => document.activeElement).toBe(trigger());
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
  const gear = <svg data-testid="gear" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="currentColor" /></svg>;
  const row = (name: string) => page.getByRole("option", { name: new RegExp(`^${name}`) }).element() as HTMLElement;
  const label = (option: HTMLElement) => option.querySelector<HTMLElement>("[data-ouro-command-label]")!;
  const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  it("shows an avatar from a picture or an element, and a muted icon, before the label", async () => {
    await openPalette({
      items: [
        { label: "Grace Hopper", onSelect: () => {}, avatar: picture },
        { label: "Ada Lovelace", onSelect: () => {}, avatar: <Avatar name="Ada Lovelace" alt="" size="xs" idForColor="person-2" /> },
        { label: "Settings", onSelect: () => {}, icon: gear },
        { label: "Sign out", onSelect: () => {} },
      ],
    } as object);
    const [grace, ada, settings, signOut] = ["Grace Hopper", "Ada Lovelace", "Settings", "Sign out"].map(row);
    const picked = grace!.querySelector<HTMLElement>('[data-ouro-command-avatar] [data-ouro="avatar"]')!;
    expect(picked.getAttribute("aria-hidden")).toBe("true");
    expect(picked.getBoundingClientRect().width).toBe(24);
    expect(before(picked, label(grace!))).toBe(true);
    expect(ada!.querySelector("[data-ouro-command-avatar]")!.textContent).toBe("AL");
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
    expect(options()).toEqual(["Grace Hopper", "Ada Lovelace", "Settings", "Sign out"]);
  });

  it("marks an unread command with a bold label, a dot and a spoken label", async () => {
    await openPalette({
      unreadLabel: "Non lu",
      items: [
        { label: "Grace Hopper", onSelect: () => {}, unread: true },
        { label: "Ada Lovelace", onSelect: () => {} },
      ],
    } as object);
    const [grace, ada] = ["Grace Hopper", "Ada Lovelace"].map(row);
    expect(Number(getComputedStyle(label(grace!)).fontWeight)).toBeGreaterThanOrEqual(600);
    expect(Number(getComputedStyle(label(ada!)).fontWeight)).toBe(400);
    const unread = grace!.querySelector<HTMLElement>("[data-ouro-command-unread]")!;
    expect(unread.textContent).toBe("Non lu");
    expect(unread.querySelector('[aria-hidden="true"]')!.getBoundingClientRect().width).toBe(8);
    expect(before(label(grace!), unread)).toBe(true);
    expect(ada!.querySelector("[data-ouro-command-unread]")).toBeNull();
    await expect.element(page.getByRole("option", { name: /Grace Hopper.*Non lu/ })).toBeVisible();
  });

  it("ends the row with a mark in the unread dot's place, before the shortcut", async () => {
    await openPalette({
      items: [
        { label: "Launch team", onSelect: () => {}, unread: true, mark: <Badge>3</Badge>, shortcut: ["mod", "1"] },
        { label: "Weekly notes", onSelect: () => {}, mark: "Draft" },
        { label: "Kai Sample", onSelect: () => {}, mark: false, icon: null },
        { label: "Sam Example", onSelect: () => {} },
      ],
    } as object);
    const [team, notes, kai, sam] = ["Launch team", "Weekly notes", "Kai Sample", "Sam Example"].map(row);
    for (const quiet of [kai!, sam!]) expect(quiet.querySelector("[data-ouro-command-mark], [data-ouro-command-icon], [data-ouro-command-unread]")).toBeNull();
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
        { label: "Ada Lovelace", onSelect: () => {}, icon: gear, keywords: ["engine"] },
      ],
    } as object);
    await userEvent.type(input(), "draft");
    await expect.poll(options).toEqual([]);
    await userEvent.clear(input());
    await userEvent.type(input(), "engine");
    await expect.poll(options).toEqual(["Ada Lovelace"]);
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

  it("warns once about guessed props, and about an item's onClick", async () => {
    await openPalette({
      isOpen: true,
      onClose: () => {},
      children: "x",
      commands: [],
      items: [{ label: "Home", onClick: () => {} }],
    } as object);
    expect(warnings()).toEqual([
      "[ouro-ui] Command: isOpen is not a prop. Fix: <Command open={open} onOpenChange={setOpen}>.",
      "[ouro-ui] Command: onClose is not a prop. Fix: <Command open={open} onOpenChange={setOpen}>.",
      '[ouro-ui] Command: children is not a prop; the commands are items. Fix: <Command items={[{ label: "New recipe", onSelect: create }]}>.',
      '[ouro-ui] Command: commands is not a prop; the commands are items. Fix: <Command items={[{ label: "New recipe", onSelect: create }]}>.',
      '[ouro-ui] Command: the item "Home" has onClick; a command runs onSelect. Fix: { label: "Home", onSelect: run }.',
    ]);
  });

  it("names the fix once for an item with both avatar and icon, and shows the avatar", async () => {
    await openPalette({
      items: [{ label: "Grace Hopper", onSelect: () => {}, avatar: "data:image/gif;base64,R0lGODlhAQABAAAAACw=", icon: <svg viewBox="0 0 16 16" /> }],
    } as object);
    expect(warnings()).toEqual([
      '[ouro-ui] Command: the item "Grace Hopper" has both avatar and icon, and shows only the avatar; pass one. Fix: { label: "Grace Hopper", avatar: picture }.',
    ]);
    expect(document.querySelector("[data-ouro-command-avatar]")).not.toBeNull();
    expect(document.querySelector("[data-ouro-command-icon]")).toBeNull();
  });

  it("warns about an appearance class", async () => {
    const element = await openPalette({ className: "mt-8 bg-white" });
    expect(element.classList.contains("mt-8")).toBe(true);
    expect(warnings()).toEqual(['[ouro-ui] Command: "bg-white" sets appearance, and className is for layout only. Fix: :root { --popover: …; } .dark { --popover: …; }.']);
  });
});
