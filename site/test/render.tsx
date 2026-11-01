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
  // The header is an island on the docs pages: the server's HTML has it, but a client render shows
  // it once its chunk loads, and it pushes the page down then. Wait for it, so nothing moves mid-test.
  await expect.poll(() => host.querySelector("[data-site-brand]")).not.toBeNull();
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
 * Brings the page to rest after a render or a click: every finite animation and transition in the
 * document is finished, which ends it as playing it out would (its last frame, its finish events),
 * and checked again two frames later in case one started meanwhile. Finished, not waited for: the
 * Nautilus's squid stirs for 7.8 seconds after load, and waiting for it spent that much of every
 * scan's time limit on that page before the scan began.
 */
export async function settle(): Promise<void> {
  for (let round = 0; round < 50; round++) {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const running = document
      .getAnimations()
      .filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().endTime) && animation.playState === "running");
    if (running.length === 0) return;
    for (const animation of running) animation.finish();
    await Promise.all(running.map((animation) => animation.finished.catch(() => undefined)));
  }
  throw new Error("animations did not settle");
}

/** The gate's findings as readable lines. */
export const describeViolations = describeFindings;

/**
 * How long one page's scan may take, as long as a story's (test/story-axe.ts): text axe could not
 * judge is measured from screenshots, and a page of wide tables takes several, slower in CI. Every
 * test that scans a whole page takes it, the voyage's presets included: one of those scans took
 * 17s on a loaded runner, past the default 15s.
 *
 * @claim "one of those scans took 17s" https://github.com/ourostack/ouro-ui/actions/runs/41041013638 verify:fileLine(site/src/voyage/voyage.test.tsx, /\}, pageScanTimeout\);/)
 */
export const pageScanTimeout = 30_000;

/**
 * Runs the accessibility gate over the whole document (`audit` in the test kit): a site page is a
 * full page, so every rule applies, every violation fails whatever its impact, and every check axe
 * could not decide fails unless a measurement passes it.
 */
export async function scan(): Promise<GateFinding[]> {
  // Base UI's focus guards are excluded for the reason given in test/story-axe.ts.
  return audit({ include: [document.documentElement], exclude: axeExclude.map((selector) => [selector]) });
}
