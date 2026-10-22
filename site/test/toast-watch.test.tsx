import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { Toaster } from "@/registry/ouro/components/ouro/toast/toaster";
import { toast } from "@/registry/ouro/lib/ouro/toast";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { toastWatcher, type ToastRecord } from "../e2e/toasts";

// The in-page half of site/e2e/toasts.ts, which the site's specs use to check that a toast never
// covers what it is about. It runs here against a real Toaster, with motion on.

let root: Root | undefined;
const nodes: Element[] = [];
afterEach(async () => {
  await act(async () => toast.dismiss());
  await act(async () => root?.unmount());
  for (const node of nodes.splice(0)) node.remove();
});

/** Mounts a Toaster, and a fixed 300x80 element at `edge` of the screen. */
async function stage(edge: "top" | "bottom") {
  const element = document.createElement("div");
  element.id = "watched";
  Object.assign(element.style, { position: "fixed", left: "0", width: "100%", height: "80px", [edge]: "0" });
  const host = document.createElement("div");
  document.body.append(element, host);
  nodes.push(element, host);
  root = createRoot(host);
  await act(async () => root!.render(<Toaster />));
}

const record = () => (window as unknown as { ouroToasts: ToastRecord }).ouroToasts;

/** Waits on frames until the first toast has been judged in `frames` settled frames. */
async function settledFor(frames: number) {
  const deadline = performance.now() + 10_000;
  while (record().settled < frames && performance.now() < deadline) await new Promise((resolve) => requestAnimationFrame(resolve));
  expect(record().settled).toBeGreaterThanOrEqual(frames);
}

it("reports a toast that settles over the element as covering it, though it slid in from below, clear of it", async () => {
  await stage("bottom");
  toastWatcher({ selector: "#watched", kind: "below" });
  await act(async () => {
    toast("Covers it", { duration: 0 });
  });
  // The slide starts below the toast's place, where it does not cover the element yet.
  const item = document.querySelector<HTMLElement>('[data-ouro="toast"]')!;
  expect(item.hasAttribute("data-starting-style") || item.getAnimations().length > 0).toBe(true);
  await settledFor(5);
  expect(record().overlapped).toBe(true);
  expect(record().titles).toEqual(["Covers it"]);
});

it("reports a toast that settles below the element as clear of it", async () => {
  await stage("top");
  toastWatcher({ selector: "#watched", kind: "below" });
  await act(async () => {
    toast("Clear of it", { duration: 0 });
  });
  await settledFor(5);
  expect(record().overlapped).toBe(false);
});

it("keeps the title of a toast that has already gone", async () => {
  await stage("top");
  toastWatcher();
  await act(async () => {
    toast("Brief", { duration: 0 });
  });
  const deadline = performance.now() + 10_000;
  while (!record().titles.includes("Brief") && performance.now() < deadline) await new Promise((resolve) => requestAnimationFrame(resolve));
  await act(async () => toast.dismiss());
  while (document.querySelector('[data-ouro="toast"]') && performance.now() < deadline) await new Promise((resolve) => requestAnimationFrame(resolve));
  expect(record().titles).toEqual(["Brief"]);
});
