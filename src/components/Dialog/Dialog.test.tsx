import distCss from "../../../dist/styles.css?raw";
import { act, createRef, StrictMode, useState, type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { Button } from "../Button/Button.tsx";
import { Dialog, type DialogProps } from "./Dialog.tsx";
import {
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogPopup,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
  DialogViewport,
} from "./parts.tsx";

// Reads the built dist/styles.css, so run `pnpm build` first. Runs in Chromium and WebKit.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FIX = "Pass trigger={<Button>…</Button>} for an uncontrolled dialog, or open and onOpenChange to control it.";

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
  await page.viewport(1280, 800);
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

const popup = () => document.querySelector<HTMLElement>("[data-ouro-presentation]");
const dialogPopup = () => document.querySelector<HTMLElement>('[data-ouro="dialog"]');
const backdrop = () => document.querySelector<HTMLElement>('[data-ouro="dialog-backdrop"]');
const trigger = () => document.querySelector<HTMLElement>('[data-ouro="button"]')!;

/** Waits until the open popup has finished its entrance (no starting style, no running transitions). */
async function settled() {
  await expect
    .poll(
      () => {
        const element = popup();
        return Boolean(element && !element.hasAttribute("data-starting-style") && element.getAnimations().length === 0);
      },
      { timeout: 3000, interval: 50 },
    )
    .toBe(true);
}

async function openUncontrolled(props: Partial<DialogProps> = {}) {
  const children = props.children ?? (
    <label>
      Name <input aria-label="Name" />
    </label>
  );
  await render(
    <Dialog title="Edit recipe" trigger={<Button>Edit</Button>} {...(props as object)}>
      {children}
    </Dialog>,
  );
  await userEvent.click(trigger());
  await settled();
  return popup()!;
}

/**
 * The bodies of the stylesheet's iOS-only rules (`@supports (-webkit-touch-callout: none)`),
 * unwrapped. Desktop test browsers never match that query, so tests inject the shipped
 * rules themselves instead of the stylesheet carrying a test-only selector.
 */
function iosRules(css: string): string {
  const marker = "@supports (-webkit-touch-callout: none)";
  const bodies: string[] = [];
  for (let at = css.indexOf(marker); at !== -1; at = css.indexOf(marker, at + 1)) {
    const open = css.indexOf("{", at);
    let depth = 0;
    let end = open;
    for (; end < css.length; end++) {
      if (css[end] === "{") depth++;
      else if (css[end] === "}" && --depth === 0) break;
    }
    bodies.push(css.slice(open + 1, end));
  }
  return bodies.join("\n");
}

describe("automatic presentation", () => {
  it("renders a centered dialog at 1280px", async () => {
    const element = await openUncontrolled();
    await expect.element(page.getByRole("dialog", { name: "Edit recipe" })).toBeVisible();
    expect(element.getAttribute("role")).toBe("dialog");
    expect(element.getAttribute("data-ouro")).toBe("dialog");
    expect(element.getAttribute("data-ouro-presentation")).toBe("dialog");
    expect(backdrop()).not.toBeNull();
    const rect = element.getBoundingClientRect();
    expect(Math.abs(rect.left + rect.width / 2 - innerWidth / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(rect.top + rect.height / 2 - innerHeight / 2)).toBeLessThanOrEqual(1);
  });

  it("renders the bottom sheet at 390px", async () => {
    await page.viewport(390, 844);
    const element = await openUncontrolled();
    expect(element.getAttribute("data-ouro-presentation")).toBe("sheet");
    expect(element.getAttribute("data-ouro")).toBe("sheet");
    expect(element.getAttribute("data-side")).toBe("bottom");
    expect(element.getAttribute("role")).toBe("dialog");
    expect(dialogPopup()).toBeNull();
    expect(Math.round(element.getBoundingClientRect().bottom)).toBe(innerHeight);
  });

  it("follows presentation over the viewport", async () => {
    expect((await openUncontrolled({ presentation: "sheet" })).getAttribute("data-ouro-presentation")).toBe("sheet");
    await act(async () => roots.splice(0).forEach((root) => root.unmount()));
    await page.viewport(390, 844);
    expect((await openUncontrolled({ presentation: "dialog" })).getAttribute("data-ouro-presentation")).toBe("dialog");
  });

  it("stays open in the new presentation when a resize crosses 640px, keeping controlled state", async () => {
    const onOpenChange = vi.fn();
    function Controlled() {
      const [open, setOpen] = useState(true);
      return (
        <Dialog
          title="Edit recipe"
          open={open}
          onOpenChange={(next) => {
            onOpenChange(next);
            setOpen(next);
          }}
        >
          <input aria-label="Name" />
        </Dialog>
      );
    }
    await render(<Controlled />);
    await settled();
    expect(popup()!.getAttribute("data-ouro-presentation")).toBe("dialog");
    await page.viewport(390, 844);
    await expect.poll(() => popup()?.getAttribute("data-ouro-presentation")).toBe("sheet");
    await settled();
    await expect.element(page.getByRole("dialog", { name: "Edit recipe" })).toBeVisible();
    await page.viewport(1280, 800);
    await expect.poll(() => popup()?.getAttribute("data-ouro-presentation")).toBe("dialog");
    await settled();
    expect(onOpenChange).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => popup(), { timeout: 3000 }).toBeNull();
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("keeps an uncontrolled dialog open across a resize, and its trigger still opens it afterwards", async () => {
    await openUncontrolled();
    await page.viewport(390, 844);
    await expect.poll(() => popup()?.getAttribute("data-ouro-presentation")).toBe("sheet");
    await settled();
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => popup(), { timeout: 3000 }).toBeNull();
    await userEvent.click(trigger());
    await settled();
    expect(popup()!.getAttribute("data-ouro-presentation")).toBe("sheet");
  });
});

describe("server rendering", () => {
  it("renders on the server without throwing or rendering the popup", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = renderToString(
      <Dialog title="t" trigger={<Button>o</Button>}>
        x
      </Dialog>,
    );
    expect(html).toContain(">o<");
    expect(html).not.toContain("data-ouro-presentation");
    expect(error).not.toHaveBeenCalled();
  });

  it.each([
    ["uncontrolled", () => <Dialog title="t" trigger={<Button>o</Button>}>x</Dialog>],
    ["closed and controlled", () => <Dialog title="t" open={false} onOpenChange={() => {}}>x</Dialog>],
  ])("hydrates a %s Dialog at 390px with no hydration error, then opens as a sheet", async (_name, app) => {
    await page.viewport(390, 844);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const recoverable = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    mounted.push(host);
    host.innerHTML = renderToString(app());
    await act(async () => {
      roots.push(hydrateRoot(host, <StrictMode>{app()}</StrictMode>, { onRecoverableError: recoverable }));
    });
    expect(error).not.toHaveBeenCalled();
    expect(recoverable).not.toHaveBeenCalled();
    if (host.querySelector('[data-ouro="button"]')) {
      await userEvent.click(trigger());
      await settled();
      expect(popup()!.getAttribute("data-ouro-presentation")).toBe("sheet");
    }
  });
});

describe("centered dialog", () => {
  it("closes on Escape and returns focus to the trigger", async () => {
    await openUncontrolled();
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => popup(), { timeout: 3000 }).toBeNull();
    await expect.poll(() => document.activeElement).toBe(trigger());
  });

  it("closes from an outside press", async () => {
    await openUncontrolled();
    await userEvent.click(document.body, { position: { x: 10, y: 10 } });
    await expect.poll(() => popup(), { timeout: 3000 }).toBeNull();
  });

  it("has a visible, compact close button in the top corner, labelled by closeLabel", async () => {
    const element = await openUncontrolled({ closeLabel: "Dismiss" });
    const close = page.getByRole("dialog").getByRole("button", { name: "Dismiss" });
    const button = close.element() as HTMLElement;
    const rect = button.getBoundingClientRect();
    const box = element.getBoundingClientRect();
    expect(rect.width).toBeGreaterThanOrEqual(24);
    expect(rect.width).toBeLessThanOrEqual(40);
    expect(rect.height).toBe(rect.width);
    expect(box.right - rect.right).toBeLessThanOrEqual(20);
    expect(rect.top - box.top).toBeLessThanOrEqual(20);
    expect(button.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
    await userEvent.click(close);
    await expect.poll(() => popup(), { timeout: 3000 }).toBeNull();
  });

  it("labels the close button Close by default", async () => {
    await openUncontrolled();
    await expect.element(page.getByRole("dialog").getByRole("button", { name: "Close" })).toBeVisible();
  });

  it("keeps the sheet's hidden-until-focused close control in sheet presentation", async () => {
    await page.viewport(390, 844);
    await openUncontrolled({ closeLabel: "Dismiss" });
    const close = page.getByRole("dialog").getByRole("button", { name: "Dismiss" }).element();
    expect(close.hasAttribute("data-ouro-sheet-close")).toBe(true);
    expect(close.getBoundingClientRect().width).toBeLessThanOrEqual(1);
  });

  it.each([
    ["sm", 384],
    ["md", 512],
    ["lg", 640],
  ] as const)("caps size %s at %ipx wide", async (size, max) => {
    const element = await openUncontrolled({ size, children: <div style={{ width: 2000 }} /> } as Partial<DialogProps>);
    expect(element.getAttribute("data-size")).toBe(size);
    expect(element.getBoundingClientRect().width).toBe(max);
  });

  it("defaults to md", async () => {
    expect((await openUncontrolled()).getAttribute("data-size")).toBe("md");
  });

  it("hides the title visually with hideTitle and describes the dialog with description", async () => {
    const element = await openUncontrolled({ hideTitle: true, description: "Change the name." });
    await expect.element(page.getByRole("dialog", { name: "Edit recipe" })).toBeVisible();
    const title = document.querySelector<HTMLElement>("[data-ouro-dialog-title]")!;
    expect(title.getBoundingClientRect().width).toBeLessThanOrEqual(1);
    const describedBy = element.getAttribute("aria-describedby")!;
    expect(document.getElementById(describedBy)!.textContent).toBe("Change the name.");
  });

  it("fits on a phone with side margins when presentation is dialog", async () => {
    await page.viewport(390, 844);
    const element = await openUncontrolled({ presentation: "dialog" });
    const rect = element.getBoundingClientRect();
    expect(rect.left).toBeGreaterThanOrEqual(16);
    expect(innerWidth - rect.right).toBeGreaterThanOrEqual(16);
  });

  it("scrolls a tall body inside the dialog and keeps clear of the screen edges", async () => {
    const element = await openUncontrolled({ children: <div style={{ height: 3000 }} /> } as Partial<DialogProps>);
    const rect = element.getBoundingClientRect();
    expect(rect.top).toBeGreaterThanOrEqual(16);
    expect(innerHeight - rect.bottom).toBeGreaterThanOrEqual(16);
    const body = element.querySelector<HTMLElement>("[data-ouro-dialog-content]")!;
    expect(body.scrollHeight).toBeGreaterThan(body.clientHeight);
  });

  it("marks the popup and backdrop with data-ouro, and the portal isolates its stacking", async () => {
    await openUncontrolled();
    expect(dialogPopup()).not.toBeNull();
    expect(backdrop()).not.toBeNull();
    const portal = document.querySelector<HTMLElement>('[data-ouro="dialog-portal"]')!;
    expect(getComputedStyle(portal).isolation).toBe("isolate");
  });
});

describe("footer", () => {
  const footer = (
    <>
      <Button variant="outline" tone="neutral">
        Cancel
      </Button>
      <Button>Save</Button>
    </>
  );

  it("lays out actions in a row at the end on wide screens", async () => {
    const element = await openUncontrolled({ footer });
    const row = element.querySelector<HTMLElement>("[data-ouro-footer]")!;
    const [cancel, save] = [...row.children].map((child) => child.getBoundingClientRect());
    expect(Math.round(cancel!.top)).toBe(Math.round(save!.top));
    expect(cancel!.right).toBeLessThan(save!.left);
    expect(Math.abs(row.getBoundingClientRect().right - 20 - save!.right)).toBeLessThanOrEqual(1);
  });

  it.each(["dialog", "sheet"] as const)("stacks actions in reverse, full width, on phones (%s)", async (presentation) => {
    await page.viewport(390, 844);
    const element = await openUncontrolled({ footer, presentation });
    const row = element.querySelector<HTMLElement>("[data-ouro-footer]")!;
    const [cancel, save] = [...row.children].map((child) => child.getBoundingClientRect());
    expect(save!.bottom).toBeLessThanOrEqual(cancel!.top);
    expect(cancel!.width).toBe(save!.width);
    expect(cancel!.width).toBeGreaterThan(row.getBoundingClientRect().width - 48);
  });
});

describe("motion", () => {
  const transitionOf = (element: HTMLElement, property: string) => {
    const style = getComputedStyle(element);
    const index = style.transitionProperty.split(", ").indexOf(property);
    return index === -1
      ? undefined
      : { duration: style.transitionDuration.split(", ")[index], easing: style.transitionTimingFunction.split(", ")[index] };
  };

  it("scales from 0.96 with the theme spring and fades, entering and leaving", async () => {
    await render(
      <Dialog title="Edit recipe" trigger={<Button>Edit</Button>}>
        Body
      </Dialog>,
    );
    const seen: Array<{ phase: string; transform: string; opacity: string }> = [];
    const observer = new MutationObserver(() => {
      const element = dialogPopup();
      if (!element) return;
      for (const phase of ["data-starting-style", "data-ending-style"]) {
        if (element.hasAttribute(phase) && !seen.some((entry) => entry.phase === phase)) {
          // A running transition reports its in-between value; pause it to read the target.
          element.style.transition = "none";
          const style = getComputedStyle(element);
          seen.push({ phase, transform: style.transform, opacity: style.opacity });
          element.style.transition = "";
        }
      }
    });
    // Watch only the state attributes: the callback's own style writes must not re-trigger it.
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-starting-style", "data-ending-style"],
      childList: true,
      subtree: true,
    });
    await userEvent.click(trigger());
    await settled();
    const element = dialogPopup()!;
    expect(transitionOf(element, "transform")!.easing).toMatch(/^linear\(/);
    expect(transitionOf(element, "transform")!.duration).toBe("0.75s");
    expect(transitionOf(element, "opacity")).toBeDefined();
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => popup(), { timeout: 3000 }).toBeNull();
    observer.disconnect();
    const scale = (transform: string) => new DOMMatrix(transform).a;
    const start = seen.find((entry) => entry.phase === "data-starting-style")!;
    const end = seen.find((entry) => entry.phase === "data-ending-style")!;
    expect(scale(start.transform)).toBeCloseTo(0.96, 3);
    expect(start.opacity).toBe("0");
    expect(scale(end.transform)).toBeCloseTo(0.96, 3);
    expect(end.opacity).toBe("0");
  });

  it("fades the backdrop in to --ouro-backdrop-max", async () => {
    await openUncontrolled();
    await expect.poll(() => Number(getComputedStyle(backdrop()!).opacity), { timeout: 3000 }).toBeCloseTo(0.4, 2);
  });

  it("drops the scale under reduced motion and keeps the fade", async () => {
    await commands.emulateMedia({ reducedMotion: "reduce" });
    const element = await openUncontrolled();
    expect(transitionOf(element, "transform")).toBeUndefined();
    expect(transitionOf(element, "opacity")!.duration).not.toBe("0s");
    element.style.transition = "none";
    element.setAttribute("data-ending-style", "");
    expect(getComputedStyle(element).transform).toBe("none");
    expect(getComputedStyle(element).opacity).toBe("0");
    element.removeAttribute("data-ending-style");
  });
});

describe("iOS backdrop rule", () => {
  it("covers the visible screen on a page scrolled 2000px", async () => {
    const ios = document.createElement("style");
    ios.textContent = `@layer components { ${iosRules(distCss)} }`;
    document.head.append(ios);
    mounted.push(ios);
    const tall = document.createElement("div");
    tall.style.height = "5000px";
    document.body.append(tall);
    mounted.push(tall);
    window.scrollTo(0, 2000);
    // Opened without a click, which would scroll the trigger into view.
    await render(
      <Dialog title="Scrolled" open onOpenChange={() => {}}>
        Body
      </Dialog>,
    );
    await settled();
    const layer = backdrop()!;
    expect(getComputedStyle(layer).position).toBe("absolute");
    await expect
      .poll(() => {
        const rect = layer.getBoundingClientRect();
        return rect.top <= 0 && rect.bottom >= innerHeight;
      })
      .toBe(true);
    expect(window.scrollY).toBe(2000);
    window.scrollTo(0, 0);
  });
});

describe("dev messages", () => {
  it("throws the exact fix when neither trigger nor open is passed", () => {
    // @ts-expect-error -- neither trigger nor open
    const dialog = <Dialog title="Edit">Body</Dialog>;
    expect(() => renderToString(dialog)).toThrow(`[ouro-ui] Dialog: needs trigger or open with onOpenChange. Fix: ${FIX}`);
  });

  it("throws the exact fix when both trigger and open are passed", () => {
    const dialog = (
      // @ts-expect-error -- both trigger and open
      <Dialog title="Edit" trigger={<Button>Edit</Button>} open onOpenChange={() => {}}>
        Body
      </Dialog>
    );
    expect(() => renderToString(dialog)).toThrow(`[ouro-ui] Dialog: takes trigger or open, not both. Fix: ${FIX}`);
  });

  it("throws the exact fix when open comes without onOpenChange", () => {
    // @ts-expect-error -- open without onOpenChange
    const dialog = <Dialog title="Edit" open>Body</Dialog>;
    expect(() => renderToString(dialog)).toThrow(`[ouro-ui] Dialog: open needs onOpenChange. Fix: ${FIX}`);
  });

  it("warns once about guessed props and drops them from the DOM", async () => {
    const guessed = { isOpen: true, onClose: () => {}, position: "bottom", side: "left", snapPoints: [0.5] } as object;
    const element = await openUncontrolled(guessed);
    expect(warn.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      "[ouro-ui] Dialog: isOpen is not a prop. Fix: <Dialog open={open} onOpenChange={setOpen}>.",
      "[ouro-ui] Dialog: onClose is not a prop. Fix: <Dialog open={open} onOpenChange={setOpen}>.",
      "[ouro-ui] Dialog: position is not a prop; a Dialog is centered, or a bottom sheet on phones. Fix: <Sheet side=\"bottom\">.",
      "[ouro-ui] Dialog: side is not a prop; a Dialog is centered, or a bottom sheet on phones. Fix: <Sheet side=\"left\">.",
      "[ouro-ui] Dialog: snapPoints is not a prop; a Dialog fits its content. Fix: <Sheet snapPoints={[0.5, 1]}>.",
    ]);
    for (const name of ["isopen", "position", "side", "snappoints"]) expect(element.hasAttribute(name)).toBe(false);
  });

  it.each([
    ["bg-white", 'defineTheme({ color: { surface: { light: "…", dark: "…" } } })'],
    ["rounded-none", 'defineTheme({ radius: { surface: "0px" } })'],
    ["text-lg", '<Dialog title="…"><div className="text-lg">…</div></Dialog>'],
  ])("warns about the appearance class %s once, as Dialog, in either presentation", async (token, fix) => {
    const element = await openUncontrolled({ className: `mt-4 ${token}` });
    expect(element.classList.contains("mt-4")).toBe(true);
    await page.viewport(390, 844);
    await expect.poll(() => popup()?.getAttribute("data-ouro-presentation")).toBe("sheet");
    expect(popup()!.classList.contains("mt-4")).toBe(true);
    expect(warn.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      `[ouro-ui] Dialog: "${token}" sets appearance, and className is for layout only. Fix: ${fix}.`,
    ]);
  });
});

describe("parts", () => {
  it("compose into a working dialog", async () => {
    const ref = createRef<HTMLDivElement>();
    await render(
      <DialogRoot>
        <DialogTrigger render={<Button>Open</Button>} />
        <DialogPortal>
          <DialogBackdrop ref={ref} />
          <DialogViewport>
            <DialogPopup className="mt-4" size="sm">
              <DialogTitle>Parts</DialogTitle>
              <DialogDescription>Built from parts.</DialogDescription>
              <DialogContent className="mt-2">Body</DialogContent>
              <DialogFooter>
                <DialogClose render={<Button>Done</Button>} />
              </DialogFooter>
            </DialogPopup>
          </DialogViewport>
        </DialogPortal>
      </DialogRoot>,
    );
    await userEvent.click(trigger());
    await expect.element(page.getByRole("dialog", { name: "Parts" })).toBeVisible();
    expect(dialogPopup()!.getAttribute("data-size")).toBe("sm");
    expect(ref.current).toBe(backdrop());
    await userEvent.click(page.getByRole("button", { name: "Done" }));
    await expect.poll(() => dialogPopup(), { timeout: 3000 }).toBeNull();
  });

  it.each([
    ["DialogPopup", "bg-white", 'defineTheme({ color: { surface: { light: "…", dark: "…" } } })'],
    ["DialogContent", "text-lg", '<DialogContent><div className="text-lg">…</div></DialogContent>'],
  ])("%s warns about the appearance class %s", async (part, token, fix) => {
    await render(
      <DialogRoot defaultOpen>
        <DialogPortal>
          <DialogViewport>
            <DialogPopup className={part === "DialogPopup" ? token : undefined}>
              <DialogTitle>Checked</DialogTitle>
              <DialogContent className={part === "DialogContent" ? token : undefined}>Body</DialogContent>
            </DialogPopup>
          </DialogViewport>
        </DialogPortal>
      </DialogRoot>,
    );
    await expect.poll(() => dialogPopup()).not.toBeNull();
    expect(warn.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      `[ouro-ui] ${part}: "${token}" sets appearance, and className is for layout only. Fix: ${fix}.`,
    ]);
  });

  const shape = (inner: string) =>
    `<DialogRoot><DialogTrigger render={<Button>Open</Button>} /><DialogPortal><DialogBackdrop /><DialogViewport><DialogPopup>${inner}</DialogPopup></DialogViewport></DialogPortal></DialogRoot>`;

  it.each([
    ["DialogTrigger", <DialogTrigger key="t" />, shape("…")],
    ["DialogPortal", <DialogPortal key="p" />, shape("…")],
    ["DialogBackdrop", <DialogBackdrop key="b" />, shape("…")],
    ["DialogViewport", <DialogViewport key="v" />, shape("…")],
    ["DialogPopup", <DialogPopup key="pp" />, shape("…")],
    ["DialogTitle", <DialogTitle key="ti">T</DialogTitle>, shape("<DialogTitle>…</DialogTitle>…")],
    ["DialogDescription", <DialogDescription key="d">D</DialogDescription>, shape("<DialogTitle>…</DialogTitle><DialogDescription>…</DialogDescription>…")],
    ["DialogContent", <DialogContent key="c" />, shape("<DialogTitle>…</DialogTitle><DialogContent>…</DialogContent>")],
    ["DialogFooter", <DialogFooter key="f" />, shape("<DialogTitle>…</DialogTitle><DialogContent>…</DialogContent><DialogFooter>…</DialogFooter>")],
    ["DialogClose", <DialogClose key="cl" />, shape("<DialogTitle>…</DialogTitle><DialogFooter><DialogClose>…</DialogClose></DialogFooter>")],
  ])("%s outside DialogRoot throws with the correct JSX shape", (name, element, jsx) => {
    expect(() => renderToString(element)).toThrow(`[ouro-ui] ${name}: must be rendered inside <DialogRoot>. Fix: ${jsx}.`);
  });
});
