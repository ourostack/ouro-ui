import { afterEach, describe, expect, it } from "vitest";
import "@/registry/ouro/components/ouro/toast/toaster-parts";

afterEach(() => {
  document.body.replaceChildren();
});

function build(options: { modal?: boolean; hideSibling?: boolean; dialogButtons?: number; toastButtons?: number; dialogInViewport?: boolean } = {}) {
  const { modal = true, hideSibling = false, dialogButtons = 2, toastButtons = 2, dialogInViewport = false } = options;
  const viewport = document.createElement("div");
  viewport.dataset.ouro = "toaster";
  const dialog = document.createElement("div");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("data-open", "");
  if (modal) dialog.setAttribute("data-ouro-modal", "");
  const make = (parent: HTMLElement, n: number, name: string) =>
    Array.from({ length: n }, (_, i) => {
      const b = document.createElement("button");
      b.textContent = `${name}${i}`;
      parent.append(b);
      return b;
    });
  const inside = make(dialog, dialogButtons, "d");
  const toasts = make(viewport, toastButtons, "t");
  if (dialogInViewport) viewport.append(dialog);
  else document.body.append(dialog);
  document.body.append(viewport);
  if (hideSibling) {
    const sibling = document.createElement("div");
    sibling.setAttribute("aria-hidden", "true");
    document.body.append(sibling);
  }
  return { viewport, dialog, inside, toasts };
}

const press = (target: Element, key = "Tab", shiftKey = false) => {
  const event = new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
};

describe("reachModal", () => {
  it("sends Tab from a dialog's last control to the first toast control, and Shift+Tab back", () => {
    const { inside, toasts } = build();
    inside[1]!.focus();
    expect(press(inside[1]!).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(toasts[0]);
    expect(press(toasts[0]!, "Tab", true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(inside[1]);
  });

  it("sends Shift+Tab from a dialog's first control to the last toast control, and Tab from the last toast to the first control", () => {
    const { inside, toasts } = build();
    inside[0]!.focus();
    expect(press(inside[0]!, "Tab", true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(toasts[1]);
    expect(press(toasts[1]!).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(inside[0]);
  });

  it("leaves Tab in the middle of either list to the browser", () => {
    const { inside, toasts } = build();
    inside[0]!.focus();
    expect(press(inside[0]!).defaultPrevented).toBe(false);
    toasts[0]!.focus();
    expect(press(toasts[0]!).defaultPrevented).toBe(false);
    inside[1]!.focus();
    expect(press(inside[1]!, "Tab", true).defaultPrevented).toBe(false);
    toasts[1]!.focus();
    expect(press(toasts[1]!, "Tab", true).defaultPrevented).toBe(false);
  });

  it("does nothing for another key", () => {
    const { inside } = build();
    inside[1]!.focus();
    expect(press(inside[1]!, "Enter").defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(inside[1]);
  });

  it("does nothing when focus is on the page body, not in a dialog or toast", () => {
    build();
    (document.activeElement as HTMLElement).blur();
    expect(press(document.body).defaultPrevented).toBe(false);
  });

  it("does nothing for focus outside any dialog", () => {
    build();
    const outside = document.body.appendChild(document.createElement("button"));
    outside.focus();
    expect(press(outside).defaultPrevented).toBe(false);
  });

  it("does nothing when the dialog neither is marked modal nor hides the page", () => {
    const { inside } = build({ modal: false });
    document.body.append(document.createElement("div"));
    inside[1]!.focus();
    expect(press(inside[1]!).defaultPrevented).toBe(false);
  });

  it("acts on a dialog that hides the rest of the page without the modal mark", () => {
    const { inside, toasts } = build({ modal: false, hideSibling: true });
    inside[1]!.focus();
    expect(press(inside[1]!).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(toasts[0]);
  });

  it("does nothing when the toasts hold no control, or the dialog holds none", () => {
    const noToast = build({ toastButtons: 0 });
    noToast.inside[1]!.focus();
    expect(press(noToast.inside[1]!).defaultPrevented).toBe(false);
    document.body.replaceChildren();
    const noInside = build({ dialogButtons: 0 });
    const t = noInside.toasts[1]!;
    t.focus();
    expect(press(t).defaultPrevented).toBe(false);
  });

  it("skips a toast control that is not rendered when finding the toasts' ends", () => {
    const { inside, toasts } = build();
    toasts[0]!.style.display = "none";
    inside[1]!.focus();
    expect(press(inside[1]!).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(toasts[1]);
  });

  it("does nothing for a dialog inside the toasts' own viewport", () => {
    const { inside } = build({ dialogInViewport: true });
    inside[1]!.focus();
    expect(press(inside[1]!).defaultPrevented).toBe(false);
  });

  it("does nothing once the toasts' viewport is gone", () => {
    const { inside, viewport } = build();
    viewport.remove();
    inside[1]!.focus();
    expect(press(inside[1]!).defaultPrevented).toBe(false);
  });
});
