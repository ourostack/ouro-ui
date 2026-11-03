import { useEffect, useRef, useState, type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { Dialog } from "@/registry/ouro/components/ouro/dialog/dialog";
import { Popover } from "@/registry/ouro/components/ouro/popover/popover";
import { Toolbar, type ToolbarEntry, type ToolbarProps } from "@/registry/ouro/components/ouro/toolbar/toolbar";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { parseDuration } from "@/registry/ouro/lib/ouro/testing/motion";
import { pageCss } from "@/registry/ouro/lib/ouro/testing/page-css";
import { pressTab } from "@/registry/ouro/lib/ouro/testing/tab";

const roots: Root[] = [];
let mounted: Element[] = [];

function Icon() {
  return <svg viewBox="0 0 16 16" />;
}

const controls: ToolbarEntry[] = [{ type: "toggle", label: "Mute" }, { label: "Share" }, { type: "separator" }, { label: "Leave" }];

/** Icon-only controls with shortcuts, as a calling app's bar has, each with its tooltip. */
const iconControls: ToolbarEntry[] = [
  { type: "toggle", label: "Mute", icon: Icon, hideLabel: true, shortcut: ["shift", "mod", "m"] },
  { label: "Share", icon: Icon, hideLabel: true },
  { label: "Leave" },
];

type Layout = "positioned" | "static";

/**
 * A made-up call's stage holding the bar under a picture, and a strip below the stage. With
 * `"positioned"` the stage is `relative`, so it is the bar's offset parent; with `"static"` no
 * ancestor is positioned, so the bar's offset parent is the body.
 */
async function render(toolbar: ReactNode, layout: Layout = "positioned", before?: ReactNode) {
  const host = document.createElement("div");
  host.style.padding = "24px";
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  const tree = (bar: ReactNode) => (
    <>
      <div data-stage="" style={{ position: layout === "positioned" ? "relative" : "static", width: 600, padding: 8 }}>
        <div data-picture="" style={{ height: 120 }} />
        {before}
        {bar}
      </div>
      <div data-away="" style={{ height: 120, width: 600 }} />
    </>
  );
  await act(async () => root.render(tree(toolbar)));
  // Start each test with the real pointer off the bar.
  await userEvent.hover(host.querySelector<HTMLElement>("[data-away]")!);
  return {
    host,
    rerender: (next: ReactNode) => act(async () => root.render(tree(next))),
    get toolbar() {
      return host.querySelector<HTMLElement>('[data-ouro="toolbar"]')!;
    },
    picture: host.querySelector<HTMLElement>("[data-picture]")!,
    away: host.querySelector<HTMLElement>("[data-away]")!,
  };
}

/** A theme colour, or a colour mixed from the theme, as the browser computes it. */
function computedBackground(value: string): string {
  const probe = document.createElement("div");
  probe.style.backgroundColor = value;
  document.body.append(probe);
  const color = getComputedStyle(probe).backgroundColor;
  probe.remove();
  return color;
}

const token = (name: string) => parseDuration(getComputedStyle(document.documentElement).getPropertyValue(name));

/** A pointer event at a point, from an element, as a browser sends it. */
const point = (target: Element, type: "pointermove" | "pointerdown", x = 10, y = 10) =>
  act(async () => void target.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, clientX: x, clientY: y })));

const wait = (ms: number) => act(async () => void vi.advanceTimersByTime(ms));

const isHidden = (toolbar: HTMLElement) => toolbar.hasAttribute("data-hidden");

const fadeDone = (toolbar: HTMLElement) => Promise.all(toolbar.getAnimations().map((animation) => animation.finished.catch(() => undefined)));

beforeEach(async () => {
  await page.viewport(1280, 800);
});
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await userEvent.unhover(document.body);
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
  await page.viewport(414, 896);
});

describe("Toolbar floating", () => {
  it("is translucent glass from the theme, with a blur, a hairline, a shadow and rounded corners, and stays in the flow", async () => {
    const { toolbar } = await render(<Toolbar label="Call controls" floating items={controls} />);
    const style = getComputedStyle(toolbar);
    expect(style.backgroundColor).toBe(computedBackground("color-mix(in oklab, var(--card) 75%, transparent)"));
    expect(style.backgroundColor).not.toBe(computedBackground("var(--card)"));
    expect(style.color).toBe(computedBackground("var(--card-foreground)"));
    expect(style.backdropFilter).toMatch(/^blur\(/);
    // The hairline ring and the theme's large shadow, as box shadows.
    expect(style.boxShadow.match(/(rgba?|oklab|oklch|color)\(/g)!.length).toBeGreaterThan(1);
    expect(style.borderTopLeftRadius).not.toBe("0px");
    expect(parseFloat(style.paddingInlineStart)).toBeGreaterThan(0);
    // The look only: where it sits is the app's.
    expect(style.position).toBe("static");
  });

  it("is a plain row without floating", async () => {
    const { toolbar } = await render(<Toolbar label="Call controls" items={controls} />);
    const style = getComputedStyle(toolbar);
    expect(style.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(style.backdropFilter).toBe("none");
    expect(style.boxShadow).toBe("none");
  });

  it("turns solid with no blur when the system asks for reduced transparency", async () => {
    const { toolbar } = await render(<Toolbar label="Call controls" floating items={controls} />);
    // Test browsers cannot ask for reduced transparency, so the page's own rules for it apply to every page here.
    const reduced = document.createElement("style");
    reduced.textContent = pageCss().replace(/@media ?\(prefers-reduced-transparency: ?reduce\)/g, "@media all");
    expect(reduced.textContent).not.toBe(pageCss());
    document.head.append(reduced);
    mounted.push(reduced);
    const style = getComputedStyle(toolbar);
    expect(style.backgroundColor).toBe(computedBackground("var(--card)"));
    expect(style.backdropFilter).toBe("none");
  });

  it("turns solid with a defined edge with prefers-contrast: more, at the same size", async () => {
    const { toolbar } = await render(<Toolbar label="Call controls" floating items={controls} />);
    const size = toolbar.getBoundingClientRect();
    await commands.emulateMedia({ contrast: "more" });
    try {
      const style = getComputedStyle(toolbar);
      expect(style.backgroundColor).toBe(computedBackground("var(--card)"));
      expect(style.backdropFilter).toBe("none");
      // A 2px ring in the text colour, drawn outside the box, so nothing inside moves.
      expect(style.boxShadow).toContain(`${style.color} 0px 0px 0px 2px`);
      expect(style.borderTopWidth).toBe("0px");
      const now = toolbar.getBoundingClientRect();
      expect([now.width, now.height]).toEqual([size.width, size.height]);
    } finally {
      await commands.emulateMedia({ contrast: "no-preference" });
    }
  });

  it("keeps an edge under forced colours", async () => {
    const { toolbar } = await render(<Toolbar label="Call controls" floating items={controls} />);
    await commands.emulateMedia({ forcedColors: "active" });
    try {
      expect(getComputedStyle(toolbar).borderTopStyle).toBe("solid");
      expect(parseFloat(getComputedStyle(toolbar).borderTopWidth)).toBeGreaterThan(0);
    } finally {
      await commands.emulateMedia({ forcedColors: "none" });
    }
  });
});

describe("Toolbar autoHide", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  it("fades out with opacity after the pointer rests, and a pointer move over its area brings it back", async () => {
    const { toolbar, picture } = await render(<Toolbar label="Call controls" autoHide={1000} items={controls} />);
    expect(isHidden(toolbar)).toBe(false);
    await wait(999);
    expect(isHidden(toolbar)).toBe(false);
    await wait(1);
    expect(toolbar.getAttribute("data-hidden")).toBe("");
    await fadeDone(toolbar);
    expect(getComputedStyle(toolbar).opacity).toBe("0");
    await point(picture, "pointermove", 20, 20);
    expect(isHidden(toolbar)).toBe(false);
    await expect.poll(() => getComputedStyle(toolbar).opacity).toBe("1");
    // Each move starts the rest again.
    await wait(600);
    await point(picture, "pointermove", 21, 20);
    await wait(600);
    expect(isHidden(toolbar)).toBe(false);
    await wait(400);
    expect(isHidden(toolbar)).toBe(true);
  });

  it("counts a move only when the pointer moved, and every press", async () => {
    const { toolbar, picture } = await render(<Toolbar label="Call controls" autoHide={1000} items={controls} />);
    await point(picture, "pointermove", 30, 30);
    await wait(600);
    // A move event at the same place, as a browser sends after layout, starts nothing.
    await point(picture, "pointermove", 30, 30);
    await wait(400);
    expect(isHidden(toolbar)).toBe(true);
    // A press at the same place shows it and starts the rest again.
    await point(picture, "pointerdown", 30, 30);
    expect(isHidden(toolbar)).toBe(false);
    await wait(600);
    await point(picture, "pointerdown", 30, 30);
    await wait(600);
    expect(isHidden(toolbar)).toBe(false);
    await wait(400);
    expect(isHidden(toolbar)).toBe(true);
  });

  it("fades with opacity alone, also with reduced motion", async () => {
    const { toolbar, picture } = await render(<Toolbar label="Call controls" floating autoHide={1000} items={controls} />);
    const easeOut = getComputedStyle(document.documentElement).getPropertyValue("--ouro-ease-out").replace(/\s/g, "");
    expect(getComputedStyle(toolbar).transitionProperty).toBe("opacity");
    expect(parseDuration(getComputedStyle(toolbar).transitionDuration)).toBe(token("--ouro-duration-base"));
    expect(getComputedStyle(toolbar).transitionTimingFunction.replace(/\s/g, "")).toBe(easeOut);
    await wait(1000);
    expect(toolbar.getAnimations().map((animation) => (animation as CSSTransition).transitionProperty)).toEqual(["opacity"]);
    await fadeDone(toolbar);
    await commands.emulateMedia({ reducedMotion: "reduce" });
    try {
      expect(parseDuration(getComputedStyle(toolbar).transitionDuration)).toBe(token("--ouro-duration-base"));
      expect(getComputedStyle(toolbar).transitionTimingFunction.replace(/\s/g, "")).toBe(easeOut);
      await point(picture, "pointermove", 40, 40);
      expect(toolbar.getAnimations().map((animation) => (animation as CSSTransition).transitionProperty)).toEqual(["opacity"]);
    } finally {
      await commands.emulateMedia({ reducedMotion: "no-preference" });
    }
  });

  it("has no transition without autoHide", async () => {
    const { toolbar } = await render(<Toolbar label="Call controls" floating items={controls} />);
    expect(parseDuration(getComputedStyle(toolbar).transitionDuration)).toBe(0);
  });

  it("stays while the pointer rests on it, and fades once the pointer leaves", async () => {
    const { toolbar, away } = await render(<Toolbar label="Call controls" autoHide={1000} items={controls} />);
    await userEvent.hover(page.getByRole("button", { name: "Share" }));
    await wait(1500);
    expect(isHidden(toolbar)).toBe(false);
    await wait(3000);
    expect(isHidden(toolbar)).toBe(false);
    // Away from the stage, outside its area: no move restarts the rest, and the waiting one ends it.
    await userEvent.hover(away);
    await wait(1000);
    expect(isHidden(toolbar)).toBe(true);
  });

  it("takes no hold from the hover a touch leaves behind", async () => {
    const { toolbar, picture } = await render(<Toolbar label="Call controls" autoHide={1000} items={controls} />);
    await userEvent.hover(page.getByRole("button", { name: "Share" }));
    expect(toolbar.matches(":hover")).toBe(true);
    // A tap on the stage: the last pointer is a finger, so the :hover left on the bar holds nothing.
    await act(async () => void picture.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 5, clientY: 5, pointerType: "touch" })));
    await wait(1000);
    expect(isHidden(toolbar)).toBe(true);
  });

  it("stays while keyboard focus is inside it, until the pointer moves on its area", async () => {
    const { toolbar, picture } = await render(
      <Toolbar label="Call controls" autoHide={1000} items={controls} />,
      "positioned",
      <button type="button" data-test-harness="">
        Before
      </button>,
    );
    page.getByRole("button", { name: "Before" }).element().focus();
    await pressTab();
    expect(document.activeElement).toBe(page.getByRole("button", { name: "Mute" }).element());
    await wait(4000);
    expect(isHidden(toolbar)).toBe(false);
    // Back to the mouse: the hold ends, though focus stays in the bar.
    await point(picture, "pointermove", 20, 30);
    await wait(1000);
    expect(isHidden(toolbar)).toBe(true);
    expect(document.activeElement).toBe(page.getByRole("button", { name: "Mute" }).element());
    // A key in the bar brings it back, and holds it again, though focus stays where it was.
    await userEvent.keyboard("{Enter}");
    expect(isHidden(toolbar)).toBe(false);
    await wait(4000);
    expect(isHidden(toolbar)).toBe(false);
  });

  it("holds for keyboard focus already in it when autoHide turns on", async () => {
    const bar = (autoHide?: number) => <Toolbar label="Call controls" autoHide={autoHide} items={controls} />;
    const { toolbar, rerender } = await render(bar(), "positioned", <button type="button" data-test-harness="">Before</button>);
    page.getByRole("button", { name: "Before" }).element().focus();
    await pressTab();
    await rerender(bar(1000));
    await wait(3000);
    expect(isHidden(toolbar)).toBe(false);
  });

  it("fades after a click on a control once the pointer rests on the stage", async () => {
    const { toolbar, picture, away } = await render(<Toolbar label="Call controls" autoHide={1000} items={controls} />);
    await userEvent.click(page.getByRole("button", { name: "Mute" }));
    // Chromium focuses the clicked button and Safari does not; neither holds the bar.
    const focused = document.activeElement;
    await userEvent.hover(picture);
    await wait(1000);
    expect(isHidden(toolbar)).toBe(true);
    expect(document.activeElement).toBe(focused);
    // Shown, clicked again, then left for somewhere outside the area: still no hold.
    await point(picture, "pointermove", 27, 27);
    await fadeDone(toolbar);
    await act(async () => (document.activeElement as HTMLElement).blur());
    await userEvent.click(page.getByRole("button", { name: "Mute" }));
    await userEvent.hover(away);
    await wait(1000);
    expect(isHidden(toolbar)).toBe(true);
  });

  it("stays while its More menu is open", async () => {
    const many: ToolbarEntry[] = ["Mute", "Camera", "Share", "Captions", "Reactions", "Leave"].map((label) => ({ label }));
    const { toolbar, picture } = await render(
      <div style={{ width: 160 }}>
        <Toolbar label="Call controls" size="sm" autoHide={1000} items={many} />
      </div>,
    );
    await userEvent.click(page.getByRole("button", { name: "More" }));
    await expect.element(page.getByRole("menu")).toBeVisible();
    // Off the bar, over the menu, which is outside the stage.
    await userEvent.hover(page.getByRole("menuitem").last());
    expect(toolbar.matches(":hover")).toBe(false);
    await wait(3000);
    expect(isHidden(toolbar)).toBe(false);
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => page.getByRole("menu").query()).toBeNull();
    await expect.poll(() => toolbar.querySelector("[aria-expanded='true']")).toBeNull();
    // Back to the mouse: focus on More, and the tooltip it showed, hold nothing once it moves.
    await point(picture, "pointermove", 50, 50);
    await wait(1000);
    expect(isHidden(toolbar)).toBe(true);
  });

  it("stays faded while someone types in a field elsewhere or presses keys on the page", async () => {
    const { toolbar } = await render(
      <Toolbar label="Call controls" autoHide={1000} items={controls} />,
      "positioned",
      <input aria-label="Chat" data-test-harness="" />,
    );
    await wait(1000);
    expect(isHidden(toolbar)).toBe(true);
    await userEvent.click(page.getByRole("textbox", { name: "Chat" }));
    await wait(1000);
    expect(isHidden(toolbar)).toBe(true);
    await userEvent.keyboard("See you at noon{Enter}");
    expect(isHidden(toolbar)).toBe(true);
    await act(async () => (document.activeElement as HTMLElement).blur());
    // Space to talk, a modifier for a shortcut or a screenshot.
    await userEvent.keyboard("{ }{Shift}{Meta}{Control}");
    expect(isHidden(toolbar)).toBe(true);
  });

  it("comes back for a key in it, but not for a bare modifier or a held key's repeats", async () => {
    const { toolbar, picture } = await render(<Toolbar label="Call controls" autoHide={1000} items={controls} />);
    const share = page.getByRole("button", { name: "Share" }).element();
    await act(async () => share.focus());
    await point(picture, "pointermove", 25, 25);
    await wait(1000);
    // Faded with focus still on Share.
    expect(isHidden(toolbar)).toBe(true);
    expect(document.activeElement).toBe(share);
    for (const key of ["Shift", "Control", "Alt", "Meta"]) {
      await userEvent.keyboard(`{${key}}`);
      expect(isHidden(toolbar)).toBe(true);
    }
    await act(async () => void share.dispatchEvent(new KeyboardEvent("keydown", { key: "a", repeat: true, bubbles: true })));
    expect(isHidden(toolbar)).toBe(true);
    await userEvent.keyboard("{Enter}");
    expect(isHidden(toolbar)).toBe(false);
    expect(document.activeElement).toBe(share);
  });

  it("comes back when focus enters it, from Tab or a screen reader", async () => {
    const { toolbar, picture } = await render(
      <Toolbar label="Call controls" autoHide={1000} items={controls} />,
      "positioned",
      <button type="button" data-test-harness="">
        Before
      </button>,
    );
    page.getByRole("button", { name: "Before" }).element().focus();
    await wait(1000);
    expect(isHidden(toolbar)).toBe(true);
    await pressTab();
    expect(isHidden(toolbar)).toBe(false);
    expect(document.activeElement).toBe(page.getByRole("button", { name: "Mute" }).element());
    await point(picture, "pointermove", 26, 26);
    await wait(1000);
    expect(isHidden(toolbar)).toBe(true);
    // A screen reader or Voice Control moves focus straight to a control, with no key in the page.
    await act(async () => page.getByRole("button", { name: "Leave" }).element().focus());
    expect(isHidden(toolbar)).toBe(false);
  });

  it("stays in the accessibility tree and focusable while faded, and takes no pointer presses", async () => {
    const { toolbar } = await render(<Toolbar label="Call controls" autoHide={1000} items={controls} />);
    await wait(1000);
    expect(isHidden(toolbar)).toBe(true);
    expect(["aria-hidden", "inert"].filter((name) => toolbar.hasAttribute(name))).toEqual([]);
    await expect.element(page.getByRole("toolbar", { name: "Call controls" }).getByRole("button", { name: "Mute" })).toBeInTheDocument();
    expect(page.getByRole("button", { name: "Mute" }).element().tabIndex).toBe(0);
    expect(getComputedStyle(toolbar).pointerEvents).toBe("none");
    const mute = page.getByRole("button", { name: "Mute" }).element().getBoundingClientRect();
    expect(toolbar.contains(document.elementFromPoint(mute.x + mute.width / 2, mute.y + mute.height / 2))).toBe(false);
  });

  it("comes back for an event that something inside its area stops", async () => {
    const { toolbar, picture } = await render(<Toolbar label="Call controls" autoHide={1000} items={controls} />);
    for (const type of ["pointermove", "pointerdown"]) picture.addEventListener(type, (event) => event.stopPropagation());
    for (const [index, type] of (["pointermove", "pointerdown"] as const).entries()) {
      await wait(1000);
      expect(isHidden(toolbar)).toBe(true);
      await point(picture, type, 70 + index, 70);
      expect(isHidden(toolbar)).toBe(false);
    }
  });

  it("stays while a popover anchored to one of its controls is open", async () => {
    function WithReactions() {
      const [open, setOpen] = useState(false);
      const anchor = useRef<HTMLElement | null>(null);
      const items: ToolbarEntry[] = [
        {
          label: "Reactions",
          onClick: () => {
            anchor.current = document.querySelector<HTMLElement>('[data-ouro-part="button"]');
            setOpen(true);
          },
        },
        { label: "Leave" },
      ];
      return (
        <>
          <Toolbar label="Call controls" autoHide={1000} items={items} />
          <Popover title="Reactions" open={open} onOpenChange={setOpen} anchor={anchor}>
            <button type="button" data-test-harness="">
              Wave
            </button>
          </Popover>
        </>
      );
    }
    const { toolbar, picture } = await render(<WithReactions />);
    await userEvent.click(page.getByRole("button", { name: "Reactions" }));
    await expect.element(page.getByRole("dialog", { name: "Reactions" })).toBeVisible();
    await expect.poll(() => page.getByRole("dialog", { name: "Reactions" }).element().contains(document.activeElement)).toBe(true);
    // Off the bar, onto the pictures.
    await userEvent.hover(picture);
    await wait(3000);
    expect(isHidden(toolbar)).toBe(false);
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => page.getByRole("dialog").query()).toBeNull();
    // Focus goes back to Reactions, or to the page where a click focused nothing; then back to the mouse.
    await expect.poll(() => toolbar.contains(document.activeElement) || document.activeElement === document.body).toBe(true);
    await point(picture, "pointermove", 32, 31);
    await wait(1000);
    expect(isHidden(toolbar)).toBe(true);
  });

  it("stays while the pointer rests on an icon-only control with its tooltip, and fades once it leaves", async () => {
    const { toolbar, picture } = await render(<Toolbar label="Call controls" autoHide={1000} items={iconControls} />);
    const mute = page.getByRole("button", { name: "Mute" }).element();
    await userEvent.hover(mute);
    await expect.poll(() => mute.hasAttribute("data-popup-open")).toBe(true);
    await wait(3000);
    expect(isHidden(toolbar)).toBe(false);
    await userEvent.hover(picture);
    await wait(1000);
    expect(isHidden(toolbar)).toBe(true);
  });

  it("lets a tooltip that Tab showed go once the pointer moves, and closes it as it fades", async () => {
    const { toolbar, picture } = await render(
      <Toolbar label="Call controls" autoHide={1000} items={iconControls} />,
      "positioned",
      <button type="button" data-test-harness="">
        Before
      </button>,
    );
    page.getByRole("button", { name: "Before" }).element().focus();
    await pressTab();
    const mute = page.getByRole("button", { name: "Mute" }).element();
    expect(document.activeElement).toBe(mute);
    await expect.poll(() => mute.hasAttribute("data-popup-open")).toBe(true);
    // Keyboard focus holds it, tooltip and all.
    await wait(4000);
    expect(isHidden(toolbar)).toBe(false);
    // Back to the mouse, over the stage: the tooltip holds nothing, and goes with the bar.
    await point(picture, "pointermove", 33, 33);
    await wait(1000);
    expect(isHidden(toolbar)).toBe(true);
    await expect.poll(() => document.querySelector('[data-ouro="tooltip"]')).toBeNull();
    expect(mute.hasAttribute("data-popup-open")).toBe(false);
    expect(document.activeElement).toBe(mute);
  });

  it("stays behind a modal dialog one of its controls opened, and takes focus back when it closes", async () => {
    let before: Element | null = null;
    function WithShare() {
      const [open, setOpen] = useState(false);
      const items: ToolbarEntry[] = [
        {
          label: "Share",
          onClick: () => {
            before = document.activeElement;
            setOpen(true);
          },
        },
        { label: "Leave" },
      ];
      return (
        <>
          <Toolbar label="Call controls" autoHide={1000} items={items} />
          <Dialog title="Share your screen" open={open} onOpenChange={setOpen}>
            <button type="button" data-test-harness="" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </Dialog>
        </>
      );
    }
    const { toolbar, picture } = await render(<WithShare />);
    await userEvent.click(page.getByRole("button", { name: "Share" }));
    await expect.element(page.getByRole("dialog", { name: "Share your screen" })).toBeVisible();
    await wait(3000);
    expect(isHidden(toolbar)).toBe(false);
    await userEvent.click(page.getByRole("button", { name: "Cancel" }));
    await expect.poll(() => page.getByRole("dialog").query()).toBeNull();
    // Focus goes back where it was when Share was clicked: Share itself in Chromium, never lost to a hidden bar.
    await expect.poll(() => document.activeElement).toBe(before);
    await point(picture, "pointermove", 35, 35);
    await wait(1000);
    expect(isHidden(toolbar)).toBe(true);
  });

  it("holds only while a dialog or top-layer element one of its controls opened is open", async () => {
    const { toolbar, picture } = await render(<Toolbar label="Call controls" autoHide={1000} items={controls} />);
    const share = page.getByRole("button", { name: "Share" }).element();
    let x = 40;
    const press = (target: Element) => target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: 40 }));
    /** A new layer of this kind, open and focused. */
    const layer = (kind: "dialog" | "native" | "popover" | "plain") => {
      const element = document.createElement(kind === "native" ? "dialog" : "div");
      if (kind === "dialog") element.setAttribute("role", "dialog");
      if (kind === "popover") element.setAttribute("popover", "manual");
      element.tabIndex = -1;
      document.body.append(element);
      mounted.push(element);
      if (element instanceof HTMLDialogElement) element.showModal();
      if (kind === "popover") element.showPopover();
      element.focus();
      return element;
    };
    /** Whether the bar is still up after `open` and a rest with the pointer on the stage; then it closes what it opened. */
    const holds = async (open: () => Element | void) => {
      await act(async () => (document.activeElement as HTMLElement | null)?.blur());
      await point(picture, "pointermove", (x += 1), 40);
      let opened: Element | void;
      await act(async () => void (opened = open()));
      await point(picture, "pointermove", (x += 1), 40);
      await wait(3000);
      const kept = !isHidden(toolbar);
      await act(async () => {
        if (opened instanceof HTMLDialogElement) opened.close();
        opened?.remove();
      });
      await point(picture, "pointermove", (x += 1), 40);
      await wait(1000);
      return kept;
    };
    // A press on a control, then the dialog it opens.
    expect(await holds(() => (press(share), layer("dialog")))).toBe(true);
    // A key on a control, then the dialog.
    expect(await holds(() => (share.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })), layer("dialog")))).toBe(true);
    // A press, a move on the stage, then the dialog: a move is no press.
    expect(await holds(() => (press(share), picture.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 7 })), layer("dialog")))).toBe(true);
    // A modal <dialog>, or an element in the top layer, that a control opened.
    expect(await holds(() => (press(share), layer("native")))).toBe(true);
    expect(await holds(() => (press(share), layer("popover")))).toBe(true);
    // Focus that moves from a control into a new dialog, with no press or key: as a Tab out of the bar.
    expect(await holds(() => (share.focus(), layer("dialog")))).toBe(false);
    // A press on the stage, or on the bar but not on a control, then a dialog.
    expect(await holds(() => (press(picture), layer("dialog")))).toBe(false);
    expect(await holds(() => (press(toolbar), layer("dialog")))).toBe(false);
    // A press on a control, then somewhere that is no dialog.
    expect(await holds(() => (press(share), layer("plain")))).toBe(false);

    // A <dialog> already in the page but closed, which a control then opens, is the press's.
    const settings = document.createElement("dialog");
    settings.tabIndex = -1;
    document.body.append(settings);
    mounted.push(settings);
    expect(await holds(() => (press(share), settings.showModal(), settings.focus(), settings))).toBe(true);

    // A dialog that was open before the press, as a chat panel beside the call: Tab into it lends nothing.
    const chat = document.createElement("div");
    chat.setAttribute("role", "dialog");
    chat.tabIndex = -1;
    document.body.append(chat);
    mounted.push(chat);
    expect(await holds(() => (share.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })), chat.focus()))).toBe(false);
    // A dialog that opens only after the press's rest has ended is not the press's.
    await act(async () => void press(share));
    await wait(1000);
    expect(isHidden(toolbar)).toBe(true);
    await act(async () => void layer("dialog"));
    await point(picture, "pointermove", (x += 1), 40);
    await wait(1000);
    expect(isHidden(toolbar)).toBe(true);

    // The hold lasts while the layer is open, wherever focus goes, and ends when it closes; the
    // same layer opening again later, on its own, lends nothing.
    await point(picture, "pointermove", (x += 1), 40);
    let picker!: HTMLElement;
    await act(async () => void (press(share), (picker = layer("popover"))));
    await act(async () => chat.focus());
    await wait(3000);
    expect(isHidden(toolbar)).toBe(false);
    await act(async () => picker.hidePopover());
    await wait(1000);
    expect(isHidden(toolbar)).toBe(true);
    await point(picture, "pointermove", (x += 1), 40);
    await act(async () => (picker.showPopover(), picker.focus()));
    await wait(1000);
    expect(isHidden(toolbar)).toBe(true);
  });

  it("takes its area from autoHideArea, an element or a ref, in either layout", async () => {
    // A stage that is itself absolutely placed beside a side panel: the default widens to the whole app.
    function App({ named }: { named: boolean }) {
      const stage = useRef<HTMLDivElement>(null);
      return (
        <div style={{ position: "relative", height: 200 }}>
          <div data-side="" style={{ width: 100, height: 200 }} />
          <div ref={stage} data-call="" style={{ position: "absolute", insetBlock: 0, insetInlineStart: 100, insetInlineEnd: 0 }}>
            <div data-tile="" style={{ height: 120 }} />
            <div style={{ position: "absolute", insetInline: 0, bottom: 0, display: "flex", justifyContent: "center" }}>
              <Toolbar label={`Call controls ${named}`} autoHide={1000} autoHideArea={named ? stage : undefined} items={controls} />
            </div>
          </div>
        </div>
      );
    }
    for (const named of [false, true]) {
      const { toolbar, host } = await render(<App named={named} />);
      await wait(1000);
      await point(host.querySelector("[data-side]")!, "pointermove", 50 + Number(named), 50);
      expect(isHidden(toolbar)).toBe(named);
      await point(host.querySelector("[data-tile]")!, "pointermove", 52 + Number(named), 50);
      expect(isHidden(toolbar)).toBe(false);
    }

    // A positioned box between the bar and the stage: the default narrows to that box.
    function Anchored({ named }: { named: boolean | "empty" }) {
      const [stage, setStage] = useState<HTMLDivElement | null>(null);
      return (
        <div ref={setStage} style={{ position: "relative", height: 200 }}>
          <div data-tile="" style={{ height: 120 }} />
          <div style={{ position: "absolute", insetInline: 0, bottom: 0, display: "flex", justifyContent: "center" }}>
            <span style={{ position: "relative" }}>
              <Toolbar label={`Call controls ${named}`} autoHide={1000} autoHideArea={named === "empty" ? { current: null } : named ? stage : undefined} items={controls} />
            </span>
          </div>
        </div>
      );
    }
    for (const named of [false, "empty", true] as const) {
      const { toolbar, host } = await render(<Anchored named={named} />);
      await wait(1000);
      await point(host.querySelector("[data-tile]")!, "pointermove", 60 + String(named).length, 50);
      expect(isHidden(toolbar)).toBe(named !== true);
    }
  });

  it("comes back for a pointer move over its offset parent only, or anywhere when it has none", async () => {
    const positioned = await render(<Toolbar label="Call controls" autoHide={1000} items={controls} />);
    await wait(1000);
    await point(positioned.away, "pointermove", 80, 80);
    await point(positioned.away, "pointerdown", 81, 80);
    expect(isHidden(positioned.toolbar)).toBe(true);
    await point(positioned.picture, "pointermove", 82, 80);
    expect(isHidden(positioned.toolbar)).toBe(false);

    // With no positioned ancestor, the offset parent is the body: the whole page counts, below the body too.
    const loose = await render(<Toolbar label="Call controls" autoHide={1000} items={controls} />, "static");
    expect(loose.toolbar.offsetParent).toBe(document.body);
    await wait(1000);
    await point(document.documentElement, "pointermove", 90, 90);
    expect(isHidden(loose.toolbar)).toBe(false);

    // A fixed bar has none.
    const fixed = await render(<Toolbar label="Call controls" autoHide={1000} items={controls} className="fixed bottom-0" />);
    expect(fixed.toolbar.offsetParent).toBeNull();
    await wait(1000);
    await point(fixed.away, "pointermove", 100, 100);
    expect(isHidden(fixed.toolbar)).toBe(false);
  });

  it("looks past an absolutely placed or fixed wrapper to the stage it floats over", async () => {
    const wrapped = (position: "absolute" | "fixed") => (
      <div style={{ position, insetInline: 0, bottom: 8, display: "flex", justifyContent: "center" }}>
        <Toolbar label={`Call controls ${position}`} autoHide={1000} items={controls} />
      </div>
    );
    const absolute = await render(wrapped("absolute"));
    await wait(1000);
    await point(absolute.away, "pointermove", 140, 140);
    expect(isHidden(absolute.toolbar)).toBe(true);
    await point(absolute.picture, "pointermove", 141, 140);
    expect(isHidden(absolute.toolbar)).toBe(false);

    const fixed = await render(wrapped("fixed"));
    await wait(1000);
    await point(fixed.away, "pointermove", 150, 150);
    expect(isHidden(fixed.toolbar)).toBe(false);
  });

  it("finds its area again each time it fades, so a changed layout counts", async () => {
    const { toolbar, away, host } = await render(<Toolbar label="Call controls" autoHide={1000} items={controls} />);
    host.querySelector<HTMLElement>("[data-stage]")!.style.position = "static";
    await wait(1000);
    await point(away, "pointermove", 160, 160);
    expect(isHidden(toolbar)).toBe(false);
  });

  it("drops the glass's blur once it has faded, and has it back as soon as it shows", async () => {
    const { toolbar, picture } = await render(<Toolbar label="Call controls" floating autoHide={1000} items={controls} />);
    // When the blur goes, the fade must be over: record whether any fade was still running then.
    const early: number[] = [];
    const observer = new MutationObserver(() => {
      if (toolbar.classList.contains("backdrop-blur-none")) early.push(toolbar.getAnimations().length);
    });
    observer.observe(toolbar, { attributeFilter: ["class"] });
    try {
      const blur = getComputedStyle(toolbar).backdropFilter;
      expect(blur).toMatch(/^blur\(/);
      await wait(1000);
      expect(getComputedStyle(toolbar).backdropFilter).toBe(blur);
      await expect.poll(() => getComputedStyle(toolbar).backdropFilter).toBe("none");
      await point(picture, "pointermove", 110, 110);
      expect(getComputedStyle(toolbar).backdropFilter).toBe(blur);
      await fadeDone(toolbar);
      // A bar that shows again in the middle of its fade keeps its blur, and fades with it next time.
      await wait(1000);
      // Hold the fade part way, so the bar shows again before it ends.
      const [fade] = toolbar.getAnimations();
      fade!.pause();
      await point(picture, "pointermove", 111, 110);
      await act(async () => fadeDone(toolbar));
      await act(async () => {});
      expect(getComputedStyle(toolbar).backdropFilter).toBe(blur);
      await wait(1000);
      expect(getComputedStyle(toolbar).backdropFilter).toBe(blur);
      await expect.poll(() => getComputedStyle(toolbar).backdropFilter).toBe("none");
      expect(early).toEqual([0, 0]);
    } finally {
      observer.disconnect();
    }
  });

  it("reports each fade and return to onHiddenChange, once each", async () => {
    const onHiddenChange = vi.fn();
    const { picture, rerender } = await render(<Toolbar label="Call controls" autoHide={1000} onHiddenChange={onHiddenChange} items={controls} />);
    expect(onHiddenChange).not.toHaveBeenCalled();
    // A move while it shows is no return.
    await point(picture, "pointermove", 119, 120);
    expect(onHiddenChange).not.toHaveBeenCalled();
    await wait(1000);
    expect(onHiddenChange.mock.calls).toEqual([[true]]);
    await point(picture, "pointermove", 120, 120);
    await point(picture, "pointermove", 121, 120);
    expect(onHiddenChange.mock.calls).toEqual([[true], [false]]);
    // A new callback is not a change.
    const next = vi.fn();
    await rerender(<Toolbar label="Call controls" autoHide={1000} onHiddenChange={next} items={controls} />);
    expect(next).not.toHaveBeenCalled();
    await wait(1000);
    expect(next.mock.calls).toEqual([[true]]);
  });

  it("comes back for a move right after it fades, before it renders", async () => {
    const onHiddenChange = vi.fn();
    const { toolbar, picture } = await render(<Toolbar label="Call controls" autoHide={1000} onHiddenChange={onHiddenChange} items={controls} />);
    await act(async () => {
      vi.advanceTimersByTime(1000);
      picture.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 125, clientY: 125 }));
    });
    expect(isHidden(toolbar)).toBe(false);
    expect(onHiddenChange.mock.calls).toEqual([[true], [false]]);
  });

  it("shows, and stays, when autoHide is turned off", async () => {
    const onHiddenChange = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { toolbar, picture, rerender } = await render(<Toolbar label="Call controls" autoHide={1000} onHiddenChange={onHiddenChange} items={controls} />);
    await wait(1000);
    expect(isHidden(toolbar)).toBe(true);
    await rerender(<Toolbar label="Call controls" onHiddenChange={onHiddenChange} items={controls} />);
    expect(warn.mock.calls.map((call) => String(call[0]))).toEqual([
      "[ouro-ui] Toolbar: onHiddenChange is never called without autoHide. Fix: <Toolbar autoHide={3000} onHiddenChange={…}>.",
    ]);
    expect(isHidden(toolbar)).toBe(false);
    expect(toolbar.hasAttribute("inert")).toBe(false);
    expect(onHiddenChange.mock.calls).toEqual([[true], [false]]);
    // No listener or timer is left behind.
    await point(picture, "pointermove", 130, 130);
    await point(picture, "pointerdown", 131, 130);
    await wait(5000);
    expect(isHidden(toolbar)).toBe(false);
  });

  it("starts a new rest when autoHide changes", async () => {
    const { toolbar, rerender } = await render(<Toolbar label="Call controls" autoHide={1000} items={controls} />);
    await wait(600);
    await rerender(<Toolbar label="Call controls" autoHide={2000} items={controls} />);
    await wait(1999);
    expect(isHidden(toolbar)).toBe(false);
    await wait(1);
    expect(isHidden(toolbar)).toBe(true);
  });

  it("leaves no rest running once it is gone", async () => {
    const onHiddenChange = vi.fn();
    const { rerender } = await render(<Toolbar label="Call controls" autoHide={1000} onHiddenChange={onHiddenChange} items={controls} />);
    await wait(600);
    await rerender(null);
    await wait(1000);
    expect(onHiddenChange).not.toHaveBeenCalled();
  });

  it.each<[string, unknown]>([
    ["zero", 0],
    ["a negative time", -1],
    ["infinity", Infinity],
    ["true", true],
  ])("never fades for %s", async (_case, autoHide) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { toolbar } = await render(<Toolbar label="Call controls" autoHide={autoHide as number} items={controls} />);
    await wait(10_000);
    expect(isHidden(toolbar)).toBe(false);
    expect(parseDuration(getComputedStyle(toolbar).transitionDuration)).toBe(0);
  });
});

describe("Toolbar hidden", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  it("fades and comes back through onHiddenChange, and shows only what the app sets", async () => {
    const onHiddenChange = vi.fn();
    const bar = (hidden: boolean) => <Toolbar label="Call controls" autoHide={1000} hidden={hidden} onHiddenChange={onHiddenChange} items={controls} />;
    const { toolbar, picture, rerender } = await render(bar(false));
    await wait(1000);
    // It asks to fade, and stays until the app says so.
    expect(onHiddenChange.mock.calls).toEqual([[true]]);
    expect(isHidden(toolbar)).toBe(false);
    await rerender(bar(true));
    expect(isHidden(toolbar)).toBe(true);
    expect(onHiddenChange.mock.calls).toEqual([[true]]);
    // A move asks, once, to come back, and it comes back when the app says so.
    await point(picture, "pointermove", 170, 170);
    await point(picture, "pointermove", 171, 170);
    expect(onHiddenChange.mock.calls).toEqual([[true], [false]]);
    expect(isHidden(toolbar)).toBe(true);
    await rerender(bar(false));
    expect(isHidden(toolbar)).toBe(false);
    // An app that leaves it shown hears each ask in turn.
    await wait(1000);
    await point(picture, "pointermove", 172, 170);
    expect(onHiddenChange.mock.calls).toEqual([[true], [false], [true], [false]]);
    expect(isHidden(toolbar)).toBe(false);
  });

  it("shows when the app sets hidden to false for its own shortcut, and fades after a new rest", async () => {
    // A calling app: ⇧⌘M mutes, and shows the controls so the person sees it worked.
    function Call() {
      const [hidden, setHidden] = useState(false);
      useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
          if (event.shiftKey && event.metaKey && event.key.toLowerCase() === "m") setHidden(false);
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
      }, []);
      return <Toolbar label="Call controls" autoHide={1000} hidden={hidden} onHiddenChange={setHidden} items={iconControls} />;
    }
    const { toolbar } = await render(<Call />, "positioned", <input aria-label="Chat" data-test-harness="" />);
    await wait(1000);
    expect(isHidden(toolbar)).toBe(true);
    await userEvent.click(page.getByRole("textbox", { name: "Chat" }));
    await wait(1000);
    expect(isHidden(toolbar)).toBe(true);
    // Typing in the chat never shows it.
    await userEvent.keyboard("Mute me at noon{Enter}");
    expect(isHidden(toolbar)).toBe(true);
    // The app's own shortcut does, and a new rest starts.
    await userEvent.keyboard("{Shift>}{Meta>}m{/Meta}{/Shift}");
    expect(isHidden(toolbar)).toBe(false);
    await wait(999);
    expect(isHidden(toolbar)).toBe(false);
    await wait(1);
    expect(isHidden(toolbar)).toBe(true);
  });

  it("does nothing without autoHide", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { toolbar } = await render(<Toolbar label="Call controls" hidden onHiddenChange={() => {}} items={controls} />);
    await wait(5000);
    expect(isHidden(toolbar)).toBe(false);
    expect(parseDuration(getComputedStyle(toolbar).transitionDuration)).toBe(0);
  });
});

describe("Toolbar floating and autoHide development messages", () => {
  it.each<[string, Partial<Record<string, unknown>>, string]>([
    ["an autoHide that is no time", { autoHide: true }, "[ouro-ui] Toolbar: autoHide={true} is not a time in milliseconds. Fix: <Toolbar autoHide={3000}>."],
    ["an autoHide of zero", { autoHide: 0 }, "[ouro-ui] Toolbar: autoHide={0} is not a time in milliseconds. Fix: <Toolbar autoHide={3000}>."],
    [
      "onHiddenChange without autoHide",
      { onHiddenChange: () => {} },
      "[ouro-ui] Toolbar: onHiddenChange is never called without autoHide. Fix: <Toolbar autoHide={3000} onHiddenChange={…}>.",
    ],
    ["glass", { glass: true }, "[ouro-ui] Toolbar: glass is not a prop. Fix: <Toolbar floating>."],
    [
      "autoHideArea without autoHide",
      { autoHideArea: document.body },
      "[ouro-ui] Toolbar: autoHideArea does nothing without autoHide. Fix: <Toolbar autoHide={3000} autoHideArea={stageRef}>.",
    ],
    ["area", { area: document.body }, "[ouro-ui] Toolbar: area is not a prop. Fix: <Toolbar autoHide={3000} autoHideArea={stageRef}>."],
    ["hidden without autoHide", { hidden: false }, "[ouro-ui] Toolbar: hidden does nothing without autoHide. Fix: <Toolbar autoHide={3000} hidden={hidden} onHiddenChange={setHidden}>."],
    [
      "hidden without onHiddenChange",
      { autoHide: 3000, hidden: false },
      "[ouro-ui] Toolbar: hidden without onHiddenChange never fades or comes back on its own. Fix: <Toolbar autoHide={3000} hidden={hidden} onHiddenChange={setHidden}>.",
    ],
    ["visible", { visible: true }, "[ouro-ui] Toolbar: visible is not a prop; control the bar with hidden. Fix: <Toolbar autoHide={3000} hidden={hidden} onHiddenChange={setHidden}>."],
    ["autoHideDuration", { autoHideDuration: 3000 }, "[ouro-ui] Toolbar: autoHideDuration is not a prop; autoHide takes the milliseconds. Fix: <Toolbar autoHide={3000}>."],
  ])("names the fix for %s", async (_case, extra, message) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await render(<Toolbar {...({ label: "Call controls", items: controls, ...extra } as ToolbarProps)} />);
    expect(warn.mock.calls.map((call) => String(call[0]))).toEqual([message]);
  });

  it("is quiet for a floating bar that hides", async () => {
    const warn = vi.spyOn(console, "warn");
    await render(<Toolbar label="Call controls" floating autoHide={3000} onHiddenChange={() => {}} items={controls} />);
    await render(<Toolbar label="Call controls" floating autoHide={3000} hidden={false} onHiddenChange={() => {}} items={controls} />);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("Toolbar floating server rendering", () => {
  it("renders the glass bar shown on the server and hydrates with no warning", async () => {
    const error = vi.spyOn(console, "error");
    const node = <Toolbar label="Call controls" floating autoHide={3000} items={controls} />;
    const html = renderToString(node);
    const host = document.createElement("div");
    host.innerHTML = html;
    const bar = host.firstElementChild!;
    expect(bar.getAttribute("data-ouro")).toBe("toolbar");
    expect(bar.hasAttribute("data-hidden")).toBe(false);
    expect(bar.classList.contains("backdrop-blur-xl")).toBe(true);
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
  });
});
