import { useLayoutEffect, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Checkbox } from "@/registry/ouro/components/ouro/checkbox/checkbox";
import { Dialog } from "@/registry/ouro/components/ouro/dialog/dialog";
import { Inspector, type InspectorProps } from "@/registry/ouro/components/ouro/inspector/inspector";
import { RadioGroup } from "@/registry/ouro/components/ouro/radio-group/radio-group";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { expectMotion, expectNoMotion, parseDuration } from "@/registry/ouro/lib/ouro/testing/motion";

const roots: Root[] = [];
let mounted: Element[] = [];

/** A docs address of the app's own, so the tests tell it from the default. */
const docsHref = (item: string) => `https://docs.example.com/ui/${item}`;

/** A page of Ouro components with X-ray over it, whose state the test reads and sets. */
let setOpen: (open: boolean) => void = () => {};
let onOpenChange = vi.fn();

function Page(props: { children?: ReactNode; inspector?: Partial<InspectorProps>; open?: boolean }) {
  const [open, setState] = useState(props.open ?? true);
  useLayoutEffect(() => {
    setOpen = setState;
  }, []);
  return (
    <div>
      <div style={{ display: "grid", gap: 16, padding: 24, maxWidth: 420 }}>
        <Button>Save recipe</Button>
        <Badge>New</Badge>
        <Checkbox label="Vegetarian" />
        {props.children}
      </div>
      <div style={{ height: 1600 }} />
      <Inspector
        open={open}
        onOpenChange={(next) => {
          onOpenChange(next);
          setState(next);
        }}
        docsHref={docsHref}
        {...props.inspector}
      />
    </div>
  );
}

async function render(node: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return {
    host,
    rerender: (next: ReactNode) => act(async () => root.render(next)),
  };
}

const layer = () => document.querySelector<HTMLElement>('[data-ouro="inspector"]');
const outlines = () => [...document.querySelectorAll<HTMLElement>("[data-ouro-inspector-outline]")];
const tags = () => [...document.querySelectorAll<HTMLAnchorElement>('[data-ouro-control="inspector"][data-ouro-part="tag"]')];
const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

/** Waits until X-ray has measured the page and drawn an outline per component. */
async function drawn(count: number) {
  await expect.poll(() => outlines().length).toBe(count);
  await frame();
  await frame();
}

/** Whether an outline sits on its component's box, to within a pixel. */
function onTarget(outline: HTMLElement, target: Element) {
  const a = outline.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  return [a.left - b.left, a.top - b.top, a.width - b.width, a.height - b.height].every((delta) => Math.abs(delta) <= 1);
}

/** The page's own component roots, in document order, as X-ray should see them. */
const pageRoots = (host: HTMLElement) => [...host.querySelectorAll('[data-ouro]:not([data-ouro$="-portal"])')];

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  onOpenChange = vi.fn();
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
  scrollTo(0, 0);
  await page.viewport(414, 896);
  await commands.emulateMedia({ reducedMotion: "no-preference" });
});

describe("Inspector", () => {
  it("outlines every Ouro component on the page, each tagged with its item and linked to its docs", async () => {
    const { host } = await render(<Page />);
    const components = pageRoots(host);
    expect(components.map((root) => root.getAttribute("data-ouro"))).toEqual(["button", "badge", "checkbox"]);
    await drawn(components.length);
    expect(tags().map((tag) => tag.textContent)).toEqual(["button", "badge", "checkbox"]);
    expect(tags().map((tag) => tag.getAttribute("href"))).toEqual(["button", "badge", "checkbox"].map(docsHref));
    outlines().forEach((outline, index) => expect(onTarget(outline, components[index]!), `outline ${index}`).toBe(true));
  });

  it("does not outline itself, an overlay's wrappers or a hidden component, and names a part's root by its item", async () => {
    const { host } = await render(
      <Page>
        <RadioGroup legend="Size" defaultValue="s" options={[{ value: "s", label: "Small" }]} />
        <div hidden>
          <Button>Hidden</Button>
        </div>
        {/* A visually hidden root, one pixel square. */}
        <span data-ouro="badge" className="sr-only">
          Hidden badge
        </span>
      </Page>,
    );
    await drawn(5);
    // A Radio's root is the radio-group item's.
    expect(tags().map((tag) => tag.textContent)).toEqual(["button", "badge", "checkbox", "radio-group", "radio-group"]);
    // X-ray's own bar holds Buttons, which it leaves out.
    expect(layer()!.querySelectorAll('[data-ouro="button"]').length).toBeGreaterThan(0);
    expect(host.querySelector("[hidden] [data-ouro]")).not.toBeNull();
    // A visually hidden root has nothing to outline.
    expect(host.querySelector<HTMLElement>(".sr-only[data-ouro]")!.getBoundingClientRect().width).toBe(1);
  });

  it("follows its components as the page scrolls and resizes", async () => {
    const { host } = await render(<Page />);
    const components = pageRoots(host);
    await drawn(components.length);
    scrollBy(0, 200);
    await expect.poll(() => outlines().every((outline, index) => onTarget(outline, components[index]!))).toBe(true);
    expect(components[0]!.getBoundingClientRect().top).toBeLessThan(0);
    await page.viewport(800, 600);
    await expect.poll(() => outlines().every((outline, index) => onTarget(outline, components[index]!))).toBe(true);
  }, 15_000);

  it("follows a component that moves inside a scrolled box, and one that changes size", async () => {
    const { host } = await render(
      <Page>
        <div data-testid="scroller" style={{ height: 80, overflow: "auto" }}>
          <div style={{ height: 120 }} />
          <Button>Deep</Button>
          <div style={{ height: 120 }} />
        </div>
      </Page>,
    );
    const components = pageRoots(host);
    await drawn(components.length);
    host.querySelector<HTMLElement>('[data-testid="scroller"]')!.scrollTop = 90;
    await expect.poll(() => outlines().every((outline, index) => onTarget(outline, components[index]!))).toBe(true);
    (components[1] as HTMLElement).style.padding = "20px";
    await expect.poll(() => outlines().every((outline, index) => onTarget(outline, components[index]!))).toBe(true);
  });

  it("outlines a component added while it is open, and drops one that goes", async () => {
    const { rerender } = await render(<Page />);
    await drawn(3);
    await rerender(
      <Page>
        <Button>Added</Button>
      </Page>,
    );
    await drawn(4);
    expect(tags().map((tag) => tag.textContent)).toEqual(["button", "badge", "checkbox", "button"]);
    await rerender(<Page />);
    await drawn(3);
  });

  it("follows a component inside an overlay as it opens", async () => {
    // A centered dialog, not the sheet a phone width shows.
    await page.viewport(1280, 800);
    await render(
      <Page>
        <Dialog title="Share" trigger={<Button>Share</Button>}>
          <Button>Copy link</Button>
        </Dialog>
      </Page>,
    );
    await drawn(4);
    await userEvent.click(page.getByRole("button", { name: "Share" }));
    const copy = page.getByRole("button", { name: "Copy link" }).element();
    await expect.poll(() => tags().some((tag) => tag.textContent === "dialog")).toBe(true);
    await expect.poll(() => document.getAnimations().filter((animation) => animation.playState === "running").length).toBe(0);
    const outline = outlines()[tags().findIndex((tag, index) => tag.textContent === "button" && outlines()[index] && onTarget(outlines()[index]!, copy))];
    expect(outline).toBeDefined();
    // The outlines are above the dialog, so its components show theirs.
    expect(Number(getComputedStyle(layer()!).zIndex)).toBeGreaterThan(Number(getComputedStyle(document.querySelector('[data-ouro="dialog-portal"]')!).zIndex));
  }, 15_000);

  it("lets a click through an outline reach the control underneath, and only the tags take a pointer", async () => {
    const onClick = vi.fn();
    await render(
      <Page>
        <Button onClick={onClick}>Underneath</Button>
      </Page>,
    );
    await drawn(4);
    const button = page.getByRole("button", { name: "Underneath" }).element();
    const box = button.getBoundingClientRect();
    expect(document.elementFromPoint(box.left + box.width / 2, box.bottom - 4)).toBe(button);
    await userEvent.click(button, { position: { x: box.width / 2, y: box.height - 4 } });
    expect(onClick).toHaveBeenCalledOnce();
    for (const outline of outlines()) expect(getComputedStyle(outline).pointerEvents).toBe("none");
    for (const tag of tags()) expect(getComputedStyle(tag).pointerEvents).toBe("auto");
  });

  it("lists every component in document order in its sheet, with docs and source links", async () => {
    const sourceHref = (item: string, element: Element) => (item === "badge" ? undefined : `https://github.com/spoonjoy/spoonjoy-v2/blob/main/app/${item}.tsx#${element.tagName.toLowerCase()}`);
    await render(<Page inspector={{ sourceHref }} />);
    await drawn(3);
    await userEvent.click(page.getByRole("button", { name: "3 components" }));
    const sheet = page.getByRole("dialog", { name: "X-ray" });
    await expect.element(sheet).toBeVisible();
    const items = [...sheet.element().querySelectorAll("[data-ouro-inspector-list] li")];
    expect(items.map((item) => item.querySelector("code")!.textContent)).toEqual(["button", "badge", "checkbox"]);
    await expect.element(page.getByRole("link", { name: "Docs for checkbox (opens in a new tab)" })).toHaveAttribute("href", docsHref("checkbox"));
    await expect.element(page.getByRole("link", { name: "Source of button (opens in a new tab)" })).toHaveAttribute("href", "https://github.com/spoonjoy/spoonjoy-v2/blob/main/app/button.tsx#button");
    expect(items[1]!.textContent).not.toContain("Source");
    // The outlines hide while the list is open, so none crosses it.
    expect(getComputedStyle(layer()!).visibility).toBe("hidden");
    // Escape closes the list first, and X-ray stays on.
    await userEvent.keyboard("{Escape}");
    await expect.element(sheet).not.toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(getComputedStyle(layer()!).visibility).toBe("visible");
  }, 15_000);

  it("closes with Escape and with its Close button, and gives focus back", async () => {
    await render(<Page open={false} />);
    const before = page.getByRole("button", { name: "Save recipe" }).element() as HTMLElement;
    before.focus();
    await act(() => setOpen(true));
    await drawn(3);
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    await expect.poll(layer).toBeNull();
    expect(document.activeElement).toBe(before);
    await act(() => setOpen(true));
    await drawn(3);
    await userEvent.click(page.getByRole("button", { name: "Close" }));
    expect(onOpenChange).toHaveBeenCalledTimes(2);
    await expect.poll(layer).toBeNull();
    expect(document.activeElement).toBe(before);
  }, 15_000);

  it("leaves Escape to another overlay that has focus", async () => {
    await render(
      <Page>
        <Dialog title="Share" trigger={<Button>Share</Button>}>
          <p>Send it to a friend.</p>
        </Dialog>
      </Page>,
    );
    await drawn(4);
    await userEvent.click(page.getByRole("button", { name: "Share" }));
    await expect.element(page.getByRole("dialog", { name: "Share" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect.element(page.getByRole("dialog", { name: "Share" })).not.toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(layer()).not.toBeNull();
  }, 15_000);

  it("fades in when it opens, and appears at once with reduced motion", async () => {
    const base = parseDuration(getComputedStyle(document.documentElement).getPropertyValue("--ouro-duration-base"));
    await render(<Page open={false} />);
    for (const reduced of [false, true]) {
      await commands.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
      // Opened synchronously, so the check runs before the frame in which a layer with nothing to fade drops its entering state.
      flushSync(() => setOpen(true));
      const opened = layer()!;
      if (reduced) {
        await expectNoMotion(opened, { stem: "inspector", state: "data-starting-style", reduced });
        // Nothing moves: no transform runs on any outline either.
        for (const animation of document.getAnimations()) expect((animation as CSSTransition).transitionProperty).not.toMatch(/transform|translate|scale/);
      } else {
        await expectMotion(opened, { stem: "inspector", state: "data-starting-style", properties: { opacity: base }, reduced });
      }
      await expect.poll(() => opened.hasAttribute("data-starting-style")).toBe(false);
      expect(getComputedStyle(opened).opacity).toBe("1");
      await act(() => setOpen(false));
    }
  }, 15_000);

  it("puts a tag inside its outline at the top of the screen", async () => {
    const { host } = await render(<Page />);
    await drawn(3);
    scrollTo(0, pageRoots(host)[0]!.getBoundingClientRect().top + scrollY - 4);
    await expect.poll(() => tags()[0]!.hasAttribute("data-inside")).toBe(true);
    expect(tags()[1]!.hasAttribute("data-inside")).toBe(false);
  });

  it("counts one component in the singular, and links Ouro's public docs by default", async () => {
    await render(
      <div>
        <Button>Only one</Button>
        <Inspector open onOpenChange={() => {}} />
      </div>,
    );
    await drawn(1);
    await expect.element(page.getByRole("button", { name: "1 component", exact: true })).toBeVisible();
    expect(tags()[0]!.getAttribute("href")).toBe("https://ourostack.github.io/ouro-ui/docs/button/");
  });

  it("renders nothing while closed, and nothing on the server", async () => {
    await render(<Page open={false} />);
    expect(layer()).toBeNull();
    expect(renderToString(<Inspector open onOpenChange={() => {}} docsHref={docsHref} />)).toBe("");
  });

  it("names a guessed prop, and has no messages for valid props", async () => {
    await render(<Page inspector={{ label: "Components" }} />);
    await act(async () => {});
    expect(warn).not.toHaveBeenCalled();
    const guessed = { isOpen: true, onClose: () => {}, label: "" } as unknown as Partial<InspectorProps>;
    await render(<Inspector open={false} onOpenChange={() => {}} docsHref={docsHref} {...guessed} />);
    await expect.poll(() => warn.mock.calls.map((call: unknown[]) => String(call[0]))).toEqual([
      '[ouro-ui] Inspector: label is empty; it names the bar and its list. Fix: <Inspector label="X-ray">.',
      "[ouro-ui] Inspector: isOpen is not a prop. Fix: <Inspector open={xray} onOpenChange={setXray}>.",
      "[ouro-ui] Inspector: onClose is not a prop; onOpenChange gets false when X-ray closes. Fix: <Inspector open={xray} onOpenChange={setXray}>.",
    ]);
  });
});
