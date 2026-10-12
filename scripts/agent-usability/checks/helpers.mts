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

/** A state the axe scan and the screenshots also cover, besides the first render. */
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

export const looksAndFit = "axe and the screenshots, at 390px and 1280px in light and dark mode";

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

/** Disabled, aria-disabled or aria-busy, on the element or an ancestor. */
async function pending(handle: ElementHandle<Element>): Promise<boolean> {
  return handle.evaluate((element) =>
    Boolean(element.closest(":disabled, [aria-disabled='true'], [aria-busy='true']")),
  );
}

/** Fails unless the control shows it is busy (disabled, aria-disabled or aria-busy) soon after it was pressed. */
export async function expectBusy(handle: ElementHandle<Element>, scope?: Locator): Promise<void> {
  await expect
    .poll(
      async () =>
        (await pending(handle)) ||
        (scope
          ? await scope.evaluate((root) =>
              [...root.querySelectorAll("button, [role='button']")].some(
                (button) => !/cancel/i.test(button.textContent ?? "") && button.matches(":disabled, [aria-disabled='true'], [aria-busy='true']"),
              ),
            )
          : false),
      { message: "the control shows that the request is running", timeout: 500, intervals: [20] },
    )
    .toBe(true);
}

/** True when some element holding `text` sits in a live region (aria-live, status, alert or log). */
export async function expectAnnounced(page: Page, text: string): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate((wanted) => {
          const live = "[aria-live='polite'], [aria-live='assertive'], [role='status'], [role='alert'], [role='log']";
          return [...document.querySelectorAll("body *")].some(
            (element) => (element.textContent ?? "").includes(wanted) && (element as Element).closest(live) !== null,
          );
        }, text),
      { message: `"${text}" is in a live region` },
    )
    .toBe(true);
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

/** A one-finger drag through Chrome's touch input, which sends touch and pointer events. */
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
  await touch("touchEnd", to);
  await session.detach();
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
