import { afterEach, expect, it, vi } from "vitest";
import { keepClearOfToasts } from "./clear-of-toasts";

// keepClearOfToasts: once a toast shows, the page scrolls just enough that what it is about sits
// clear above the stack. The toast may mount a few frames after the press, when the page is busy
// (a chapter's island hydrating, say), and it still scrolls then, starting as the toast mounts, so
// the toast is never seen at rest over what it is about.

const frames = (count: number) =>
  new Promise<void>((resolve) => {
    const step = (left: number) => (left === 0 ? resolve() : requestAnimationFrame(() => step(left - 1)));
    step(count);
  });

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  window.scrollTo({ top: 0, behavior: "instant" });
});

/** A tall page with a button at the foot of the screen, where the toast stack shows. */
function setUp(): { button: HTMLButtonElement; stack: HTMLElement } {
  const page = document.createElement("div");
  page.style.cssText = "position: relative; height: 3000px;";
  const button = document.createElement("button");
  button.textContent = "Ring";
  button.style.cssText = `position: absolute; top: ${innerHeight - 50}px; left: 16px; height: 44px;`;
  page.append(button);
  const stack = document.createElement("section");
  stack.dataset["ouro"] = "toaster";
  stack.style.cssText = "position: fixed; inset-inline: 0; bottom: 0; height: 120px;";
  document.body.append(page, stack);
  return { button, stack };
}

function showToast(stack: HTMLElement): void {
  const toast = document.createElement("div");
  toast.dataset["ouro"] = "toast";
  toast.style.cssText = "position: absolute; bottom: 16px; inset-inline: 16px; height: 64px;";
  stack.append(toast);
}

/** Where the front toast's top rests: the stack's foot, less the toast and its 12 px margin. */
const toastTop = () => innerHeight - 64 - 12;

it("scrolls the element clear above a toast that is already showing", async () => {
  const { button, stack } = setUp();
  showToast(stack);
  keepClearOfToasts(button);
  await expect.poll(() => button.getBoundingClientRect().bottom).toBeLessThanOrEqual(toastTop());
});

it("scrolls the element clear above a toast that mounts some frames after the call", async () => {
  const { button, stack } = setUp();
  keepClearOfToasts(button);
  await frames(6);
  expect(window.scrollY).toBe(0);
  showToast(stack);
  await expect.poll(() => button.getBoundingClientRect().bottom).toBeLessThanOrEqual(toastTop());
});

it("starts the scroll as the toast mounts, before the frame that first paints it", async () => {
  const { button, stack } = setUp();
  const scrollBy = vi.spyOn(window, "scrollBy");
  keepClearOfToasts(button);
  await frames(3);
  showToast(stack);
  // The observer's callback is a microtask: it runs before any frame.
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  expect(scrollBy).toHaveBeenCalledOnce();
  await expect.poll(() => button.getBoundingClientRect().bottom).toBeLessThanOrEqual(toastTop());
});

it("checks again once a scroll already under way when the toast mounts has come to rest", async () => {
  const { button, stack } = setUp();
  // The page is part-way down a scroll (the browser's own, after focus, say) that will end with the
  // button at the foot of the screen, under the toast; when the toast mounts it is still clear.
  window.scrollTo({ top: 300, behavior: "instant" });
  keepClearOfToasts(button);
  showToast(stack);
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  for (let top = 270; top >= 0; top -= 30) {
    window.scrollTo({ top, behavior: "instant" });
    await frames(1);
  }
  await expect.poll(() => button.getBoundingClientRect().bottom).toBeLessThanOrEqual(toastTop());
});

it("leaves the page alone when a scroll under way carries the element off the screen", async () => {
  const { button, stack } = setUp();
  // A reader flicking back up the page: the button ends below the screen, which no toast covers.
  button.style.top = `${innerHeight + 1000}px`;
  window.scrollTo({ top: 1400, behavior: "instant" });
  keepClearOfToasts(button);
  showToast(stack);
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  const scrollBy = vi.spyOn(window, "scrollBy");
  for (let top = 1300; top >= 0; top -= 100) {
    window.scrollTo({ top, behavior: "instant" });
    await frames(1);
  }
  await frames(10);
  expect(scrollBy).not.toHaveBeenCalled();
  expect(window.scrollY).toBe(0);
});
