"use client";

import { reachable, tabbable } from "@/registry/ouro/lib/ouro/focus-handoff";

const OPEN_DIALOG = '[role="dialog"][data-open]:not([data-ouro="toast"])';

/**
 * A modal dialog traps Tab, so toasts outside it need their own way in. While a
 * dialog holds focus, Tab past its last control goes to the toasts, and Tab past the last toast control
 * returns to the dialog's first (Shift+Tab goes the other way), so a toast's action stays within reach.
 */
export function reachModal(viewport: HTMLElement): () => void {
  const tabbables = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>(tabbable)].filter(reachable);
  // A modal traps Tab and, where it can, hides the rest of the page; a popover left non-modal does neither.
  const hidesPage = (dialog: HTMLElement) =>
    dialog.hasAttribute("data-ouro-modal") ||
    [...document.body.children].some((child) => child.getAttribute("aria-hidden") === "true" && !child.contains(dialog) && !child.contains(viewport));
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Tab" || event.defaultPrevented) return;
    const active = document.activeElement as HTMLElement | null;
    const inToasts = active !== null && viewport.contains(active);
    const dialog = inToasts ? [...document.querySelectorAll<HTMLElement>(OPEN_DIALOG)].pop() : active?.closest<HTMLElement>(OPEN_DIALOG);
    if (!dialog || viewport.contains(dialog) || !hidesPage(dialog)) return;
    const inside = tabbables(dialog);
    const toasts = tabbables(viewport);
    if (inside.length === 0 || toasts.length === 0) return;
    const own = inToasts ? toasts : inside;
    const other = inToasts ? inside : toasts;
    if (active !== (event.shiftKey ? own[0] : own[own.length - 1])) return;
    event.preventDefault();
    (event.shiftKey ? other[other.length - 1] : other[0])?.focus();
  };
  document.addEventListener("keydown", onKeyDown, true);
  return () => document.removeEventListener("keydown", onKeyDown, true);
}
