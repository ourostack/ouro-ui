import axe from "axe-core";
import { useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Command, type CommandEntry, type CommandProps } from "@/registry/ouro/components/ouro/command/command";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { useCommandShortcut } from "@/registry/ouro/lib/ouro/use-command-shortcut";
import { axeExclude } from "@/registry/ouro/lib/ouro/testing/axe";

// Runs in Chromium and WebKit.

const FIX = "Pass trigger={<Button>…</Button>} for an uncontrolled command palette, or open and onOpenChange to control it.";

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.padding = "40px";
  document.body.append(host);
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

  it("runs the highlighted command on Enter, closes, and returns focus to the trigger", async () => {
    await openPalette();
    await userEvent.type(input(), "import");
    await userEvent.keyboard("{Enter}");
    expect(actions.import).toHaveBeenCalledOnce();
    await expect.poll(popup).toBeNull();
    await expect.poll(() => document.activeElement).toBe(trigger());
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

  it("has no axe violations open, in light and dark", async () => {
    await openPalette();
    for (const scheme of ["light", "dark"]) {
      document.documentElement.classList.toggle("dark", scheme === "dark");
      const result = await axe.run(
        { include: [document.documentElement], exclude: axeExclude.map((selector) => [selector]) },
        { resultTypes: ["violations"], rules: { region: { enabled: false }, "landmark-one-main": { enabled: false }, "page-has-heading-one": { enabled: false } } },
      );
      expect(result.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target).join(", ")}`)).toEqual([]);
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

describe("Command server rendering", () => {
  it("renders only the trigger on the server", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = renderToString(<Command title="Command palette" trigger={<Button>Search</Button>} items={entries()} />);
    expect(html).toContain(">Search<");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).not.toContain("data-ouro-presentation");
    expect(error).not.toHaveBeenCalled();
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

  it("warns about an appearance class", async () => {
    const element = await openPalette({ className: "mt-8 bg-white" });
    expect(element.classList.contains("mt-8")).toBe(true);
    expect(warnings()).toEqual(['[ouro-ui] Command: "bg-white" sets appearance, and className is for layout only. Fix: :root { --popover: …; } .dark { --popover: …; }.']);
  });
});
