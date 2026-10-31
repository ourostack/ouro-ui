import { createRef, useState, type ReactNode, type SVGProps } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Toolbar, type ToolbarEntry, type ToolbarProps } from "@/registry/ouro/components/ouro/toolbar/toolbar";
import { fitCount, splitEntries } from "@/registry/ouro/components/ouro/toolbar/toolbar-styles";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { pressTab } from "@/registry/ouro/lib/ouro/testing/tab";

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode, width?: number) {
  const host = document.createElement("div");
  host.style.padding = "24px";
  if (width !== undefined) host.style.width = `${width}px`;
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return {
    host,
    rerender: (next: ReactNode) => act(async () => root.render(next)),
    get toolbar() {
      return host.querySelector<HTMLElement>('[data-ouro="toolbar"]')!;
    },
    get buttons() {
      return [...host.querySelectorAll<HTMLButtonElement>('[data-ouro="toolbar"] button')];
    },
    get more() {
      return host.querySelector<HTMLButtonElement>('[data-ouro-part="more"]');
    },
  };
}

function Icon(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 16 16" {...props} />;
}

const tooltip = () => document.querySelector<HTMLElement>('[data-ouro="tooltip"]');

async function shownTooltip() {
  await expect
    .poll(() => {
      const element = tooltip();
      return Boolean(element && !element.hasAttribute("data-starting-style") && element.getAnimations().length === 0);
    })
    .toBe(true);
  return tooltip()!;
}

const names = (buttons: HTMLElement[]) => buttons.map((button) => button.getAttribute("aria-label") ?? button.textContent);

const formatting: ToolbarEntry[] = [
  { type: "toggle", label: "Bold", icon: Icon, hideLabel: true, shortcut: ["mod", "b"] },
  { type: "toggle", label: "Italic", icon: Icon, hideLabel: true },
  { type: "separator" },
  { label: "Insert link", icon: Icon, hideLabel: true, shortcut: ["mod", "k"] },
  { type: "separator" },
  {
    type: "group",
    label: "Lists",
    items: [
      { label: "Bulleted list", icon: Icon, hideLabel: true },
      { label: "Numbered list", icon: Icon, hideLabel: true },
    ],
  },
];

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(async () => {
  await page.viewport(1280, 800);
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await userEvent.unhover(document.body);
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
  await page.viewport(414, 896);
});

describe("Toolbar", () => {
  it("is a labeled toolbar of Ouro Toggles and Buttons, groups and separators", async () => {
    const ref = createRef<HTMLDivElement>();
    const { toolbar, buttons } = await render(<Toolbar ref={ref} label="Formatting" items={formatting} />, 900);
    const twoGroups = await render(
      <Toolbar label="Lists and quotes" items={[{ type: "group", label: "Outline", items: [{ label: "Bullets" }] }, { type: "group", label: "Quotes", items: [{ label: "Quote" }] }]} />,
      900,
    );
    expect(twoGroups.toolbar.querySelectorAll('[role="group"]')).toHaveLength(2);
    expect(ref.current).toBe(toolbar);
    expect(toolbar.getAttribute("role")).toBe("toolbar");
    expect(toolbar.getAttribute("data-size")).toBe("md");
    await expect.element(page.getByRole("toolbar", { name: "Formatting" })).toBeVisible();
    expect(names(buttons)).toEqual(["Bold", "Italic", "Insert link", "Bulleted list", "Numbered list"]);
    expect(buttons.map((button) => button.getAttribute("data-ouro"))).toEqual(["toggle", "toggle", "button", "button", "button"]);
    expect(buttons.map((button) => button.getAttribute("data-ouro-control"))).toEqual(Array(5).fill("toolbar"));
    expect(buttons.map((button) => button.getAttribute("data-ouro-part"))).toEqual(["toggle", "toggle", "button", "button", "button"]);
    expect(buttons[0]!.getAttribute("aria-pressed")).toBe("false");
    expect(buttons[2]!.hasAttribute("aria-pressed")).toBe(false);
    expect(toolbar.querySelectorAll('[role="separator"]')).toHaveLength(2);
    expect(toolbar.querySelector('[role="separator"]')!.getAttribute("aria-orientation")).toBe("vertical");
    await expect.element(page.getByRole("group", { name: "Lists" })).toBeVisible();
    expect(page.getByRole("group", { name: "Lists" }).getByRole("button").all()).toHaveLength(2);
    // Everything fits, so there is no More button.
    expect(buttons.some((button) => button.getAttribute("data-ouro-part") === "more")).toBe(false);
  });

  it("is one tab stop, and the arrow keys, Home and End move between its controls", async () => {
    const { buttons } = await render(
      <>
        <button type="button" data-test-harness="">Before</button>
        <Toolbar label="Formatting" items={formatting} />
        <button type="button" data-test-harness="">After</button>
      </>,
      900,
    );
    page.getByRole("button", { name: "Before" }).element().focus();
    await pressTab();
    expect(document.activeElement).toBe(buttons[0]);
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(buttons[1]);
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(buttons[2]);
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(buttons[3]);
    let prevented: boolean | undefined;
    const watch = (event: KeyboardEvent) => (prevented = event.defaultPrevented);
    document.addEventListener("keydown", watch);
    await userEvent.keyboard("{End}");
    document.removeEventListener("keydown", watch);
    // The page does not scroll as well.
    expect(prevented).toBe(true);
    expect(document.activeElement).toBe(buttons[4]);
    await userEvent.keyboard("{Home}");
    expect(document.activeElement).toBe(buttons[0]);
    await userEvent.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(buttons[4]);
    await pressTab();
    expect(document.activeElement).toBe(page.getByRole("button", { name: "After" }).element());
  });

  it("keeps an uncontrolled toggle's state, and reports each change", async () => {
    const onPressedChange = vi.fn();
    const { buttons } = await render(
      <Toolbar label="Formatting" items={[{ type: "toggle", label: "Bold", defaultPressed: true, onPressedChange }, { type: "toggle", label: "Italic" }]} />,
      900,
    );
    expect(buttons.map((button) => button.getAttribute("aria-pressed"))).toEqual(["true", "false"]);
    await userEvent.click(buttons[0]!);
    expect(buttons[0]!.getAttribute("aria-pressed")).toBe("false");
    expect(onPressedChange).toHaveBeenLastCalledWith(false);
    await userEvent.click(buttons[1]!);
    expect(buttons[1]!.getAttribute("aria-pressed")).toBe("true");
    await userEvent.click(buttons[0]!);
    expect(buttons[0]!.getAttribute("aria-pressed")).toBe("true");
    expect(onPressedChange).toHaveBeenLastCalledWith(true);
  });

  it("follows a controlled toggle", async () => {
    function Controlled() {
      const [bold, setBold] = useState(true);
      return (
        <>
          <Toolbar label="Formatting" items={[{ type: "toggle", label: "Bold", pressed: bold, onPressedChange: setBold }]} />
          <output>{String(bold)}</output>
        </>
      );
    }
    const { host, buttons } = await render(<Controlled />, 900);
    expect(buttons[0]!.getAttribute("aria-pressed")).toBe("true");
    await userEvent.click(buttons[0]!);
    expect(buttons[0]!.getAttribute("aria-pressed")).toBe("false");
    expect(host.querySelector("output")!.textContent).toBe("false");
  });

  it("runs a button's onClick", async () => {
    const onClick = vi.fn();
    const { buttons } = await render(<Toolbar label="Formatting" items={[{ label: "Insert link", onClick }]} />, 900);
    expect(buttons[0]!.textContent).toBe("Insert link");
    expect(buttons[0]!.hasAttribute("aria-label")).toBe(false);
    await userEvent.click(buttons[0]!);
    expect(onClick).toHaveBeenCalledTimes(1);
    buttons[0]!.focus();
    await userEvent.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("shows a visible label with its icon, and an icon-only control as a square named by its label", async () => {
    const { buttons } = await render(
      <Toolbar label="Formatting" items={[{ label: "Insert link", icon: Icon }, { label: "Quote", icon: Icon, hideLabel: true }, { type: "toggle", label: "Code", icon: Icon, hideLabel: true }]} />,
      900,
    );
    expect(buttons[0]!.textContent).toBe("Insert link");
    expect(buttons[0]!.querySelector("svg")).not.toBeNull();
    for (const button of buttons.slice(1)) {
      expect(button.textContent).toBe("");
      const box = button.getBoundingClientRect();
      expect(Math.abs(box.width - box.height)).toBeLessThan(1);
      expect(button.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
    }
    await expect.element(page.getByRole("button", { name: "Quote" })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Code", pressed: false })).toBeVisible();
  });

  it("shows an icon-only control's label and shortcut in a tooltip, and sets aria-keyshortcuts", async () => {
    const { buttons } = await render(<Toolbar label="Formatting" items={formatting} />, 900);
    expect(buttons[0]!.getAttribute("aria-keyshortcuts")).toBe("Control+B Meta+B");
    expect(buttons[1]!.hasAttribute("aria-keyshortcuts")).toBe(false);
    await userEvent.hover(buttons[0]!);
    const shown = await shownTooltip();
    expect(shown.firstElementChild!.firstChild!.textContent).toBe("Bold");
    expect(shown.querySelector('[data-ouro="kbd"]')).not.toBeNull();
    await userEvent.hover(buttons[1]!);
    await expect.poll(() => tooltip()?.textContent).toBe("Italic");
  });

  it("gives a labeled control with a shortcut a tooltip of its label and keys, and one without none", async () => {
    const { buttons } = await render(
      <Toolbar label="Document" items={[{ label: "Save", shortcut: ["mod", "s"] }, { label: "Share" }]} />,
      900,
    );
    await userEvent.hover(buttons[0]!);
    const shown = await shownTooltip();
    expect(shown.firstElementChild!.firstChild!.textContent).toBe("Save");
    expect(shown.querySelector('[data-ouro="kbd"]')).not.toBeNull();
    // A labeled control with no shortcut has no tooltip at all.
    expect(buttons[0]!.hasAttribute("data-base-ui-tooltip-trigger")).toBe(true);
    expect(buttons[1]!.hasAttribute("data-base-ui-tooltip-trigger")).toBe(false);
  });

  it("treats an empty shortcut as none", async () => {
    const { buttons } = await render(<Toolbar label="Formatting" items={[{ label: "Quote", shortcut: [] }, { label: "Code", icon: Icon, hideLabel: true, shortcut: [] }]} />, 900);
    expect(buttons.map((button) => button.hasAttribute("aria-keyshortcuts"))).toEqual([false, false]);
    expect(buttons[0]!.hasAttribute("data-base-ui-tooltip-trigger")).toBe(false);
    await userEvent.hover(buttons[1]!);
    const shown = await shownTooltip();
    expect(shown.textContent).toBe("Code");
    expect(shown.querySelector('[data-ouro="kbd"]')).toBeNull();
  });

  it("does nothing when a button with no onClick is pressed", async () => {
    const { buttons } = await render(<Toolbar label="Formatting" items={[{ label: "Quote" }]} />, 900);
    await userEvent.click(buttons[0]!);
    expect(document.activeElement).toBe(buttons[0]);
  });

  it("keeps a disabled control reachable, faded, and inert to presses", async () => {
    const onClick = vi.fn();
    const onPressedChange = vi.fn();
    const { buttons } = await render(
      <Toolbar
        label="Formatting"
        items={[
          { label: "Undo", onClick },
          { label: "Redo", onClick, disabled: true },
          { type: "toggle", label: "Bold", onPressedChange, disabled: true },
        ]}
      />,
      900,
    );
    expect(buttons[1]!.getAttribute("aria-disabled")).toBe("true");
    expect(getComputedStyle(buttons[1]!).opacity).toBe("0.5");
    await userEvent.click(buttons[1]!, { force: true });
    await userEvent.click(buttons[2]!, { force: true });
    expect(onClick).not.toHaveBeenCalled();
    expect(onPressedChange).not.toHaveBeenCalled();
    expect(buttons[2]!.getAttribute("aria-pressed")).toBe("false");
    buttons[0]!.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(buttons[1]);
  });

  it("disables every control with disabled", async () => {
    const onClick = vi.fn();
    const { buttons, toolbar } = await render(<Toolbar label="Formatting" disabled items={[{ label: "Undo", onClick }, { type: "toggle", label: "Bold" }]} />, 900);
    expect(toolbar.hasAttribute("data-disabled")).toBe(true);
    expect(buttons.map((button) => button.getAttribute("aria-disabled"))).toEqual(["true", "true"]);
    await userEvent.click(buttons[0]!, { force: true });
    await userEvent.click(buttons[1]!, { force: true });
    expect(onClick).not.toHaveBeenCalled();
    expect(buttons[1]!.getAttribute("aria-pressed")).toBe("false");
  });

  it("with keepFocus, leaves focus in a text field when a control is clicked", async () => {
    const onClick = vi.fn();
    const { host, buttons } = await render(
      <>
        <Toolbar label="Formatting" keepFocus items={[{ type: "toggle", label: "Bold" }, { label: "Insert link", onClick }]} />
        <textarea aria-label="Message" data-test-harness="" defaultValue="Hello there" />
      </>,
      900,
    );
    const textarea = host.querySelector("textarea")!;
    textarea.focus();
    textarea.setSelectionRange(0, 5);
    await userEvent.click(buttons[0]!);
    expect(document.activeElement).toBe(textarea);
    expect([textarea.selectionStart, textarea.selectionEnd]).toEqual([0, 5]);
    expect(buttons[0]!.getAttribute("aria-pressed")).toBe("true");
    await userEvent.click(buttons[1]!);
    expect(document.activeElement).toBe(textarea);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("with keepFocus, a click focuses the control when nothing else has focus", async () => {
    const { buttons } = await render(<Toolbar label="Formatting" keepFocus items={[{ type: "toggle", label: "Bold" }]} />, 900);
    (document.activeElement as HTMLElement | null)?.blur();
    await userEvent.click(buttons[0]!);
    expect(document.activeElement).toBe(buttons[0]);
  });

  it("without keepFocus, a click focuses the control", async () => {
    const { host, buttons } = await render(
      <>
        <Toolbar label="Formatting" items={[{ type: "toggle", label: "Bold" }]} />
        <textarea aria-label="Message" data-test-harness="" />
      </>,
      900,
    );
    host.querySelector("textarea")!.focus();
    await userEvent.click(buttons[0]!);
    expect(document.activeElement).toBe(buttons[0]);
  });

  it("takes the size of every control", async () => {
    const { buttons, toolbar, rerender } = await render(<Toolbar label="Formatting" size="sm" items={formatting} />, 900);
    expect(toolbar.getAttribute("data-size")).toBe("sm");
    const small = buttons[0]!.getBoundingClientRect().height;
    await rerender(<Toolbar label="Formatting" size="lg" items={formatting} />);
    expect(toolbar.getAttribute("data-size")).toBe("lg");
    expect(buttons[0]!.getBoundingClientRect().height).toBeGreaterThan(small);
  });
});

describe("Toolbar overflow", () => {
  it("moves the controls that do not fit into a More menu at the end", async () => {
    const { buttons, more } = await render(<Toolbar label="Formatting" size="sm" items={formatting} />, 200);
    expect(more).not.toBeNull();
    expect(more!.getAttribute("aria-label")).toBe("More");
    expect(more!.getAttribute("aria-haspopup")).toBe("menu");
    // Three dots, hidden from screen readers.
    expect(more!.querySelectorAll("svg[aria-hidden='true'] circle")).toHaveLength(3);
    const shown = names(buttons.filter((button) => button !== more));
    expect(shown.length).toBeLessThan(5);
    expect(shown).toEqual(["Bold", "Italic", "Insert link", "Bulleted list", "Numbered list"].slice(0, shown.length));
    // The row never sticks out of its box.
    const toolbar = more!.closest<HTMLElement>('[data-ouro="toolbar"]')!;
    expect(more!.getBoundingClientRect().right).toBeLessThanOrEqual(toolbar.getBoundingClientRect().right + 0.5);
    await userEvent.click(more!);
    const menu = page.getByRole("menu");
    await expect.element(menu).toBeVisible();
    const hidden = ["Bold", "Italic", "Insert link", "Bulleted list", "Numbered list"].slice(shown.length);
    for (const name of hidden) await expect.element(menu.getByText(name, { exact: true })).toBeVisible();
  });

  it("shows each hidden toggle as a checkbox item that shares its state, a button as an item that runs it, and a group under its label", async () => {
    const onClick = vi.fn();
    const onPressedChange = vi.fn();
    const items: ToolbarEntry[] = [
      { label: "Undo", icon: Icon, hideLabel: true },
      { type: "separator" },
      { type: "toggle", label: "Bold", shortcut: ["mod", "b"], defaultPressed: true, onPressedChange },
      { label: "Insert link", onClick },
      { type: "group", label: "Lists", items: [{ label: "Bulleted list" }] },
    ];
    const { more, rerender } = await render(<Toolbar label="Formatting" size="sm" items={items} />, 130);
    expect(names([...more!.parentElement!.querySelectorAll("button")].filter((b) => b !== more))).toEqual(["Undo"]);
    await userEvent.click(more!);
    const bold = page.getByRole("menuitemcheckbox", { name: /Bold/ });
    await expect.element(bold).toHaveAttribute("aria-checked", "true");
    await expect.element(page.getByRole("menu").getByRole("group", { name: "Lists" })).toBeVisible();
    // The menu starts after the row, with no separator at its top.
    expect(page.getByRole("menu").element().querySelector('[role="separator"]')).toBeNull();
    await userEvent.click(bold);
    expect(onPressedChange).toHaveBeenLastCalledWith(false);
    // A checkbox item keeps the menu open, so its new state shows at once.
    await expect.element(bold).toHaveAttribute("aria-checked", "false");
    await userEvent.click(page.getByRole("menuitem", { name: "Insert link" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    // A wider row shows Bold again, still off.
    await rerender(<Toolbar label="Formatting" size="sm" items={items} />);
    (more!.closest('[data-ouro="toolbar"]')!.parentElement as HTMLElement).style.width = "900px";
    await expect.poll(() => page.getByRole("button", { name: "Bold" }).query()).not.toBeNull();
    expect(page.getByRole("button", { name: "Bold" }).element().getAttribute("aria-pressed")).toBe("false");
  });

  it("names the More button with moreLabel, and disables it with the rest", async () => {
    const { more } = await render(
      <Toolbar label="Formatting" size="sm" moreLabel="More formatting" disabled items={formatting} />,
      200,
    );
    expect(more!.getAttribute("aria-label")).toBe("More formatting");
    // Everything is disabled, the More button too; it stays reachable with the arrow keys.
    expect(more!.getAttribute("aria-disabled")).toBe("true");
  });

  it("follows the row's width: narrower hides more, wider shows them again", async () => {
    const { host, buttons } = await render(<Toolbar label="Formatting" size="sm" items={formatting} />, 900);
    expect(names(buttons)).toHaveLength(5);
    host.style.width = "160px";
    await expect.poll(() => host.querySelector('[data-ouro-part="more"]')).not.toBeNull();
    host.style.width = "900px";
    await expect.poll(() => host.querySelector('[data-ouro-part="more"]')).toBeNull();
    expect(host.querySelectorAll('[data-ouro="toolbar"] button')).toHaveLength(5);
  });

  it("moves focus to More when the focused control moves into the menu", async () => {
    const { host, buttons } = await render(<Toolbar label="Formatting" size="sm" items={formatting} />, 900);
    buttons[4]!.focus();
    host.style.width = "160px";
    await expect.poll(() => document.activeElement?.getAttribute("data-ouro-part")).toBe("more");
  });

  it("keeps focus where it is when the focused control still fits", async () => {
    const { host, buttons } = await render(<Toolbar label="Formatting" size="sm" items={formatting} />, 900);
    buttons[0]!.focus();
    host.style.width = "200px";
    await expect.poll(() => host.querySelector('[data-ouro-part="more"]')).not.toBeNull();
    expect(document.activeElement).toBe(buttons[0]);
  });

  it("measures again when the items or the size change", async () => {
    const { host, rerender } = await render(<Toolbar label="Formatting" size="sm" items={formatting.slice(0, 2)} />, 220);
    expect(host.querySelector('[data-ouro-part="more"]')).toBeNull();
    // A third control that still fits shows with the others.
    await rerender(<Toolbar label="Formatting" size="sm" items={formatting.slice(0, 4)} />);
    expect(host.querySelector('[data-ouro-part="more"]')).toBeNull();
    expect(host.querySelectorAll('[data-ouro="toolbar"] button')).toHaveLength(3);
    await rerender(<Toolbar label="Formatting" size="sm" items={formatting} />);
    expect(host.querySelector('[data-ouro-part="more"]')).not.toBeNull();
    await rerender(<Toolbar label="Formatting" size="sm" items={formatting.slice(0, 2)} />);
    expect(host.querySelector('[data-ouro-part="more"]')).toBeNull();
    // The same items at a larger size no longer fit.
    const labeled = ["One", "Two", "Three"].map((label) => ({ label }));
    host.style.width = "auto";
    await rerender(<Toolbar label="Formatting" size="sm" items={labeled} />);
    const toolbar = host.querySelector<HTMLElement>('[data-ouro="toolbar"]')!;
    host.style.width = `${toolbar.lastElementChild!.getBoundingClientRect().right - toolbar.getBoundingClientRect().left + 48 + 2}px`;
    await expect.poll(() => host.querySelector('[data-ouro-part="more"]')).toBeNull();
    await rerender(<Toolbar label="Formatting" size="lg" items={labeled} />);
    expect(host.querySelector('[data-ouro-part="more"]')).not.toBeNull();
  });

  it("leaves Home and End inside the More menu to the menu", async () => {
    const { more } = await render(<Toolbar label="Formatting" size="sm" items={formatting} />, 160);
    await userEvent.click(more!);
    await expect.element(page.getByRole("menu")).toBeVisible();
    await expect.poll(() => page.getByRole("menu").getByRole("menuitem").all().length).toBeGreaterThan(1);
    const items = page.getByRole("menu").getByRole("menuitem").all();
    items[0]!.element().focus();
    await userEvent.keyboard("{End}");
    expect(document.activeElement).toBe(items.at(-1)!.element());
    expect(document.activeElement!.closest('[data-ouro="toolbar"]')).toBeNull();
    await userEvent.keyboard("{Escape}");
  });

  it("leaves Home and End from anything but its controls alone", async () => {
    const { toolbar, buttons } = await render(<Toolbar label="Formatting" items={formatting} />, 900);
    buttons[2]!.focus();
    const event = new KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true });
    toolbar.querySelector('[role="separator"]')!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(buttons[2]);
  });

  it("takes no focus when it mounts too narrow", async () => {
    const { host } = await render(
      <>
        <textarea aria-label="Message" data-test-harness="" autoFocus />
        <Toolbar label="Formatting" size="sm" items={formatting} />
      </>,
      160,
    );
    expect(host.querySelector('[data-ouro-part="more"]')).not.toBeNull();
    expect(document.activeElement).toBe(host.querySelector("textarea"));
  });

  it("subtracts its own padding from the room it has", async () => {
    const six = ["One", "Two", "Three", "Four", "Five", "Six"].map((label) => ({ label }));
    const { host, toolbar } = await render(<Toolbar label="Numbers" size="sm" items={six} />, 2000);
    const first = toolbar.firstElementChild!.getBoundingClientRect();
    const last = toolbar.lastElementChild!.getBoundingClientRect();
    // Room for every control with 10px to spare (the host's 48px of padding is inside its width), less than the 80px of padding px-10 adds.
    host.style.width = `${last.right - first.left + 48 + 10}px`;
    await expect.poll(() => host.querySelector('[data-ouro-part="more"]')).toBeNull();
    const { host: padded } = await render(<Toolbar label="Numbers" size="sm" items={six} className="px-10" />, last.right - first.left + 48 + 10);
    expect(padded.querySelector('[data-ouro-part="more"]')).not.toBeNull();
  });

  it("moves focus to More when the first control to move is the focused one, and only then", async () => {
    const six = ["One", "Two", "Three", "Four", "Five", "Six"].map((label) => ({ label }));
    const { host, toolbar } = await render(
      <>
        <Toolbar label="Numbers" size="sm" items={six} />
        <textarea aria-label="Message" data-test-harness="" />
      </>,
      900,
    );
    host.style.width = "220px";
    await expect.poll(() => host.querySelector('[data-ouro-part="more"]')).not.toBeNull();
    const kept = toolbar.querySelectorAll('[data-ouro-part="button"]').length;
    host.style.width = "900px";
    await expect.poll(() => host.querySelector('[data-ouro-part="more"]')).toBeNull();
    // The first control that will move: its index is the count that stays.
    toolbar.querySelectorAll<HTMLElement>('[data-ouro-part="button"]')[kept]!.focus();
    host.style.width = "220px";
    await expect.poll(() => document.activeElement?.getAttribute("data-ouro-part")).toBe("more");
    // Focus elsewhere stays there through later resizes.
    host.querySelector("textarea")!.focus();
    host.style.width = "140px";
    await expect.poll(() => toolbar.querySelectorAll('[data-ouro-part="button"]').length).toBeLessThan(kept);
    host.style.width = "900px";
    await expect.poll(() => host.querySelector('[data-ouro-part="more"]')).toBeNull();
    expect(document.activeElement).toBe(host.querySelector("textarea"));
  });

  it("shows a separator between hidden controls in the menu, and a control's own disabled there", async () => {
    const { more } = await render(
      <Toolbar
        label="Formatting"
        size="sm"
        items={[
          { label: "Undo", icon: Icon, hideLabel: true },
          { label: "Insert link" },
          { type: "separator" },
          { label: "Insert table", disabled: true },
          { type: "toggle", label: "Show grid", disabled: true },
        ]}
      />,
      120,
    );
    await userEvent.click(more!);
    await expect.element(page.getByRole("menu")).toBeVisible();
    const menu = page.getByRole("menu").element();
    expect(menu.querySelectorAll('[role="separator"]')).toHaveLength(1);
    await expect.element(page.getByRole("menuitem", { name: "Insert link" })).not.toHaveAttribute("aria-disabled", "true");
    await expect.element(page.getByRole("menuitem", { name: "Insert table" })).toHaveAttribute("aria-disabled", "true");
    await expect.element(page.getByRole("menuitemcheckbox", { name: "Show grid" })).toHaveAttribute("aria-disabled", "true");
    await userEvent.keyboard("{Escape}");
  });

  it("keeps everything in the menu when nothing fits", async () => {
    const { buttons, more } = await render(<Toolbar label="Formatting" size="sm" items={formatting} />, 40);
    expect(buttons).toEqual([more]);
  });
});

describe("Toolbar overflow arithmetic", () => {
  it("fits every entry when they and their gaps fit, with half a pixel of slack", () => {
    expect(fitCount([30, 30, 30], 30, 2, 94)).toBe(3);
    expect(fitCount([30, 30, 30], 30, 2, 93.5)).toBe(3);
    expect(fitCount([], 30, 2, 0)).toBe(0);
  });

  it("fits as many as leave room for More and its gap", () => {
    expect(fitCount([30, 30, 30], 30, 2, 93)).toBe(1);
    expect(fitCount([30, 30, 30], 30, 2, 94 - 0.6)).toBe(1);
    expect(fitCount([30, 30, 30, 30], 30, 2, 96)).toBe(2);
    expect(fitCount([30, 30, 30, 30], 30, 2, 93)).toBe(1);
    expect(fitCount([30, 30, 30], 30, 0, 60)).toBe(1);
    expect(fitCount([30, 30, 30], 30, 2, 20)).toBe(0);
    expect(fitCount([10, 50, 10], 20, 0, 60)).toBe(1);
  });

  it("leaves no gap before the first entry, and lets an entry end exactly at the edge", () => {
    // 15 fits beside More (10) and its gap (5) in 34, with no gap before it.
    expect(fitCount([15, 10, 10], 10, 5, 34)).toBe(1);
    // 9.5 ends exactly where More's room begins.
    expect(fitCount([9.5, 10, 10], 10, 0, 19)).toBe(1);
  });

  it("drops a separator at the end of the row and at the start of the menu", () => {
    const entries = [{ type: "toggle" }, { type: "separator" }, { type: "separator" }, { type: undefined }];
    expect(splitEntries(entries, 2)).toEqual({ visible: [{ type: "toggle" }], overflow: [{ type: undefined }] });
    expect(splitEntries(entries, 3)).toEqual({ visible: [{ type: "toggle" }], overflow: [{ type: undefined }] });
    expect(splitEntries(entries, 4)).toEqual({ visible: entries, overflow: [] });
    expect(splitEntries(entries, 0)).toEqual({ visible: [], overflow: [{ type: "toggle" }, { type: "separator" }, { type: "separator" }, { type: undefined }] });
  });
});

describe("Toolbar development messages", () => {
  const first = () => warn.mock.calls.map((call: unknown[]) => String(call[0]));

  it.each<[string, Record<string, unknown>, string]>([
    ["an unknown size", { size: "xl" }, '[ouro-ui] Toolbar: size="xl" is not a size. Fix: <Toolbar size="md">.'],
    ["an empty label", { label: "" }, '[ouro-ui] Toolbar: label is empty, so the toolbar has no name. Fix: <Toolbar label="Formatting">.'],
    [
      "an icon-only control with no icon",
      { items: [{ label: "Quote mark", hideLabel: true }] },
      '[ouro-ui] Toolbar: "Quote mark" hides its label without an icon. Fix: { label: "Quote mark", icon: QuotemarkIcon, hideLabel: true }.',
    ],
    [
      "a shortcut as a string",
      { items: [{ type: "group", label: "Text", items: [{ label: "Bold", shortcut: "mod+b" as never }] }] },
      '[ouro-ui] Toolbar: "Bold" has shortcut="mod+b", a string; shortcut takes an array. Fix: { shortcut: ["mod", "b"] }.',
    ],
    [
      "a group with no label",
      { items: [{ label: "Undo" }, { type: "group", label: "", items: [{ label: "Bold" }] }] },
      "[ouro-ui] Toolbar: a group's label is empty, so screen readers cannot name it. Fix: { type: \"group\", label: \"Lists\", items: […] }.",
    ],
    [
      "children",
      { children: "Bold" as never },
      '[ouro-ui] Toolbar: children is not a prop; the controls come from items. Fix: <Toolbar items={[{ label: "Bold", type: "toggle" }]}>.',
    ],
    ["orientation", { orientation: "vertical" as never }, "[ouro-ui] Toolbar: orientation is not a prop; a Toolbar is a row. Fix: <Toolbar label=\"Formatting\" items={…}>."],
    ["actions", { actions: [] as never }, "[ouro-ui] Toolbar: actions is not a prop. Fix: <Toolbar items={[…]}>."],
  ])("names the fix for %s", async (_case, extra, message) => {
    await render(<Toolbar {...({ label: "Formatting", items: [{ label: "Redo" }], ...extra } as ToolbarProps)} />, 900);
    expect(first()).toContain(message);
  });

  it("renders the default size for an unknown one", async () => {
    const { toolbar } = await render(<Toolbar label="Formatting" size={"xl" as never} items={[{ label: "Undo" }]} />, 900);
    expect(toolbar.getAttribute("data-size")).toBe("md");
  });

  it("names the fix for an appearance class", async () => {
    await render(<Toolbar label="Formatting" className="bg-red-500 mt-2" items={[{ label: "Undo" }]} />, 900);
    expect(first().some((text: string) => text === '[ouro-ui] Toolbar: "bg-red-500" sets appearance, and className is for layout only. Fix: remove "bg-red-500"; Toolbar takes its colors from the theme.')).toBe(true);
  });

  it("throws with the fix when two controls share a label", () => {
    expect(() =>
      renderToString(
        <Toolbar
          label="Formatting"
          items={[{ label: "Bold" }, { type: "separator" }, { label: "Italic" }, { type: "separator" }, { type: "group", label: "More", items: [{ label: "Bold" }] }]}
        />,
      ),
    ).toThrow('[ouro-ui] Toolbar: two controls are labeled "Bold". Fix: give each control its own label.');
  });

  it("is quiet for a valid toolbar", async () => {
    await render(<Toolbar label="Formatting" items={formatting} />, 900);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("Toolbar server rendering", () => {
  it("renders every control on the server and hydrates with no warning", async () => {
    const error = vi.spyOn(console, "error");
    const node = <Toolbar label="Formatting" items={formatting} />;
    const html = renderToString(node);
    expect(html).toContain('role="toolbar"');
    expect(html).toContain('aria-label="Formatting"');
    expect(html).toContain('data-ouro="toolbar"');
    const host = document.createElement("div");
    host.style.width = "900px";
    host.innerHTML = html;
    document.body.append(host);
    mounted.push(host);
    const recoverable = vi.fn();
    let root!: Root;
    await act(async () => {
      root = hydrateRoot(host, node, { onRecoverableError: recoverable });
    });
    roots.push(root);
    expect(recoverable).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(host.querySelectorAll("button")).toHaveLength(5);
  });
});
