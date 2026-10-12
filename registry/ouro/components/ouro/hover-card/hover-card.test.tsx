import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { HoverCard, type HoverCardProps } from "@/registry/ouro/components/ouro/hover-card/hover-card";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

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

  it("fades without scaling under reduced motion", async () => {
    await commands.emulateMedia({ reducedMotion: "reduce" });
    await renderCard();
    await userEvent.hover(link());
    expect(getComputedStyle(await shown()).transitionProperty).toBe("opacity");
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

  it("warns about an appearance class", async () => {
    await renderCard({ className: "mt-2 bg-white" });
    expect(warnings()).toEqual([
      '[ouro-ui] HoverCard: "bg-white" sets appearance, and className is for layout only. Fix: :root { --popover: …; } .dark { --popover: …; }.',
    ]);
  });
});
