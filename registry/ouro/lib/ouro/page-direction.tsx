"use client";

import { DirectionProvider, useDirection } from "@base-ui/react/direction-provider";
import { useSyncExternalStore, type JSX, type ReactNode } from "react";

// One observer of the page's `dir` for every component that follows it, however many are on the page.
const listeners = new Set<() => void>();
let observer: MutationObserver | undefined;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (observer === undefined) {
    observer = new MutationObserver(() => listeners.forEach((notify) => notify()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["dir"] });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    observer!.disconnect();
    observer = undefined;
  };
}

const pageIsRtl = () => document.documentElement.dir.toLowerCase() === "rtl";
const onServer = () => false;

/**
 * Gives the Base UI parts inside it the page's reading direction: a page with `dir="rtl"` on `<html>` gets right-to-left
 * arrow keys (ArrowLeft moves to the next tab, raises a slider, opens a submenu) with no provider of the app's own. A
 * `DirectionProvider` the app wraps around it still decides in a left-to-right page. The server renders left to
 * right, and the browser switches once it has hydrated.
 *
 * Internal: Ouro UI components use it; apps don't need to.
 *
 * @example
 * <PageDirection>
 *   <BaseTabs.Root>…</BaseTabs.Root>
 * </PageDirection>
 * @claim "Gives the Base UI parts inside" registry/ouro/lib/ouro/page-direction.test.tsx verify:testExists(registry/ouro/lib/ouro/page-direction.test.tsx::PageDirection > gives its parts the page's direction, and follows the page when its dir changes)
 * @claim "still decides in a left-to-right page" registry/ouro/lib/ouro/page-direction.test.tsx verify:testExists(registry/ouro/lib/ouro/page-direction.test.tsx::PageDirection > leaves an app's own direction in a left-to-right page, and renders left to right on the server)
 */
export function PageDirection({ children }: { children: ReactNode }): JSX.Element {
  const rtl = useSyncExternalStore(subscribe, pageIsRtl, onServer);
  const own = useDirection();
  return <DirectionProvider direction={rtl ? "rtl" : own}>{children}</DirectionProvider>;
}
