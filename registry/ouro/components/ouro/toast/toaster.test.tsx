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

/** The toasts' messages, in page order. */
const titles = () => toasts().map((item) => item.querySelector("[data-ouro-toast-title]")!.textContent);

/** Records the text each live region exposes as it changes; text inside aria-hidden is not exposed. */
function watchAnnouncements() {
  const liveSelector = '[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"]';
  const changes: Array<{ region: Element; text: string }> = [];
  const exposed = (node: Node) => {
    const element = node instanceof Element ? node : node.parentElement;
    return !element?.closest('[aria-hidden="true"]');
  };
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      const nodes = record.type === "characterData" ? [record.target] : [...record.addedNodes];
      for (const node of nodes) {
        // Text added inside a live region, or a live region added with its text.
        const region = target?.closest(liveSelector) ?? (node instanceof Element ? (node.matches(liveSelector) ? node : node.querySelector(liveSelector)) : null);
        const text = exposed(node) ? (node.textContent ?? "") : "";
        if (region && text) changes.push({ region, text });
      }
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  const matching = (message: string) => changes.filter((change) => change.text.includes(message));
  return { changes, matching, count: (message: string) => matching(message).length, stop: () => observer.disconnect() };
}

/** Waits until the toast is gone from the page. */
const gone = (message: string) => expect.poll(() => toastNamed(message)).toBeUndefined();

/** Polls until `ms` milliseconds have passed: a condition, so a loaded runner just waits longer. */
async function elapse(ms: number) {
  const start = performance.now();
  await expect.poll(() => performance.now() - start >= ms).toBe(true);
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(async () => {
  // A pointer left where an earlier test pressed a toast would hover new ones and pause them.
  await moveMouseAway();
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

/** Moves the pointer to the top corner of the page, away from the toasts. */
async function moveMouseAway() {
  const corner = document.createElement("div");
  Object.assign(corner.style, { position: "fixed", top: "0", left: "0", width: "8px", height: "8px" });
  document.body.append(corner);
  await userEvent.hover(corner);
  corner.remove();
}
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

  it("shows toasts in one Toaster only, warns when a second is rendered, and lets the second take over when the first unmounts", async () => {
    const first = await render(<Toaster label="First" />);
    await render(<Toaster label="Second" />);
    expect(document.querySelectorAll('[data-ouro="toaster"]')).toHaveLength(1);
    expect(viewport()!.getAttribute("aria-label")).toBe("First");
    await show("Saved", { duration: 0 });
    expect(toasts()).toHaveLength(1);
    expect(warnings()).toContain(
      "[ouro-ui] Toaster: another <Toaster /> is already mounted, so this one shows toasts only after that one unmounts. Fix: render <Toaster /> once, at the root of your app.",
    );
    await first.unmount();
    await expect.poll(() => viewport()?.getAttribute("aria-label")).toBe("Second");
    await show("Saved again", { duration: 0 });
    expect(document.querySelectorAll('[data-ouro="toaster"]')).toHaveLength(1);
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
      const icon = item.querySelector("[data-ouro-toast-icon]");
      icons[tone] = icon !== null;
      if (icon) expect(icon.getAttribute("aria-hidden")).toBe("true");
      // Three show at once; make room for the next.
      await act(async () => toast.dismiss());
      await gone(`A ${tone} toast`);
    }
    expect(icons).toEqual({ secondary: false, primary: true, success: true, warning: true, destructive: true });
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
    for (const [index, options] of guessed.entries()) {
      await show(`Guess ${index}`, options);
      // Three show at once; make room for the next.
      await act(async () => toast.dismiss());
      await gone(`Guess ${index}`);
    }
    const shortcuts = toast as unknown as Record<"success" | "error" | "warning" | "info", (message: string, options?: ToastOptions) => string>;
    let saved = "";
    await act(async () => {
      saved = shortcuts.success("Saved");
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
    // The fourth waits for a slot.
    await act(async () => toast.dismiss(saved));
    await expect.poll(() => toastNamed("Heads up")?.getAttribute("data-tone")).toBe("primary");
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

  it("keeps a toast that has an action until it is dismissed, unless duration is given", async () => {
    await render(<Toaster />);
    await act(async () => {
      toast("Recipe deleted", { action: { label: "Undo", onClick: () => {} } });
      toast("Brief undo", { duration: 100, action: { label: "Undo", onClick: () => {} } });
      toast("Plain");
    });
    await gone("Brief undo");
    // A toast with no action goes after the default 5s; the one with an action stays.
    await expect.poll(() => toastNamed("Plain"), { timeout: 9000 }).toBeUndefined();
    await elapse(300);
    expect(showing("Recipe deleted")).toBe(true);
  });

  it("warns for a negative or NaN duration and uses the default", async () => {
    await render(<Toaster />);
    await act(async () => {
      toast("Negative", { duration: -1 });
      toast("Not a number", { duration: Number.NaN });
    });
    expect(warnings()).toEqual([
      '[ouro-ui] toast: duration: -1 is not a duration; use milliseconds, or 0 to keep the toast. Fix: toast("…", { duration: 5000 }).',
      '[ouro-ui] toast: duration: NaN is not a duration; use milliseconds, or 0 to keep the toast. Fix: toast("…", { duration: 5000 }).',
    ]);
    await expect.poll(() => showing("Negative")).toBe(true);
    await expect.poll(() => toastNamed("Negative"), { timeout: 8000 }).toBeUndefined();
    await expect.poll(() => toastNamed("Not a number"), { timeout: 2000 }).toBeUndefined();
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

  it("queues: up to three show, and later ones wait, out of the page, until a slot frees", async () => {
    await render(<Toaster />);
    const ids: string[] = [];
    await act(async () => {
      for (const n of [1, 2, 3, 4, 5]) ids.push(toast(`Toast ${n}`, { duration: 0 }));
    });
    await expect.poll(() => titles()).toEqual(["Toast 3", "Toast 2", "Toast 1"]);
    expect(toasts().some((item) => item.inert || item.hasAttribute("data-limited"))).toBe(false);
    await act(async () => toast.dismiss(ids[1]));
    await expect.poll(() => titles()).toEqual(["Toast 4", "Toast 3", "Toast 1"]);
    await act(async () => toast.dismiss(ids[0]));
    await expect.poll(() => titles()).toEqual(["Toast 5", "Toast 4", "Toast 3"]);
  });

  it("starts a waiting toast's countdown only when it shows, so it shows for its full duration and is announced once", async () => {
    await render(<Toaster />);
    const ids: string[] = [];
    await act(async () => {
      for (const n of [1, 2, 3]) ids.push(toast(`Kept ${n}`, { duration: 0 }));
    });
    const announced = watchAnnouncements();
    await act(async () => {
      toast("Timed", { duration: 1500 });
    });
    // Longer than its duration: it is still waiting, unseen and unspoken, not expired.
    await elapse(2000);
    expect(toastNamed("Timed")).toBeUndefined();
    expect(announced.count("Timed")).toBe(0);
    await act(async () => toast.dismiss(ids[0]));
    await expect.poll(() => showing("Timed")).toBe(true);
    const shownAt = performance.now();
    await gone("Timed");
    expect(performance.now() - shownAt).toBeGreaterThanOrEqual(1400);
    expect(announced.count("Timed")).toBe(1);
    announced.stop();
  });

  it("shows a timed toast for its full duration when three newer ones arrive, then shows the next", async () => {
    await render(<Toaster />);
    await show("Timed first", { duration: 1500 });
    const shownAt = performance.now();
    await act(async () => {
      for (const n of [2, 3, 4]) toast(`Toast ${n}`, { duration: 0 });
    });
    await expect.poll(() => titles()).toEqual(["Toast 3", "Toast 2", "Timed first"]);
    await gone("Timed first");
    expect(performance.now() - shownAt).toBeGreaterThanOrEqual(1400);
    await expect.poll(() => titles()).toEqual(["Toast 4", "Toast 3", "Toast 2"]);
  });

  it("dismisses a waiting toast by id, so it never shows", async () => {
    await render(<Toaster />);
    const ids: string[] = [];
    let waiting = "";
    await act(async () => {
      for (const n of [1, 2, 3]) ids.push(toast(`Kept ${n}`, { duration: 0 }));
      waiting = toast("Never shown", { duration: 0 });
      toast("Shown later", { duration: 0 });
    });
    await act(async () => toast.dismiss(waiting));
    await act(async () => toast.dismiss(ids[0]));
    await expect.poll(() => titles()).toEqual(["Shown later", "Kept 3", "Kept 2"]);
    await act(async () => toast.dismiss(ids[1]));
    await expect.poll(() => titles()).toEqual(["Shown later", "Kept 3"]);
    expect(toastNamed("Never shown")).toBeUndefined();
  });

  it("replaces a waiting toast that has the same id, in its place in the queue", async () => {
    await render(<Toaster />);
    const ids: string[] = [];
    await act(async () => {
      for (const n of [1, 2, 3]) ids.push(toast(`Kept ${n}`, { duration: 0 }));
      toast("Uploading", { id: "upload", duration: 0 });
      toast("Next", { duration: 0 });
      toast("Uploaded", { id: "upload", duration: 0 });
    });
    await act(async () => toast.dismiss(ids[0]));
    await expect.poll(() => titles()).toEqual(["Uploaded", "Kept 3", "Kept 2"]);
  });

  it("puts the newest toast first in the page, where F6 then Tab reaches it, then each older one", async () => {
    await render(<Toaster />);
    await act(async () => {
      toast("First", { duration: 0 });
      toast("Second", { duration: 0 });
    });
    await act(async () => {
      toast("Third", { duration: 0 });
    });
    await expect.poll(() => toasts().length).toBe(3);
    expect(titles()).toEqual(["Third", "Second", "First"]);
    // The newest is in front.
    expect(Number(getComputedStyle(toastNamed("Third")!).zIndex)).toBeGreaterThan(Number(getComputedStyle(toastNamed("First")!).zIndex));
  });

  it("is announced once: politely through the Notifications region, and a destructive toast assertively (Review Focus 5)", async () => {
    await render(<Toaster />);
    const announced = watchAnnouncements();
    await act(async () => {
      toast("Recipe saved", { tone: "success", description: "In your cookbook." });
    });
    await act(async () => {
      toast("Photo added", { tone: "primary" });
    });
    await act(async () => {
      toast("Couldn't sync", { tone: "destructive", description: "Check your connection.", action: { label: "Retry", onClick: () => {} } });
    });
    await expect.poll(() => toasts().length).toBe(3);
    // Let height measurement and the enter transition run, which must not repeat the text.
    await elapse(400);
    announced.stop();
    expect(announced.count("Recipe saved")).toBe(1);
    expect(announced.count("Photo added")).toBe(1);
    expect(announced.matching("Recipe saved")[0]!.region).toBe(viewport());
    expect(announced.matching("Photo added")[0]!.region).toBe(viewport());
    // The destructive toast is spoken once, through an alert, and hidden from the polite region.
    expect(announced.count("Couldn't sync")).toBe(1);
    expect(announced.matching("Couldn't sync")[0]!.region.getAttribute("role")).toBe("alert");
    expect(toastNamed("Couldn't sync")!.getAttribute("aria-hidden")).toBe("true");
    expect(document.querySelector("[data-ouro-announcer]")?.textContent ?? "").toBe("");
    // Polite toasts are spoken in the order they were added.
    const texts = announced.changes.map((change) => change.text);
    expect(texts.findIndex((text) => text.includes("Recipe saved"))).toBeLessThan(texts.findIndex((text) => text.includes("Photo added")));
  });

  it("waits for the Toaster when called before it mounts", async () => {
    let early = "";
    await act(async () => {
      early = toast("Early", { duration: 0 });
      const gone = toast("Early and gone", { duration: 0 });
      toast.dismiss(gone);
    });
    toast("Early and replaced", { id: "dup", duration: 0 });
    toast("Early, replacing", { id: "dup", duration: 0 });
    expect(early).toMatch(/^ouro-toast-/);
    await render(<Toaster />);
    await expect.poll(() => showing("Early")).toBe(true);
    expect(showing("Early, replacing")).toBe(true);
    expect(toastNamed("Early and replaced")).toBeUndefined();
    expect(toastNamed("Early and gone")).toBeUndefined();
    await act(async () => toast.dismiss("ouro-toast-unknown"));
    // The check for a missing Toaster runs later, and finds this one.
    await elapse(1200);
    expect(warnings()).toEqual([]);
  });

  it("drops waiting toasts with toast.dismiss() and keeps only the newest twenty", async () => {
    for (let n = 1; n <= 22; n++) toast(`Waiting ${n}`, { duration: 0 });
    await render(<Toaster />);
    // The oldest two were dropped; the next three show, and the other fifteen wait their turn.
    await expect.poll(() => titles()).toEqual(["Waiting 5", "Waiting 4", "Waiting 3"]);
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

describe("keyboard", () => {
  it("reaches and runs the oldest toast's action with F6, then Tab", async () => {
    await render(
      <>
        <button type="button">Before</button>
        <Toaster />
      </>,
    );
    const undo = vi.fn();
    for (const name of ["A", "B", "C"]) {
      await show(name, { action: { label: `Undo ${name}`, onClick: name === "A" ? undo : () => {} } });
    }
    await userEvent.click(page.getByRole("button", { name: "Before" }));
    await userEvent.keyboard("{F6}");
    await expect.poll(() => viewport()!.contains(document.activeElement)).toBe(true);
    const reached: string[] = [];
    for (let presses = 0; presses < 12 && document.activeElement?.textContent !== "Undo A"; presses++) {
      await userEvent.keyboard("{Tab}");
      reached.push(document.activeElement?.textContent ?? "");
    }
    expect(document.activeElement?.textContent).toBe("Undo A");
    expect(reached.filter((text) => text.startsWith("Undo "))).toEqual(["Undo C", "Undo B", "Undo A"]);
    await userEvent.keyboard("{Enter}");
    expect(undo).toHaveBeenCalledTimes(1);
    await gone("A");
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
