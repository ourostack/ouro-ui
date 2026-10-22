import { afterEach, expect, it } from "vitest";
import { keepClearOfToasts } from "./clear-of-toasts";

// keepClearOfToasts: once a toast shows, the page scrolls just enough that what it is about sits
// clear above the stack. The toast may mount a few frames after the press, when the page is busy
// (a chapter's island hydrating, say), and it still scrolls then.

const frames = (count: number) =>
  new Promise<void>((resolve) => {
    const step = (left: number) => (left === 0 ? resolve() : requestAnimationFrame(() => step(left - 1)));
    step(count);
  });

afterEach(() => {
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
