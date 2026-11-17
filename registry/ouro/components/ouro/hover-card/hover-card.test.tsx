import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { HoverCard, type HoverCardProps } from "@/registry/ouro/components/ouro/hover-card/hover-card";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { drawn, expectFirstFramesInPlace, placeFarBelow, recordPopupFrames } from "@/registry/ouro/lib/ouro/testing/popup-frames";
import { settled as settledBox } from "@/registry/ouro/lib/ouro/testing/settled";
import { pressTab } from "@/registry/ouro/lib/ouro/testing/tab";
// Runs in Chromium and WebKit, which can both hover.

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.padding = "120px 400px";
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
  await userEvent.unhover(document.body);
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
  await commands.emulateMedia({ reducedMotion: "no-preference" });
});

const warnings = () => warn.mock.calls.map((call: unknown[]) => call[0]);
const card = () => document.querySelector<HTMLElement>('[data-ouro="hover-card"]');
const link = () => document.querySelector<HTMLElement>("a")!;

async function shown() {
  await expect
    .poll(() => {
      const element = card();
      return Boolean(element && !element.hasAttribute("data-starting-style") && element.getAnimations().length === 0);
    })
    .toBe(true);
  return card()!;
}

async function renderCard(props: Partial<HoverCardProps> = {}) {
  return render(
    <HoverCard trigger={<a href="#cooks/ari">Ari Mendelow</a>} {...(props as object)}>
      {props.children ?? "Cooks mostly Persian food. 42 recipes."}
    </HoverCard>,
  );
}

describe("HoverCard", () => {
  it("shows a preview below the link on hover, and hides it when the pointer leaves", async () => {
    await renderCard();
    await userEvent.hover(link());
    const element = await shown();
    expect(element.textContent).toBe("Cooks mostly Persian food. 42 recipes.");
    const box = element.getBoundingClientRect();
    const anchor = link().getBoundingClientRect();
    // An inline link's bottom edge can be fractional, and the popup lands on a whole pixel.
    expect(Math.abs(box.top - anchor.bottom - 8)).toBeLessThanOrEqual(1);
    expect(box.width).toBe(288);
    await userEvent.unhover(link());
    await expect.poll(() => card()).toBeNull();
  });

  it("opens on mouse hover after a touch elsewhere, as on an iPad with a trackpad", async () => {
    await render(
      <>
        <button type="button">Other</button>
        <HoverCard trigger={<a href="#cooks/ari">Ari Mendelow</a>}>Preview</HoverCard>
      </>,
    );
    const other = document.querySelector("button")!;
    await act(() => other.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "touch", bubbles: true })));
    await userEvent.hover(link());
    await shown();
  });

  it("shows on keyboard focus", async () => {
    await renderCard();
    // Focus from the keyboard (WebKit's Tab skips links by default).
    await userEvent.keyboard("{Shift}");
    await act(async () => link().focus());
    await shown();
  });

  it("sits on the side and alignment it is given, and className sets layout", async () => {
    await renderCard({ side: "top", align: "start", className: "w-96" });
    await userEvent.hover(link());
    const element = await shown();
    expect(element.getAttribute("data-side")).toBe("top");
    expect(element.getAttribute("data-align")).toBe("start");
    expect(element.getBoundingClientRect().width).toBe(384);
  });

  it("portals at the --ouro-layer level, as its own stacking context", async () => {
    await renderCard();
    await userEvent.hover(link());
    await shown();
    const style = getComputedStyle(document.querySelector<HTMLElement>('[data-ouro="hover-card-portal"]')!);
    expect(style.position).toBe("relative");
    expect(style.isolation).toBe("isolate");
    expect(style.zIndex).toBe(getComputedStyle(document.documentElement).getPropertyValue("--ouro-layer").trim());
  });

  it("grows from the point Base UI computes next to its link", async () => {
    await renderCard();
    await userEvent.hover(link());
    const element = await shown();
    element.style.setProperty("--transform-origin", "7px 3px");
    expect(getComputedStyle(element).transformOrigin).toBe("7px 3px");
  });

  it("keeps the card where it is placed while its link is pressed", async () => {
    await renderCard();
    await userEvent.hover(link());
    await shown();
    const positioner = () => document.querySelector<HTMLElement>('[data-ouro="hover-card-positioner"]')!;
    const rest = JSON.stringify(positioner().getBoundingClientRect());
    const anchor = JSON.stringify(link().getBoundingClientRect());
    link().setAttribute("data-probe-target", "");
    await commands.pointerPress({ selector: "[data-probe-target]", action: "down" });
    try {
      await expect.poll(() => link().matches(":active") && link().getAnimations().length === 0).toBe(true);
      expect(getComputedStyle(link()).scale).toBe("none");
      expect(JSON.stringify(link().getBoundingClientRect())).toBe(anchor);
      expect(JSON.stringify(positioner().getBoundingClientRect())).toBe(rest);
      // A close asked for on the press would run in a task of its own: let it, then the card is still open.
      await act(async () => new Promise((resolve) => setTimeout(resolve)));
      expect(card()).not.toBeNull();
      expect(card()!.hasAttribute("data-ending-style")).toBe(false);
      expect(link().hasAttribute("data-popup-open")).toBe(true);
    } finally {
      await commands.pointerPress({ selector: "[data-probe-target]", action: "up" });
    }
  });

  it("fades without scaling under reduced motion", async () => {
    await commands.emulateMedia({ reducedMotion: "reduce" });
    await renderCard();
    await userEvent.hover(link());
    expect(getComputedStyle(await shown()).transitionProperty).toBe("opacity");
  });

  it("mounts no card until the link is hovered, and keeps the link's own element as it arms", async () => {
    await renderCard();
    const before = link();
    expect(document.querySelector('[data-ouro="hover-card-portal"]')).toBeNull();
    await userEvent.hover(before);
    await shown();
    expect(link()).toBe(before);
    expect(before.hasAttribute("data-popup-open")).toBe(true);
  });

  it("keeps focus on the link as keyboard focus arms the card", async () => {
    await render(
      <>
        <button type="button">Before</button>
        <HoverCard trigger={<a href="#cooks/ari">Ari Mendelow</a>}>Preview</HoverCard>
      </>,
    );
    await act(async () => (page.getByRole("button", { name: "Before" }).element() as HTMLElement).focus());
    await pressTab();
    const focused = link();
    expect(document.activeElement).toBe(focused);
    await shown();
    expect(document.activeElement).toBe(focused);
    expect(link()).toBe(focused);
  });

  it("stays open while the pointer crosses onto the card, and closes once it leaves both", async () => {
    await renderCard();
    await userEvent.hover(link());
    const element = await shown();
    // The page's clock held, so the card's close delay runs out only when the test says.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      await userEvent.hover(element);
      await act(async () => vi.advanceTimersByTime(1000));
      expect(link().hasAttribute("data-popup-open")).toBe(true);
      // And back onto the link, and onto the card again.
      await userEvent.hover(link());
      await act(async () => vi.advanceTimersByTime(1000));
      expect(link().hasAttribute("data-popup-open")).toBe(true);
      await userEvent.hover(element);
      await userEvent.unhover(element);
      await act(async () => vi.advanceTimersByTime(1000));
    } finally {
      vi.useRealTimers();
    }
    await expect.poll(() => card()).toBeNull();
  });

  it("opens on neither a focus the keyboard did not make nor one it left before the delay ran out", async () => {
    await render(
      <>
        <button type="button">Before</button>
        <HoverCard trigger={<a href="#cooks/ari">Ari Mendelow</a>}>Preview</HoverCard>
      </>,
    );
    await userEvent.click(page.getByRole("button", { name: "Before" }));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      // Focus a click or a script gave, not the keyboard.
      await act(async () => link().focus());
      await act(async () => vi.advanceTimersByTime(1000));
      expect(link().hasAttribute("data-popup-open")).toBe(false);
      await act(async () => link().blur());
      // Keyboard focus that leaves before the card's delay runs out.
      await userEvent.keyboard("{Shift}");
      await act(async () => link().focus());
      await act(async () => link().blur());
      await act(async () => vi.advanceTimersByTime(1000));
      expect(link().hasAttribute("data-popup-open")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("never opens after a touch on the link, even when the touch focuses it", async () => {
    await renderCard();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      await act(() => link().dispatchEvent(new PointerEvent("pointerdown", { pointerType: "touch", bubbles: true })));
      await act(async () => link().focus({ focusVisible: true } as FocusOptions));
      await act(async () => vi.advanceTimersByTime(1000));
      expect(link().hasAttribute("data-popup-open")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("closes on a press outside it and its link", async () => {
    await render(
      <>
        {/* Above the link, clear of the card under it, and keeps focus where it is when pressed, so only the press can
            close the card. */}
        <p data-press-outside="" onMouseDown={(event) => event.preventDefault()}>
          Elsewhere
        </p>
        <button type="button">Before</button>
        <HoverCard trigger={<a href="#cooks/ari">Ari Mendelow</a>}>Preview</HoverCard>
      </>,
    );
    await act(async () => (page.getByRole("button", { name: "Before" }).element() as HTMLElement).focus());
    await pressTab();
    await shown();
    await commands.pointerPress({ selector: "[data-press-outside]", action: "click" });
    expect(document.activeElement).toBe(link());
    await expect.poll(() => card()).toBeNull();
  });

  it("closes on Escape and when focus leaves the link", async () => {
    await render(
      <>
        <button type="button">Before</button>
        <HoverCard trigger={<a href="#cooks/ari">Ari Mendelow</a>}>Preview</HoverCard>
        <button type="button">After</button>
      </>,
    );
    const before = page.getByRole("button", { name: "Before" }).element() as HTMLElement;
    await act(async () => before.focus());
    await pressTab();
    expect(document.activeElement).toBe(link());
    await shown();
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => card()).toBeNull();
    await pressTab({ shift: true });
    await pressTab();
    await shown();
    await pressTab();
    await expect.poll(() => card()).toBeNull();
  });

  it("takes the first Escape itself, so what holds the link sees only the next", async () => {
    const seen: string[] = [];
    await render(
      <div onKeyDown={(event) => seen.push(event.key)}>
        <button type="button">Before</button>
        <HoverCard trigger={<a href="#cooks/ari" onKeyDown={(event) => seen.push(`link ${event.key}`)}>Ari Mendelow</a>}>Preview</HoverCard>
      </div>,
    );
    await act(async () => (page.getByRole("button", { name: "Before" }).element() as HTMLElement).focus());
    await pressTab();
    seen.length = 0;
    await shown();
    // Any other key goes on to what holds the link, and leaves the card open.
    await userEvent.keyboard("{Shift}");
    expect(seen).toEqual(["link Shift", "Shift"]);
    expect(card()).not.toBeNull();
    seen.length = 0;
    // The Escape the card takes is marked handled, as Base UI marks it, so a listener that checks for that skips it.
    const keys: KeyboardEvent[] = [];
    const record = (event: KeyboardEvent) => keys.push(event);
    document.addEventListener("keydown", record, true);
    try {
      await userEvent.keyboard("{Escape}");
    } finally {
      document.removeEventListener("keydown", record, true);
    }
    await expect.poll(() => card()).toBeNull();
    expect(seen).toEqual(["link Escape"]);
    expect(keys.map((event) => event.defaultPrevented)).toEqual([true]);
    await userEvent.keyboard("{Escape}");
    expect(seen).toEqual(["link Escape", "link Escape", "Escape"]);
  });

  it("opens no card when the pointer leaves the link before it rests there, and passes the link's own handlers on", async () => {
    const seen: string[] = [];
    await render(
      <HoverCard
        trigger={
          <a
            href="#cooks/ari"
            onPointerEnter={() => seen.push("enter")}
            onPointerLeave={() => seen.push("leave")}
            onFocus={() => seen.push("focus")}
            onBlur={() => seen.push("blur")}
          >
            Ari Mendelow
          </a>
        }
      >
        Preview
      </HoverCard>,
    );
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      await userEvent.hover(link());
      await userEvent.unhover(link());
      await act(async () => vi.advanceTimersByTime(1000));
      expect(card()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
    await act(async () => link().focus());
    await act(async () => link().blur());
    expect(seen).toEqual(["enter", "leave", "focus", "blur"]);
  });

  it("renders only the link on the server", () => {
    const html = renderToString(
      <HoverCard trigger={<a href="/cooks/ari">Ari</a>}>Preview</HoverCard>,
    );
    expect(html).toContain('href="/cooks/ari"');
    expect(html).not.toContain("Preview");
  });
});

describe("HoverCard dev messages", () => {
  it("warns when the trigger is not a link", async () => {
    await render(<HoverCard trigger={<button type="button">Ari</button>}>Preview</HoverCard>);
    expect(warnings()).toEqual([
      '[ouro-ui] HoverCard: the trigger is not a link; a hover card previews where a link goes, and touch users get only the link. Fix: <HoverCard trigger={<Link href="/cooks/ari">Ari</Link>}>.',
    ]);
  });

  it("warns once about guessed props and renders the defaults for values that are not Ouro UI's", async () => {
    await renderCard({ openDelay: 0, closeDelay: 0, content: "x", side: "under", align: "left", placement: "top" } as object);
    await userEvent.hover(link());
    const element = await shown();
    expect(element.getAttribute("data-side")).toBe("bottom");
    expect(element.getAttribute("data-align")).toBe("center");
    expect(warnings()).toEqual([
      '[ouro-ui] HoverCard: side="under" is not a side; use "top", "bottom", "left", "right". Fix: <HoverCard side="bottom">.',
      '[ouro-ui] HoverCard: align="left" is not an alignment; use "start", "center", "end" (left is "start", right is "end"). Fix: <HoverCard align="start">.',
      '[ouro-ui] HoverCard: placement is not a prop; Ouro UI splits it into side and align. Fix: <HoverCard side="bottom" align="start">.',
      "[ouro-ui] HoverCard: openDelay is not a prop; Ouro UI sets the delays. Fix: <HoverCard trigger={…}>.",
      "[ouro-ui] HoverCard: closeDelay is not a prop; Ouro UI sets the delays. Fix: <HoverCard trigger={…}>.",
      '[ouro-ui] HoverCard: content is not a prop; the preview is children. Fix: <HoverCard trigger={…}>…</HoverCard>.',
    ]);
  });

  it("warns when its open card renders outside every landmark of a page that has a main", async () => {
    const main = document.body.appendChild(document.createElement("main"));
    mounted.push(main);
    await renderCard();
    await userEvent.hover(link());
    await shown();
    expect(warnings()).toEqual([
      "[ouro-ui] HoverCard: the open popup renders outside every landmark, so screen reader users who move by landmark miss it. Fix: <OuroProvider portalContainer={popups}> around the app, with <div ref={popups} /> inside <main>.",
    ]);
  });

  it("warns about an appearance class", async () => {
    await renderCard({ className: "mt-2 bg-white" });
    expect(warnings()).toEqual([
      '[ouro-ui] HoverCard: "bg-white" sets appearance, and className is for layout only. Fix: :root { --popover: …; } .dark { --popover: …; }.',
    ]);
  });
});

describe("HoverCard first frame", () => {
  const positioner = () => card()?.parentElement ?? null;

  it("is in place from its first visible frame when its link opens it", async () => {
    placeFarBelow();
    await renderCard();
    const recording = recordPopupFrames(positioner);
    await userEvent.hover(link());
    await settledBox(drawn(positioner));
    expectFirstFramesInPlace(recording.stop());
  });
});
