import { type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { Toolbar, type ToolbarEntry, type ToolbarProps } from "@/registry/ouro/components/ouro/toolbar/toolbar";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { parseDuration } from "@/registry/ouro/lib/ouro/testing/motion";
import { pageCss } from "@/registry/ouro/lib/ouro/testing/page-css";
import { pressTab } from "@/registry/ouro/lib/ouro/testing/tab";

const roots: Root[] = [];
let mounted: Element[] = [];

const controls: ToolbarEntry[] = [{ type: "toggle", label: "Mute" }, { label: "Share" }, { type: "separator" }, { label: "Leave" }];

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

  it("turns solid with a defined border with prefers-contrast: more", async () => {
    const { toolbar } = await render(<Toolbar label="Call controls" floating items={controls} />);
    expect(getComputedStyle(toolbar).borderTopWidth).toBe("0px");
    await commands.emulateMedia({ contrast: "more" });
    try {
      const style = getComputedStyle(toolbar);
      expect(style.backgroundColor).toBe(computedBackground("var(--card)"));
      expect(style.backdropFilter).toBe("none");
      expect(style.borderTopWidth).toBe("2px");
      expect(style.borderTopStyle).toBe("solid");
      expect(style.borderTopColor).toBe(style.color);
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
    expect(getComputedStyle(toolbar).transitionProperty).toBe("opacity");
    expect(parseDuration(getComputedStyle(toolbar).transitionDuration)).toBe(token("--ouro-duration-slow"));
    await wait(1000);
    expect(toolbar.getAnimations().map((animation) => (animation as CSSTransition).transitionProperty)).toEqual(["opacity"]);
    await fadeDone(toolbar);
    await commands.emulateMedia({ reducedMotion: "reduce" });
    try {
      expect(parseDuration(getComputedStyle(toolbar).transitionDuration)).toBe(token("--ouro-duration-fast"));
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

  it("stays while focus is inside it", async () => {
    const { toolbar, host } = await render(
      <>
        <Toolbar label="Call controls" autoHide={1000} items={controls} />
        <button type="button" data-test-harness="">
          Notes
        </button>
      </>,
    );
    await act(async () => page.getByRole("button", { name: "Share" }).element().focus());
    await wait(4000);
    expect(isHidden(toolbar)).toBe(false);
    await act(async () => host.querySelector<HTMLElement>("[data-test-harness]")!.focus());
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
    await act(async () => (document.activeElement as HTMLElement).blur());
    // The More button's tooltip, which its focus showed, closes on its own clock.
    await expect.poll(() => toolbar.querySelector("[data-popup-open], [aria-expanded='true']")).toBeNull();
    await point(picture, "pointermove", 50, 50);
    await wait(1000);
    expect(isHidden(toolbar)).toBe(true);
  });

  it("stays after a key until the pointer moves again", async () => {
    const { toolbar, picture } = await render(<Toolbar label="Call controls" autoHide={1000} items={controls} />);
    await wait(1000);
    expect(isHidden(toolbar)).toBe(true);
    await userEvent.keyboard("{Shift}");
    expect(isHidden(toolbar)).toBe(false);
    await wait(600);
    await userEvent.keyboard("{Shift}");
    await wait(5000);
    expect(isHidden(toolbar)).toBe(false);
    await point(picture, "pointermove", 60, 60);
    await wait(1000);
    expect(isHidden(toolbar)).toBe(true);
  });

  it("is hidden from screen readers and unfocusable while faded, and Tab brings it back first", async () => {
    const { toolbar } = await render(
      <Toolbar label="Call controls" autoHide={1000} items={controls} />,
      "positioned",
      <button type="button" data-test-harness="">
        Before
      </button>,
    );
    expect(toolbar.hasAttribute("aria-hidden")).toBe(false);
    expect(toolbar.hasAttribute("inert")).toBe(false);
    await wait(1000);
    expect(toolbar.getAttribute("aria-hidden")).toBe("true");
    expect(toolbar.hasAttribute("inert")).toBe(true);
    expect(page.getByRole("toolbar").query()).toBeNull();
    page.getByRole("button", { name: "Before" }).element().focus();
    await pressTab();
    expect(isHidden(toolbar)).toBe(false);
    expect(toolbar.hasAttribute("aria-hidden")).toBe(false);
    expect(document.activeElement).toBe(page.getByRole("button", { name: "Mute" }).element());
  });

  it("comes back for an event that something inside its area stops", async () => {
    const { toolbar, picture } = await render(<Toolbar label="Call controls" autoHide={1000} items={controls} />);
    for (const type of ["pointermove", "pointerdown", "keydown"]) picture.addEventListener(type, (event) => event.stopPropagation());
    for (const [index, type] of (["pointermove", "pointerdown"] as const).entries()) {
      await wait(1000);
      expect(isHidden(toolbar)).toBe(true);
      await point(picture, type, 70 + index, 70);
      expect(isHidden(toolbar)).toBe(false);
    }
    await wait(1000);
    picture.tabIndex = -1;
    picture.focus();
    await userEvent.keyboard("{Shift}");
    expect(isHidden(toolbar)).toBe(false);
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
    ["autoHideDuration", { autoHideDuration: 3000 }, "[ouro-ui] Toolbar: autoHideDuration is not a prop; autoHide takes the milliseconds. Fix: <Toolbar autoHide={3000}>."],
  ])("names the fix for %s", async (_case, extra, message) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await render(<Toolbar {...({ label: "Call controls", items: controls, ...extra } as ToolbarProps)} />);
    expect(warn.mock.calls.map((call) => String(call[0]))).toEqual([message]);
  });

  it("is quiet for a floating bar that hides", async () => {
    const warn = vi.spyOn(console, "warn");
    await render(<Toolbar label="Call controls" floating autoHide={3000} onHiddenChange={() => {}} items={controls} />);
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
    expect(["data-hidden", "aria-hidden", "inert"].filter((name) => bar.hasAttribute(name))).toEqual([]);
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
