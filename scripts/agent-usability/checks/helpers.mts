import { expect, type ElementHandle, type Locator, type Page } from "@playwright/test";

// What every screen's checks share. Checks find elements the way a person or a screen reader
// would (role, accessible name, label, text), so they hold for any component library.

/** A screen's behavior check. `covers` names the acceptance items (task.md) it proves. */
export interface Check {
  id: string;
  title: string;
  covers: number[];
  viewport: Viewport;
  run(page: Page): Promise<void>;
}

/** A state the accessibility scan also covers, besides the first render. The task names it. */
export interface State {
  name: string;
  /** Only at this viewport; both when left out. */
  viewport?: Viewport;
  reach(page: Page): Promise<void>;
}

export interface ScreenChecks {
  /** Resolves once the screen has loaded its data. */
  ready(page: Page): Promise<void>;
  states: State[];
  checks: Check[];
  /** Acceptance items no behavior check covers, and what judges them instead. */
  judgedElsewhere: Record<number, string>;
}

export type Viewport = "phone" | "desktop";

export const axeScan = "the accessibility scan, which earns the axe points";

export interface FakeApiCall {
  fn: string;
  args: unknown[];
}

/** The calls the screen made to src/api, from the fake backend's log. */
export async function calls(page: Page, fn: string): Promise<unknown[][]> {
  const log: FakeApiCall[] = await page.evaluate(() => (window as unknown as { __fakeApi?: { calls: FakeApiCall[] } }).__fakeApi?.calls ?? []);
  return log.filter((call) => call.fn === fn).map((call) => call.args);
}

/** The open dialog, whether it is a dialog or an alert dialog. */
export function openDialog(page: Page): Locator {
  return page.getByRole("dialog").or(page.getByRole("alertdialog")).filter({ visible: true }).first();
}

/** A visible control by its label, skipping hidden native inputs that some libraries add. */
export function field(page: Page | Locator, label: string): Locator {
  return page.getByLabel(label, { exact: true }).filter({ visible: true }).first();
}

/** A visible button or link with this name. */
export function control(scope: Page | Locator, name: string | RegExp): Locator {
  return scope.getByRole("button", { name }).or(scope.getByRole("link", { name })).filter({ visible: true }).first();
}

/**
 * Starts watching for the busy state the tasks ask for while a request runs: the control (or
 * an ancestor, such as a disabled fieldset) is disabled, aria-disabled or aria-busy. With
 * `scope`, any button in it other than Cancel counts, for a library that swaps the button.
 * Call it before the press, so a short busy state is not missed, and await the result after.
 */
export async function watchBusy(handle: ElementHandle<Element>, scope?: Locator): Promise<() => Promise<void>> {
  const root = scope ? await scope.elementHandle() : null;
  await handle.evaluate((element, within) => {
    const busy = ":disabled, [aria-disabled='true'], [aria-busy='true']";
    const state: { seen: boolean } = { seen: false };
    (window as unknown as { __busy: { seen: boolean } }).__busy = state;
    const look = () => {
      if (element.closest(busy)) state.seen = true;
      const buttons = within ? [...within.querySelectorAll("button, [role='button']")] : [];
      if (buttons.some((button) => !/cancel/i.test(button.textContent ?? "") && button.matches(busy))) state.seen = true;
    };
    new MutationObserver(look).observe(document.documentElement, { attributes: true, childList: true, subtree: true });
  }, root);
  return async () => {
    await expect
      .poll(() => handle.evaluate(() => (window as unknown as { __busy: { seen: boolean } }).__busy.seen), {
        message: "the control is disabled or marked busy while the request runs",
        timeout: 2000,
      })
      .toBe(true);
  };
}

/** Fails unless some element holding `text` sits in a live region: aria-live, a status, alert or log role, or an output element. */
export async function expectAnnounced(page: Page, text: string): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate((wanted) => {
          const live = "[aria-live='polite'], [aria-live='assertive'], [role='status'], [role='alert'], [role='log'], output";
          return [...document.querySelectorAll("body *")].some(
            (element) => (element.textContent ?? "").includes(wanted) && (element as Element).closest(live) !== null,
          );
        }, text),
      { message: `"${text}" is in a live region` },
    )
    .toBe(true);
}

/** Fails unless the field is marked invalid and names the message as its description or its error message. */
export async function expectInvalidWith(field: Locator, message: RegExp): Promise<void> {
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect
    .poll(
      () =>
        field.evaluate((element) =>
          ["aria-describedby", "aria-errormessage"]
            .flatMap((attribute) => (element.getAttribute(attribute) ?? "").split(/\s+/))
            .map((id) => (id ? (document.getElementById(id)?.textContent ?? "") : ""))
            .join(" "),
        ),
      { message: `the field's description or error message reads ${message}` },
    )
    .toMatch(message);
}

/** How many of the locator's elements a person could tap: in the viewport and not covered. */
export function reachable(locator: Locator, band?: { top: number; bottom: number }): Promise<number> {
  return locator.evaluateAll(
    (elements, area) =>
      elements.filter((element) => {
        const box = element.getBoundingClientRect();
        if (box.width < 1 || box.height < 1) return false;
        const x = box.left + box.width / 2;
        const y = box.top + box.height / 2;
        if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false;
        if (area && (y < area.top || y > area.bottom)) return false;
        const top = document.elementFromPoint(x, y);
        return top !== null && (top === element || element.contains(top));
      }).length,
    band,
  );
}

/**
 * A one-finger drag through Chrome's touch input, which sends touch and pointer events. The
 * finger stops before it lifts, as when a person drags a row open. A finger lifted at speed
 * starts a fling, and Chromium treats a tap during a fling as "stop the fling": it sends no
 * click.
 */
export async function swipe(page: Page, from: [number, number], to: [number, number], steps = 12): Promise<void> {
  const session = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", [x, y]: [number, number]) =>
    session.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] });
  await touch("touchStart", from);
  for (let step = 1; step <= steps; step++) {
    const t = step / steps;
    await touch("touchMove", [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]);
    await page.waitForTimeout(16);
  }
  for (let frame = 0; frame < 10; frame++) {
    await touch("touchMove", to);
    await page.waitForTimeout(16);
  }
  await touch("touchEnd", to);
  await session.detach();
}

/** Resolves once nothing on the page is animating and the element has not moved for three frames. */
export async function atRest(locator: Locator): Promise<void> {
  const still = await locator.evaluate(
    (element) =>
      new Promise<boolean>((done) => {
        const deadline = performance.now() + 5000;
        let last = "";
        let same = 0;
        const frame = () => {
          const box = element.getBoundingClientRect();
          const now = `${box.x},${box.y},${box.width},${box.height}`;
          const moving = document.getAnimations().some((animation) => animation.playState === "running" && animation.effect?.getComputedTiming().iterations !== Infinity);
          same = now === last && !moving ? same + 1 : 0;
          last = now;
          if (same >= 3) done(true);
          else if (performance.now() > deadline) done(false);
          else requestAnimationFrame(frame);
        };
        frame();
      }),
  );
  if (!still) throw new Error("the row did not come to rest within 5 seconds");
}

/** The check each screen shares: at 390px wide the page does not scroll sideways. */
export function fitsPhone(covers: number): Check {
  return {
    id: "fits-a-phone",
    title: "At 390px wide the page does not scroll sideways",
    covers: [covers],
    viewport: "phone",
    async run(page) {
      const overflow = await page.evaluate(() => {
        const root = document.scrollingElement ?? document.documentElement;
        return root.scrollWidth - root.clientWidth;
      });
      expect(overflow, "pixels the page can scroll sideways").toBeLessThanOrEqual(1);
    },
  };
}

/** Fails unless focus is on, or inside, the element. */
export async function expectFocusWithin(locator: Locator, message: string): Promise<void> {
  await expect.poll(() => locator.evaluate((element) => element.contains(document.activeElement)), { message }).toBe(true);
}

/** Fails unless the control is disabled or aria-disabled, or not offered at all. */
export async function expectUnavailable(locator: Locator, message: string): Promise<void> {
  await expect
    .poll(async () => (await locator.count()) === 0 || (await locator.evaluate((element) => element.matches(":disabled, [aria-disabled='true']"))), { message })
    .toBe(true);
}
