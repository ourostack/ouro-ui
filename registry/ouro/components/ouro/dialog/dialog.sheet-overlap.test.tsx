import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Dialog } from "@/registry/ouro/components/ouro/dialog/dialog";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { pressTab } from "@/registry/ouro/lib/ouro/testing/tab";

// Runs in Chromium and WebKit. The axe scan (#2617) pressed Escape on one overlay, waited only until it
// stopped reporting itself open, and clicked the next one's trigger while the first still ran its exit
// transition (#2655).

let root: Root | undefined;
let host: HTMLElement | undefined;

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  host?.remove();
  host = undefined;
  await page.viewport(1280, 800);
});

/** The dialog whose title is `name`, open or still closing; null once it has unmounted. */
function overlay(name: string): HTMLElement | null {
  return (
    [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(
      (element) => document.getElementById(element.getAttribute("aria-labelledby") ?? "")?.textContent?.trim() === name,
    ) ?? null
  );
}

/** The page's button that opens the dialog `name`. */
function trigger(name: string): HTMLElement {
  return [...document.querySelectorAll<HTMLElement>('[data-ouro="button"]')].find((element) => element.textContent === name)!;
}

/** Waits until the dialog has finished opening and Base UI has moved focus into it. */
async function settledOpen(name: string): Promise<HTMLElement> {
  await expect
    .poll(() => {
      const element = overlay(name);
      return Boolean(element?.hasAttribute("data-open") && !element.hasAttribute("data-starting-style") && element.getAnimations().length === 0);
    })
    .toBe(true);
  await expect.poll(() => overlay(name)!.contains(document.activeElement)).toBe(true);
  return overlay(name)!;
}

/**
 * Opens dialog First, presses Escape, and opens dialog Second while First is still closing. Then Tab
 * goes round Second several times: focus stays in Second, and the page behind it is marked hidden.
 */
async function openSecondWhileFirstCloses(presentation: "sheet" | "dialog") {
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <>
        <Dialog title="First" presentation={presentation} trigger={<Button>Open first</Button>}>
          <Button>First action</Button>
        </Dialog>
        <Dialog title="Second" presentation={presentation} trigger={<Button>Open second</Button>}>
          <Button>Second action</Button>
          <Button>Another action</Button>
        </Dialog>
      </>,
    ),
  );

  await userEvent.click(trigger("Open first"));
  await settledOpen("First");

  await userEvent.keyboard("{Escape}");
  await expect.poll(() => overlay("First")?.hasAttribute("data-open")).toBe(false);
  // The overlap: First is still mounted and running its exit transition when Second opens.
  const closing = overlay("First");
  expect(closing?.hasAttribute("data-ending-style") || (closing?.getAnimations().length ?? 0) > 0, "First finished closing before Second opened").toBe(true);

  // Dispatched directly: the scan did the same, since First's backdrop can still cover the trigger.
  trigger("Open second").click();
  const second = await settledOpen("Second");

  // A focus guard hands focus back to the dialog a frame later, so each Tab waits until focus is in it
  // again; a page element that takes focus in between is a leak, whatever happens after it.
  const leaked: string[] = [];
  const onFocusIn = (event: FocusEvent) => {
    const target = event.target as HTMLElement;
    if (!second.contains(target) && !target.hasAttribute("data-base-ui-focus-guard")) leaked.push(target.textContent?.trim() ?? target.tagName);
  };
  document.addEventListener("focusin", onFocusIn, true);
  try {
    for (let press = 0; press < 8; press++) {
      await pressTab();
      await expect.poll(() => second.contains(document.activeElement), { message: `Tab ${press + 1} left Second` }).toBe(true);
    }
  } finally {
    document.removeEventListener("focusin", onFocusIn, true);
  }
  expect(leaked, "Tab reached the page behind Second").toEqual([]);

  // Base UI marks the page behind a modal dialog hidden, so Second's own trigger is out of reach.
  expect(trigger("Open second").closest('[aria-hidden="true"], [inert]'), "the page behind Second is not hidden").not.toBeNull();
}

describe("an overlay opened while the one before it is still closing", () => {
  it("keeps Tab inside the second sheet, and the page behind it hidden, after Escape on the first", async () => {
    await page.viewport(390, 844);
    await openSecondWhileFirstCloses("sheet");
  });

  it("keeps Tab inside the second dialog, centered, and the page behind it hidden, after Escape on the first", async () => {
    await page.viewport(1280, 800);
    await openSecondWhileFirstCloses("dialog");
  });
});
