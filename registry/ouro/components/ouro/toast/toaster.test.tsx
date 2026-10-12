import { StrictMode, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, server, userEvent } from "vitest/browser";
import { Toaster, type ToasterProps } from "@/registry/ouro/components/ouro/toast/toaster";
import { toast, type ToastOptions } from "@/registry/ouro/lib/ouro/toast";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

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
  return { host, root, unmount: () => act(async () => root.unmount()) };
}

const viewport = () => document.querySelector<HTMLElement>('[data-ouro="toaster"]');
const toasts = () => [...document.querySelectorAll<HTMLElement>('[data-ouro="toast"]')];
const toastNamed = (message: string) => toasts().find((item) => item.querySelector("[data-ouro-toast-title]")?.textContent === message);
const showing = (message: string) => {
  const item = toastNamed(message);
  return Boolean(item && !item.hasAttribute("data-ending-style"));
};

/** Shows a toast inside act, so React commits it. */
async function show(message: string, options?: ToastOptions) {
  await act(async () => {
    toast(message, options);
  });
  await expect.poll(() => showing(message)).toBe(true);
  const item = toastNamed(message)!;
  // Wait for it to finish sliding in, so a pointer lands where the test measured.
  await expect.poll(() => item.getAnimations().length).toBe(0);
  return item;
}

/** Waits until the toast is gone from the page. */
const gone = (message: string) => expect.poll(() => toastNamed(message)).toBeUndefined();

/** Polls until `ms` milliseconds have passed: a condition, so a loaded runner just waits longer. */
async function elapse(ms: number) {
  const start = performance.now();
  await expect.poll(() => performance.now() - start >= ms).toBe(true);
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => toast.dismiss());
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
  await page.viewport(414, 896);
  await commands.emulateMedia({ reducedMotion: "no-preference" });
});

const warnings = () => warn.mock.calls.map((call: unknown[]) => String(call[0]));

describe("Toaster", () => {
  it("renders an empty, polite Notifications region in a portal", async () => {
    const { host } = await render(<Toaster />);
    const region = viewport()!;
    expect(region).not.toBeNull();
    expect(host.contains(region)).toBe(false);
    expect(region.getAttribute("role")).toBe("region");
    expect(region.getAttribute("aria-label")).toBe("Notifications");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(toasts()).toEqual([]);
  });

  it("translates the region name and the dismiss button with label and closeLabel", async () => {
    await render(<Toaster label="Benachrichtigungen" closeLabel="Schließen" />);
    expect(viewport()!.getAttribute("aria-label")).toBe("Benachrichtigungen");
    const item = await show("Gespeichert");
    expect(item.querySelector('button[aria-label="Schließen"]')).not.toBeNull();
  });

  it("stacks above dialogs and sheets, one level over --ouro-layer", async () => {
    await render(<Toaster />);
    const portal = viewport()!.parentElement!;
    // --ouro-layer is 50 from ouro-base, unless the app raised it.
    const layer = Number(getComputedStyle(document.documentElement).getPropertyValue("--ouro-layer"));
    expect(layer).toBeGreaterThanOrEqual(50);
    expect(getComputedStyle(portal).zIndex).toBe(String(layer + 1));
    expect(getComputedStyle(portal).isolation).toBe("isolate");
  });

  it("renders nothing on the server", () => {
    expect(renderToString(<Toaster />)).toBe("");
  });

  it("warns once for Sonner's props, with the fix", async () => {
    const props = { position: "top-center", richColors: true, theme: "dark", duration: 3000 } as unknown as ToasterProps;
    await render(<Toaster {...props} />);
    expect(warnings()).toEqual([
      "[ouro-ui] Toaster: position is not a prop; toasts show at the bottom, full width on phones. Fix: <Toaster />.",
      '[ouro-ui] Toaster: richColors is not a prop. Fix: toast("Saved", { tone: "success" }).',
      "[ouro-ui] Toaster: theme is not a prop; dark mode follows the .dark class. Fix: <Toaster />.",
      '[ouro-ui] Toaster: duration is not a prop. Fix: toast("Saved", { duration: 3000 }).',
    ]);
  });

  it("shows toasts in one Toaster only, and warns when a second is rendered", async () => {
    await render(
      <>
        <Toaster />
        <Toaster />
      </>,
    );
    expect(document.querySelectorAll('[data-ouro="toaster"]')).toHaveLength(1);
    await show("Saved");
    expect(toasts()).toHaveLength(1);
    expect(warnings()).toContain(
      "[ouro-ui] Toaster: another <Toaster /> is already mounted, so this one shows nothing. Fix: render <Toaster /> once, at the root of your app.",
    );
  });

  it("hands toasts to the next Toaster after the first unmounts", async () => {
    const first = await render(<Toaster />);
    await first.unmount();
    await render(<Toaster />);
    await show("Saved");
    expect(toasts()).toHaveLength(1);
  });

  it("works under StrictMode, which mounts effects twice", async () => {
    await render(
      <StrictMode>
        <Toaster />
      </StrictMode>,
    );
    await show("Saved");
    expect(toasts()).toHaveLength(1);
    expect(warnings()).toEqual([]);
  });
});

describe("toast()", () => {
  it("shows a toast named by its message, with its description, and returns its id", async () => {
    await render(<Toaster />);
    let id = "";
    await act(async () => {
      id = toast("Recipe saved", { description: "Find it in your cookbook." });
    });
    expect(id).toMatch(/^ouro-toast-\d+$/);
    await expect.element(page.getByRole("dialog", { name: "Recipe saved" })).toBeVisible();
    const item = toastNamed("Recipe saved")!;
    expect(item.getAttribute("aria-modal")).toBe("false");
    expect(item.querySelector("[data-ouro-toast-description]")!.textContent).toBe("Find it in your cookbook.");
    expect(document.getElementById(item.getAttribute("aria-describedby")!)!.textContent).toBe("Find it in your cookbook.");
  });

  it("marks the tone and shows an icon for every tone but secondary", async () => {
    await render(<Toaster />);
    const icons: Record<string, boolean> = {};
    for (const tone of ["secondary", "primary", "success", "warning", "destructive"] as const) {
      const item = await show(`A ${tone} toast`, { tone, duration: 0 });
      expect(item.getAttribute("data-tone")).toBe(tone);
      icons[tone] = item.querySelector("[data-ouro-toast-icon]") !== null;
    }
    expect(icons).toEqual({ secondary: false, primary: true, success: true, warning: true, destructive: true });
    const success = toastNamed("A success toast")!.querySelector("[data-ouro-toast-icon]")!;
    expect(success.getAttribute("aria-hidden")).toBe("true");
  });

  it("defaults to secondary, and an unknown tone renders secondary and warns with the tone to use", async () => {
    await render(<Toaster />);
    expect((await show("Plain")).getAttribute("data-tone")).toBe("secondary");
    const options = { tone: "error" } as unknown as ToastOptions;
    expect((await show("Failed", options)).getAttribute("data-tone")).toBe("secondary");
    const odd = { tone: "loud" } as unknown as ToastOptions;
    await show("Odd", odd);
    expect(warnings()).toEqual([
      '[ouro-ui] toast: tone: "error" is not a tone; use "primary", "secondary", "destructive", "success", "warning". Fix: toast("…", { tone: "destructive" }).',
      '[ouro-ui] toast: tone: "loud" is not a tone; use "primary", "secondary", "destructive", "success", "warning". Fix: toast("…", { tone: "secondary" }).',
    ]);
  });

  it("warns for Sonner's options and shortcuts, with the Ouro UI call, and still shows the toast", async () => {
    await render(<Toaster />);
    const guessed = [
      { type: "success" },
      { variant: "error" },
      { variant: "odd" },
      { timeout: 8000 },
      { title: "Saved" },
    ] as unknown as ToastOptions[];
    for (const [index, options] of guessed.entries()) await show(`Guess ${index}`, options);
    const shortcuts = toast as unknown as Record<"success" | "error" | "warning" | "info", (message: string, options?: ToastOptions) => string>;
    await act(async () => {
      shortcuts.success("Saved");
      shortcuts.error("Failed");
      shortcuts.warning("Careful");
      shortcuts.info("Heads up", { description: "More" });
    });
    await expect.poll(() => toasts().length).toBeGreaterThanOrEqual(3);
    expect(warnings()).toEqual([
      '[ouro-ui] toast: type is not an option. Fix: toast("…", { tone: "success" }).',
      '[ouro-ui] toast: variant is not an option. Fix: toast("…", { tone: "destructive" }).',
      '[ouro-ui] toast: variant is not an option. Fix: toast("…", { tone: "secondary" }).',
      '[ouro-ui] toast: timeout is not an option. Fix: toast("…", { duration: 8000 }).',
      '[ouro-ui] toast: title is not an option; the message is the first argument. Fix: toast("Saved").',
      '[ouro-ui] toast: toast.success is not a function. Fix: toast("Saved", { tone: "success" }).',
      '[ouro-ui] toast: toast.error is not a function. Fix: toast("Failed", { tone: "destructive" }).',
      '[ouro-ui] toast: toast.warning is not a function. Fix: toast("Careful", { tone: "warning" }).',
      '[ouro-ui] toast: toast.info is not a function. Fix: toast("Heads up", { tone: "primary" }).',
    ]);
    expect(toastNamed("Heads up")!.getAttribute("data-tone")).toBe("primary");
  });

  it("runs the action, then dismisses the toast", async () => {
    await render(<Toaster />);
    const onClick = vi.fn();
    const item = await show("Recipe deleted", { action: { label: "Undo", onClick }, duration: 0 });
    const undo = [...item.querySelectorAll("button")].find((button) => button.textContent === "Undo")!;
    expect(undo.getAttribute("type")).toBe("button");
    await userEvent.click(undo);
    expect(onClick).toHaveBeenCalledTimes(1);
    await gone("Recipe deleted");
  });

  it("closes from the dismiss button", async () => {
    await render(<Toaster />);
    const item = await show("Saved", { duration: 0 });
    await userEvent.click(item.querySelector<HTMLElement>('button[aria-label="Dismiss"]')!);
    await gone("Saved");
  });

  it("closes one toast with toast.dismiss(id), and all with toast.dismiss()", async () => {
    await render(<Toaster />);
    let first = "";
    await act(async () => {
      first = toast("First", { duration: 0 });
      toast("Second", { duration: 0 });
      toast("Third", { duration: 0 });
    });
    await expect.poll(() => toasts().length).toBe(3);
    await act(async () => toast.dismiss(first));
    await gone("First");
    expect(showing("Second") && showing("Third")).toBe(true);
    await act(async () => toast.dismiss());
    await expect.poll(() => toasts().length).toBe(0);
  });

  it("replaces a showing toast that has the same id", async () => {
    await render(<Toaster />);
    await show("Uploading", { id: "upload", duration: 0 });
    await act(async () => {
      toast("Uploaded", { id: "upload", tone: "success", duration: 0 });
    });
    await expect.poll(() => showing("Uploaded")).toBe(true);
    expect(toasts()).toHaveLength(1);
  });

  it("dismisses itself after duration; 0 and Infinity keep it", async () => {
    await render(<Toaster />);
    await act(async () => {
      toast("Kept", { duration: 0 });
      toast("Kept forever", { duration: Infinity });
      toast("Brief", { duration: 100 });
    });
    await expect.poll(() => showing("Brief")).toBe(true);
    await gone("Brief");
    expect(showing("Kept") && showing("Kept forever")).toBe(true);
  });

  it("queues: up to three show, and older ones wait, inert, until a slot frees", async () => {
    await render(<Toaster />);
    const ids: string[] = [];
    await act(async () => {
      for (const n of [1, 2, 3, 4]) ids.push(toast(`Toast ${n}`, { duration: 0 }));
    });
    await expect.poll(() => toasts().length).toBe(4);
    const limited = () => toasts().filter((item) => item.hasAttribute("data-limited"));
    expect(limited().map((item) => item.querySelector("[data-ouro-toast-title]")!.textContent)).toEqual(["Toast 1"]);
    expect(toastNamed("Toast 1")!.inert).toBe(true);
    await act(async () => toast.dismiss(ids[3]));
    await gone("Toast 4");
    await expect.poll(() => limited().length).toBe(0);
  });

  it("puts toasts in the page in the order they were added, so a screen reader reads them in that order", async () => {
    await render(<Toaster />);
    await act(async () => {
      toast("First", { duration: 0 });
      toast("Second", { duration: 0 });
    });
    await act(async () => {
      toast("Third", { duration: 0 });
    });
    await expect.poll(() => toasts().length).toBe(3);
    expect(toasts().map((item) => item.querySelector("[data-ouro-toast-title]")!.textContent)).toEqual(["First", "Second", "Third"]);
    // The newest is in front.
    expect(Number(getComputedStyle(toastNamed("Third")!).zIndex)).toBeGreaterThan(Number(getComputedStyle(toastNamed("First")!).zIndex));
  });

  it("is announced once, through the Notifications region only (Review Focus 5)", async () => {
    await render(<Toaster />);
    const liveSelector = '[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"]';
    const changes: Array<{ region: Element; text: string }> = [];
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        const target = record.target instanceof Element ? record.target : record.target.parentElement;
        const region = target?.closest(liveSelector);
        if (!region) continue;
        const text =
          record.type === "characterData"
            ? (record.target.textContent ?? "")
            : [...record.addedNodes].map((node) => node.textContent ?? "").join("");
        if (text) changes.push({ region, text });
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    await act(async () => {
      toast("Recipe saved", { tone: "success", description: "In your cookbook." });
      toast("Couldn't sync", { tone: "destructive", action: { label: "Retry", onClick: () => {} } });
    });
    await expect.poll(() => toasts().length).toBe(2);
    // Let height measurement and the enter transition run, which must not repeat the text.
    await elapse(400);
    observer.disconnect();
    const count = (message: string) => changes.filter((change) => change.text.includes(message));
    expect(count("Recipe saved")).toHaveLength(1);
    expect(count("Couldn't sync")).toHaveLength(1);
    for (const change of changes) expect(change.region).toBe(viewport());
    expect(document.querySelector("[data-ouro-announcer]")?.textContent ?? "").toBe("");
    // Spoken in the order they were added.
    expect(changes.map((change) => change.text).findIndex((text) => text.includes("Recipe saved"))).toBeLessThan(
      changes.map((change) => change.text).findIndex((text) => text.includes("Couldn't sync")),
    );
  });

  it("waits for the Toaster when called before it mounts", async () => {
    let early = "";
    await act(async () => {
      early = toast("Early", { duration: 0 });
      toast("Early and gone", { duration: 0 });
      toast.dismiss("Early and gone");
    });
    toast("Early and replaced", { id: "dup", duration: 0 });
    toast("Early, replacing", { id: "dup", duration: 0 });
    expect(early).toMatch(/^ouro-toast-/);
    await render(<Toaster />);
    await expect.poll(() => showing("Early")).toBe(true);
    expect(showing("Early, replacing")).toBe(true);
    expect(toastNamed("Early and replaced")).toBeUndefined();
    await act(async () => toast.dismiss("ouro-toast-unknown"));
    // The check for a missing Toaster runs later, and finds this one.
    await elapse(1200);
    expect(warnings()).toEqual([]);
  });

  it("drops waiting toasts with toast.dismiss() and keeps only the newest twenty", async () => {
    for (let n = 1; n <= 22; n++) toast(`Waiting ${n}`, { duration: 0 });
    await render(<Toaster />);
    await expect.poll(() => toasts().length).toBe(20);
    expect(toastNamed("Waiting 1")).toBeUndefined();
    expect(toastNamed("Waiting 2")).toBeUndefined();
    await act(async () => toast.dismiss());
    await expect.poll(() => toasts().length).toBe(0);
    roots.splice(0).forEach((root) => root.unmount());
    toast("Dropped", { duration: 0 });
    toast.dismiss();
    await render(<Toaster />);
    await act(async () => {});
    expect(toastNamed("Dropped")).toBeUndefined();
  });

  it("warns when no Toaster mounts", async () => {
    toast("Nobody sees this");
    toast("Nor this");
    await expect
      .poll(() => warnings())
      .toEqual(['[ouro-ui] toast: no <Toaster /> is mounted, so "Nobody sees this" is not shown. Fix: render <Toaster /> once, at the root of your app.']);
    toast.dismiss();
  });
});

describe("pausing", () => {
  it("pauses while the pointer is over the toasts, and resumes after", async () => {
    await render(
      <>
        <button type="button">Elsewhere</button>
        <Toaster />
      </>,
    );
    const item = await show("Paused", { duration: 3000 });
    await userEvent.hover(item);
    await expect.poll(() => viewport()!.hasAttribute("data-expanded")).toBe(true);
    await elapse(4000);
    expect(showing("Paused")).toBe(true);
    await userEvent.hover(page.getByRole("button", { name: "Elsewhere" }));
    await gone("Paused");
  });

  it("pauses while a toast has keyboard focus; F6 moves focus to the toasts", async () => {
    await render(
      <>
        <button type="button">Before</button>
        <Toaster />
      </>,
    );
    await userEvent.click(page.getByRole("button", { name: "Before" }));
    await show("Focused", { duration: 3000 });
    await userEvent.keyboard("{F6}");
    await expect.poll(() => viewport()!.contains(document.activeElement)).toBe(true);
    await elapse(4000);
    expect(showing("Focused")).toBe(true);
  });
});

describe("swiping", () => {
  async function swipe(item: HTMLElement, dx: number, dy: number) {
    const rect = item.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    await commands.drag({ from: [x, y], to: [x + dx, y + dy], steps: 12, durationMs: 200 });
  }

  chromiumOnly("dismisses with a swipe down, right or left", async () => {
    await render(<Toaster />);
    for (const [message, dx, dy] of [
      ["Down", 0, 120],
      ["Right", 200, 0],
      ["Left", -200, 0],
    ] as const) {
      const item = await show(message, { duration: 0 });
      await swipe(item, dx, dy);
      await gone(message);
    }
  });

  chromiumOnly("springs back after a short swipe, and a swipe up does not dismiss", async () => {
    await render(<Toaster />);
    const item = await show("Stays", { duration: 0 });
    await swipe(item, 0, -120);
    await swipe(item, 0, 4);
    await elapse(300);
    expect(showing("Stays")).toBe(true);
  });
});

describe("motion", () => {
  it("slides and springs, and only fades with reduced motion", async () => {
    await render(<Toaster />);
    const item = await show("Moving", { duration: 0 });
    expect(getComputedStyle(item).transitionProperty).toContain("transform");
    await commands.emulateMedia({ reducedMotion: "reduce" });
    expect(getComputedStyle(item).transitionProperty).toBe("opacity");
    const fresh = await show("Still", { duration: 0 });
    expect(getComputedStyle(fresh).transitionProperty).toBe("opacity");
  });
});
