import { createRoot, type Root, type RootOptions } from "react-dom/client";
import type { ReactNode } from "react";
import { expect } from "vitest";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { App, loadPage } from "../src/app";
import { docsItems } from "../src/docs/items";
import { audit, axeExclude, describeFindings, type GateFinding } from "@/registry/ouro/lib/ouro/testing/axe";

let mounted: { root: Root; host: HTMLElement } | undefined;

/** Client-renders a page and waits for real docs demo content, not its loading shell. */
export async function renderPage(path: string): Promise<HTMLElement> {
  const Page = await loadPage(path);
  const host = await renderFixture(<App path={path} Page={Page} />);
  const name = /^\/docs\/([^/]+)\/$/.exec(path)?.[1];
  if (name && docsItems.some((item) => item.name === name)) {
    await expect.poll(() => host.querySelector(`[data-site-demo="${name}"]`)?.childElementCount ?? 0).toBeGreaterThan(0);
    expect(host.querySelector("[data-site-demo-loading]")).toBeNull();
  }
  return host;
}

/** A client-rendered fixture; caught-error callbacks belong only to explicit negative cases. */
export async function renderFixture(node: ReactNode, options?: RootOptions): Promise<HTMLElement> {
  await cleanupPage();
  const host = document.createElement("div");
  host.id = "root";
  document.body.append(host);
  const root = createRoot(host, options);
  await act(() => root.render(node));
  mounted = { root, host };
  return host;
}

export async function cleanupPage(): Promise<void> {
  if (!mounted) return;
  const { root, host } = mounted;
  mounted = undefined;
  await act(() => root.unmount());
  host.remove();
}

export async function rerenderFixture(node: ReactNode): Promise<void> {
  if (!mounted) throw new Error("No site fixture is mounted");
  const { root } = mounted;
  await act(() => root.render(node));
}

/** shadcn's `.dark` class on <html>, as the site's head script sets it from the OS setting. */
export function setScheme(scheme: "light" | "dark"): void {
  document.documentElement.classList.toggle("dark", scheme === "dark");
}

/**
 * Waits for transitions started by a render or a click to finish: every finite
 * animation and transition in the document, checked again a frame later in case one
 * started meanwhile. A condition, not a timer, so a loaded runner only waits longer.
 */
export async function settle(): Promise<void> {
  for (let round = 0; round < 50; round++) {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const running = document
      .getAnimations()
      .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity && animation.playState === "running");
    if (running.length === 0) return;
    await Promise.all(running.map((animation) => animation.finished.catch(() => undefined)));
  }
  throw new Error("animations did not settle");
}

/** The gate's findings as readable lines. */
export const describeViolations = describeFindings;

/**
 * Runs the accessibility gate over the whole document (`audit` in the test kit): a site page is a
 * full page, so every rule applies, every violation fails whatever its impact, and every check axe
 * could not decide fails unless a measurement passes it.
 */
export async function scan(): Promise<GateFinding[]> {
  // Base UI's focus guards are excluded for the reason given in test/story-axe.ts.
  return audit({ include: [document.documentElement], exclude: axeExclude.map((selector) => [selector]) });
}
