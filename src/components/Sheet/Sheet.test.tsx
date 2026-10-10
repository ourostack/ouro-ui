import distCss from "../../../dist/styles.css?raw";
import sheetCss from "./sheet.css?raw";
import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, server, userEvent } from "vitest/browser";
import { Button } from "../Button/Button.tsx";
import {
  SheetBackdrop,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHandle,
  SheetPopup,
  SheetPortal,
  SheetRoot,
  SheetTitle,
  SheetTrigger,
  SheetViewport,
} from "./parts.tsx";
import { Sheet, type SheetProps } from "./Sheet.tsx";

// Reads the built dist/styles.css, so run `pnpm build` first.
// Drag and velocity tests run in Chromium only (plan amendment): WebKit drag is covered
// by the recorded feel check. Everything else runs in Chromium and WebKit at 390x844.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FIX = "Pass trigger={<Button>…</Button>} for an uncontrolled sheet, or open and onOpenChange to control it.";
const chromiumOnly = it.skipIf(server.browser !== "chromium");

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return { host, rerender: (next: ReactNode) => act(async () => root.render(next)) };
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(async () => {
  await page.viewport(390, 844);
  const style = document.createElement("style");
  style.textContent = distCss;
  document.head.append(style);
  mounted.push(style);
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
  await commands.emulateMedia({ reducedMotion: "no-preference" });
});

const popup = () => document.querySelector<HTMLElement>('[data-ouro="sheet"]');
const backdrop = () => document.querySelector<HTMLElement>('[data-ouro="sheet-backdrop"]');
const viewport = () => document.querySelector<HTMLElement>('[data-ouro="sheet-viewport"]');
const trigger = () => document.querySelector<HTMLElement>('[data-ouro="button"]')!;

/** The popup's translation in px, from its computed transform (0 for `none`). */
function translation(element: HTMLElement): { x: number; y: number } {
  const transform = getComputedStyle(element).transform;
  if (transform === "none") return { x: 0, y: 0 };
  const matrix = new DOMMatrix(transform);
  return { x: matrix.m41, y: matrix.m42 };
}
const isIdentity = (element: HTMLElement) => {
  const { x, y } = translation(element);
  return Math.abs(x) < 0.5 && Math.abs(y) < 0.5;
};

/** Waits until the open sheet has finished its entrance: no starting style and a position that holds still. */
async function settled() {
  let last = Number.NaN;
  await expect
    .poll(
      () => {
        const sheet = popup();
        if (!sheet || sheet.hasAttribute("data-starting-style")) return false;
        const { y, x } = translation(sheet);
        const still = Math.abs(y + x - last) < 0.01;
        last = y + x;
        return still && getAnimations(sheet) === 0;
      },
      { timeout: 3000, interval: 50 },
    )
    .toBe(true);
}
const getAnimations = (element: HTMLElement) => element.getAnimations().length;

function Body() {
  return (
    <>
      <p style={{ margin: 0, height: 220 }}>Pick a cookbook for this recipe.</p>
      <label>
        Note <input aria-label="Note" />
      </label>
    </>
  );
}

async function openUncontrolled(props: Partial<SheetProps> = {}) {
  await render(
    <Sheet title="Save to cookbook" trigger={<Button>Save</Button>} {...(props as object)}>
      <Body />
    </Sheet>,
  );
  await userEvent.click(trigger());
  await settled();
  return popup()!;
}

/** Drags the sheet by its handle area (outside Drawer.Content, so a mouse drag swipes). */
async function dragSheet(dy: number, { durationMs = 600, steps = 12, hold = false } = {}) {
  const rect = popup()!.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + 10;
  await commands.drag({ from: [x, y], to: [x, y + dy], steps, durationMs, hold });
}

describe("opening and closing", () => {
  it("opens from the trigger as a dialog named by the title", async () => {
    await render(
      <Sheet title="Save to cookbook" trigger={<Button>Save</Button>}>
        <Body />
      </Sheet>,
    );
    expect(popup()).toBeNull();
    await userEvent.click(trigger());
    await expect.element(page.getByRole("dialog", { name: "Save to cookbook" })).toBeVisible();
    expect(popup()!.getAttribute("role")).toBe("dialog");
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    await openUncontrolled();
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => popup(), { timeout: 3000 }).toBeNull();
    await expect.poll(() => document.activeElement).toBe(trigger());
  });

  it("sits at the bottom edge, fits its content and keeps clear of the top", async () => {
    const sheet = await openUncontrolled();
    expect(isIdentity(sheet)).toBe(true);
    const rect = sheet.getBoundingClientRect();
    expect(Math.round(rect.bottom)).toBe(innerHeight);
    expect(rect.width).toBe(innerWidth);
    expect(rect.height).toBeLessThan(innerHeight / 2);
    expect(getComputedStyle(sheet).maxHeight).toBe(`${innerHeight - 32}px`);
  });

  it("is controlled with open and onOpenChange", async () => {
    const onOpenChange = vi.fn();
    function Controlled() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <Button onClick={() => setOpen(true)}>Edit</Button>
          <Sheet
            title="Edit recipe"
            open={open}
            onOpenChange={(next) => {
              onOpenChange(next);
              setOpen(next);
            }}
          >
            <Body />
          </Sheet>
        </>
      );
    }
    await render(<Controlled />);
    await userEvent.click(trigger());
    await settled();
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => popup(), { timeout: 3000 }).toBeNull();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes from an outside press on the backdrop area", async () => {
    await openUncontrolled();
    await userEvent.click(document.body, { position: { x: 20, y: 20 } });
    await expect.poll(() => popup(), { timeout: 3000 }).toBeNull();
  });

  it("marks the popup, backdrop and viewport with data-ouro, and the portal isolates its stacking", async () => {
    const sheet = await openUncontrolled();
    expect(sheet.getAttribute("data-side")).toBe("bottom");
    expect(backdrop()).not.toBeNull();
    expect(viewport()).not.toBeNull();
    const portal = document.querySelector<HTMLElement>('[data-ouro="sheet-portal"]')!;
    expect(getComputedStyle(portal).isolation).toBe("isolate");
  });

  it("renders on the server without throwing or rendering the popup", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = renderToString(
      <Sheet title="Save" trigger={<Button>Save</Button>}>
        Body
      </Sheet>,
    );
    expect(html).toContain("Save");
    expect(html).not.toContain('data-ouro="sheet"');
    expect(error).not.toHaveBeenCalled();
  });
});

describe("title and description", () => {
  it("hides the title visually with hideTitle and keeps it as the accessible name", async () => {
    await openUncontrolled({ hideTitle: true });
    await expect.element(page.getByRole("dialog", { name: "Save to cookbook" })).toBeVisible();
    const title = document.querySelector<HTMLElement>("[data-ouro-sheet-title]")!;
    const rect = title.getBoundingClientRect();
    expect(rect.width).toBeLessThanOrEqual(1);
    expect(rect.height).toBeLessThanOrEqual(1);
  });

  it("shows a visible title and describes the dialog with description", async () => {
    await openUncontrolled({ description: "Pick where it goes." });
    const title = document.querySelector<HTMLElement>("[data-ouro-sheet-title]")!;
    expect(title.getBoundingClientRect().height).toBeGreaterThan(10);
    const describedBy = popup()!.getAttribute("aria-describedby")!;
    expect(document.getElementById(describedBy)!.textContent).toBe("Pick where it goes.");
  });
});

describe("feel", () => {
  it("fades the backdrop with --drawer-swipe-progress up to --ouro-backdrop-max", async () => {
    await openUncontrolled();
    const layer = backdrop()!;
    await expect.poll(() => Number(getComputedStyle(layer).opacity), { timeout: 3000 }).toBeCloseTo(0.4, 2);
    layer.style.transition = "none";
    layer.style.setProperty("--drawer-swipe-progress", "0.5");
    expect(Number(getComputedStyle(layer).opacity)).toBeCloseTo(0.2, 2);
  });

  it("releases with the theme spring scaled by --drawer-swipe-strength", async () => {
    const sheet = await openUncontrolled();
    const style = getComputedStyle(sheet);
    const index = style.transitionProperty.split(", ").indexOf("transform");
    expect(index).toBeGreaterThanOrEqual(0);
    expect(style.transitionDuration.split(", ")[index]).toBe("0.75s");
    expect(style.transitionTimingFunction.split(", ")[index]).toMatch(/^linear\(/);
    sheet.style.setProperty("--drawer-swipe-strength", "0.5");
    const scaled = getComputedStyle(sheet);
    expect(scaled.transitionDuration.split(", ")[index]).toBe("0.375s");
  });

  it("drops transform motion under reduced motion and keeps an opacity fade", async () => {
    await commands.emulateMedia({ reducedMotion: "reduce" });
    await render(
      <Sheet title="Save to cookbook" trigger={<Button>Save</Button>}>
        <Body />
      </Sheet>,
    );
    await userEvent.click(trigger());
    await expect.poll(() => popup()).not.toBeNull();
    const style = getComputedStyle(popup()!);
    const properties = style.transitionProperty.split(", ");
    const durations = style.transitionDuration.split(", ");
    expect(durations[properties.indexOf("transform")]).toBe("0s");
    expect(durations[properties.indexOf("opacity")]).not.toBe("0s");
  });

  it("pads the popup bottom by var(--drawer-keyboard-inset, 0px) so the keyboard never covers inputs", async () => {
    expect(sheetCss).toContain("var(--drawer-keyboard-inset, 0px)");
    const sheet = await openUncontrolled();
    const before = Number.parseFloat(getComputedStyle(sheet).paddingBottom);
    viewport()!.style.setProperty("--drawer-keyboard-inset", "300px");
    expect(Number.parseFloat(getComputedStyle(sheet).paddingBottom)).toBe(before + 300);
  });

  it("opens at the first snap point, as a fraction of the viewport", async () => {
    const sheet = await openUncontrolled({ snapPoints: [0.5, 1] });
    expect(sheet.hasAttribute("data-snap-points")).toBe(true);
    expect(Math.abs(innerHeight - sheet.getBoundingClientRect().top - innerHeight / 2)).toBeLessThanOrEqual(2);
  });
});

describe("dragging (Chromium)", () => {
  chromiumOnly("closes after a drag down past 60% of the sheet's height", async () => {
    const sheet = await openUncontrolled();
    await dragSheet(sheet.offsetHeight * 0.6, { durationMs: 1200, steps: 24 });
    await expect.poll(() => popup(), { timeout: 3000 }).toBeNull();
  });

  chromiumOnly("springs back after a 10% drag and settles at identity within 1s", async () => {
    const sheet = await openUncontrolled();
    await dragSheet(sheet.offsetHeight * 0.1, { durationMs: 400, steps: 8 });
    expect(popup()).toBe(sheet);
    await expect.poll(() => isIdentity(sheet), { timeout: 1000 }).toBe(true);
  });

  chromiumOnly("dismisses on a quick flick even over a short distance", async () => {
    const sheet = await openUncontrolled();
    await dragSheet(sheet.offsetHeight * 0.2, { durationMs: 40, steps: 4 });
    await expect.poll(() => popup(), { timeout: 3000 }).toBeNull();
  });

  chromiumOnly("stretches when pulled past the open edge, with the bleed filling the gap", async () => {
    const sheet = await openUncontrolled();
    await dragSheet(-80, { durationMs: 400, steps: 8, hold: true });
    const lift = -translation(sheet).y;
    await commands.pointerPress({ action: "up" });
    expect(lift).toBeGreaterThanOrEqual(24);
    expect(lift).toBeLessThan(80);
    await expect.poll(() => isIdentity(sheet), { timeout: 1000 }).toBe(true);
  });

  chromiumOnly("lightens the backdrop in step with a drag down", async () => {
    const sheet = await openUncontrolled();
    const layer = backdrop()!;
    await expect.poll(() => Number(getComputedStyle(layer).opacity), { timeout: 3000 }).toBeCloseTo(0.4, 2);
    await dragSheet(sheet.offsetHeight * 0.4, { durationMs: 800, steps: 16, hold: true });
    const progress = Number(layer.style.getPropertyValue("--drawer-swipe-progress"));
    const opacity = Number(getComputedStyle(layer).opacity);
    await commands.pointerPress({ action: "up" });
    expect(progress).toBeGreaterThan(0.2);
    expect(opacity).toBeCloseTo(0.4 * (1 - progress), 2);
  });

  chromiumOnly("reopens fully after a partial drag, release and Escape (review focus 3)", async () => {
    const sheet = await openUncontrolled();
    const openTop = sheet.getBoundingClientRect().top;
    await dragSheet(sheet.offsetHeight * 0.3, { durationMs: 900, steps: 18 });
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => popup(), { timeout: 3000 }).toBeNull();
    await userEvent.click(trigger());
    await settled();
    const reopened = popup()!;
    expect(isIdentity(reopened)).toBe(true);
    expect(reopened.style.transform).toBe("");
    expect(Math.round(reopened.getBoundingClientRect().top)).toBe(Math.round(openTop));
  });
});

describe("sides", () => {
  it.each([
    ["top", (r: DOMRect) => Math.round(r.top) === 0 && Math.round(r.width) === innerWidth],
    ["left", (r: DOMRect) => Math.round(r.left) === 0 && Math.round(r.height) === innerHeight],
    ["right", (r: DOMRect) => Math.round(r.right) === innerWidth && Math.round(r.height) === innerHeight],
  ] as const)("slides in from the %s edge", async (side, atEdge) => {
    const sheet = await openUncontrolled({ side });
    expect(sheet.getAttribute("data-side")).toBe(side);
    expect(atEdge(sheet.getBoundingClientRect())).toBe(true);
    expect(sheet.getBoundingClientRect().width).toBeLessThanOrEqual(innerWidth);
  });
});

describe("dev messages", () => {
  it("throws the exact fix when neither trigger nor open is passed", () => {
    // @ts-expect-error -- neither trigger nor open
    const sheet = <Sheet title="Save">Body</Sheet>;
    expect(() => renderToString(sheet)).toThrow(`[ouro-ui] Sheet: needs trigger or open with onOpenChange. Fix: ${FIX}`);
  });

  it("throws the exact fix when both trigger and open are passed", () => {
    const sheet = (
      // @ts-expect-error -- both trigger and open
      <Sheet title="Save" trigger={<Button>Save</Button>} open onOpenChange={() => {}}>
        Body
      </Sheet>
    );
    expect(() => renderToString(sheet)).toThrow(`[ouro-ui] Sheet: takes trigger or open, not both. Fix: ${FIX}`);
  });

  it("throws the exact fix when open comes without onOpenChange", () => {
    // @ts-expect-error -- open without onOpenChange
    const sheet = <Sheet title="Save" open>Body</Sheet>;
    expect(() => renderToString(sheet)).toThrow(`[ouro-ui] Sheet: open needs onOpenChange. Fix: ${FIX}`);
  });

  it("warns once about guessed props and drops them", async () => {
    const guessed = { isOpen: true, onClose: () => {}, position: "bottom", size: 400 } as object;
    await render(
      <Sheet title="Save" trigger={<Button>Save</Button>} {...guessed}>
        Body
      </Sheet>,
    );
    const messages = warn.mock.calls.map((call: unknown[]) => call[0]);
    expect(messages).toEqual([
      "[ouro-ui] Sheet: isOpen is not a prop. Fix: <Sheet open={open} onOpenChange={setOpen}>.",
      "[ouro-ui] Sheet: onClose is not a prop. Fix: <Sheet open={open} onOpenChange={setOpen}>.",
      '[ouro-ui] Sheet: position is not a prop. Fix: <Sheet side="bottom">.',
      "[ouro-ui] Sheet: size is not a prop; a sheet fits its content. Fix: <Sheet snapPoints={[0.5, 1]}>.",
    ]);
  });

  it.each([
    ["bg-white", 'defineTheme({ color: { surface: { light: "…", dark: "…" } } })'],
    ["rounded-none", 'defineTheme({ radius: { surface: "0px" } })'],
    ["rounded-3xl", 'defineTheme({ radius: { surface: "16px" } })'],
    ["text-lg", '<Sheet title="…"><div className="text-lg">…</div></Sheet>'],
  ])("warns about the appearance class %s on the popup", async (token, fix) => {
    await openUncontrolled({ className: `mx-auto ${token}` });
    expect(popup()!.classList.contains("mx-auto")).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      `[ouro-ui] Sheet: "${token}" sets appearance, and className is for layout only. Fix: ${fix}.`,
    );
  });
});

describe("parts", () => {
  it("compose into a working sheet", async () => {
    await render(
      <SheetRoot>
        <SheetTrigger render={<Button>Open</Button>} />
        <SheetPortal>
          <SheetBackdrop />
          <SheetViewport>
            <SheetPopup className="mx-auto">
              <SheetHandle />
              <SheetTitle>Parts</SheetTitle>
              <SheetDescription>Built from parts.</SheetDescription>
              <SheetContent>
                <SheetClose render={<Button>Done</Button>} />
              </SheetContent>
            </SheetPopup>
          </SheetViewport>
        </SheetPortal>
      </SheetRoot>,
    );
    await userEvent.click(trigger());
    await expect.element(page.getByRole("dialog", { name: "Parts" })).toBeVisible();
    expect(popup()!.getAttribute("data-side")).toBe("bottom");
    expect(document.querySelector("[data-ouro-sheet-handle]")!.getAttribute("aria-hidden")).toBe("true");
    await userEvent.click(page.getByRole("button", { name: "Done" }));
    await expect.poll(() => popup(), { timeout: 3000 }).toBeNull();
  });

  it("does not draw a handle on a side sheet", async () => {
    await render(
      <SheetRoot side="left" defaultOpen>
        <SheetPortal>
          <SheetViewport>
            <SheetPopup>
              <SheetHandle />
              <SheetTitle>Side</SheetTitle>
            </SheetPopup>
          </SheetViewport>
        </SheetPortal>
      </SheetRoot>,
    );
    await expect.poll(() => popup()).not.toBeNull();
    expect(document.querySelector("[data-ouro-sheet-handle]")).toBeNull();
  });

  const shape = (inner: string) =>
    `<SheetRoot><SheetTrigger render={<Button>Open</Button>} /><SheetPortal><SheetBackdrop /><SheetViewport><SheetPopup>${inner}</SheetPopup></SheetViewport></SheetPortal></SheetRoot>`;

  it.each([
    ["SheetTrigger", <SheetTrigger key="t" />, shape("…")],
    ["SheetPortal", <SheetPortal key="p" />, shape("…")],
    ["SheetBackdrop", <SheetBackdrop key="b" />, shape("…")],
    ["SheetViewport", <SheetViewport key="v" />, shape("…")],
    ["SheetPopup", <SheetPopup key="pp" />, shape("…")],
    ["SheetHandle", <SheetHandle key="h" />, shape("<SheetHandle />…")],
    ["SheetTitle", <SheetTitle key="ti">T</SheetTitle>, shape("<SheetTitle>…</SheetTitle>…")],
    ["SheetDescription", <SheetDescription key="d">D</SheetDescription>, shape("<SheetDescription>…</SheetDescription>…")],
    ["SheetContent", <SheetContent key="c" />, shape("<SheetContent>…</SheetContent>")],
    ["SheetClose", <SheetClose key="cl" />, shape("<SheetContent><SheetClose>…</SheetClose></SheetContent>")],
  ])("%s outside SheetRoot throws with the correct JSX shape", (name, element, jsx) => {
    expect(() => renderToString(element)).toThrow(`[ouro-ui] ${name}: must be rendered inside <SheetRoot>. Fix: ${jsx}.`);
  });
});
