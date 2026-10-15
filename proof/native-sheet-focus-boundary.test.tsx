import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Sheet } from "@/registry/ouro/components/ouro/sheet/sheet";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { holdFrames, type HeldFrames } from "@/registry/ouro/lib/ouro/testing/frames";
import { pressTab } from "@/registry/ouro/lib/ouro/testing/tab";

let root: Root | undefined;
let host: HTMLElement | undefined;
let frames: HeldFrames | undefined;
afterEach(async () => {
  frames?.release();
  frames = undefined;
  await act(async () => root?.unmount());
  host?.remove();
});

it("a real Tab reaches the external guard before Base UI's queued frame focuses the first control", async () => {
  await page.viewport(390, 844);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(
    <Sheet title="Pick" trigger={<Button>Open</Button>}>
      <Button>First</Button>
      <Button>Second</Button>
    </Sheet>,
  ));
  await userEvent.click(page.getByRole("button", { name: "Open", exact: true }));
  const sheet = page.getByRole("dialog", { name: "Pick" }).element();
  await expect.poll(() => document.activeElement === sheet && sheet.getAnimations().length === 0).toBe(true);
  for (const name of ["First", "Second", "Close"]) {
    await pressTab();
    await expect.poll(() => document.activeElement?.textContent).toBe(name);
  }
  frames = holdFrames();
  await pressTab();
  expect(document.activeElement?.hasAttribute("data-base-ui-focus-guard")).toBe(true);
  expect(sheet.contains(document.activeElement)).toBe(false);
  frames.until(() => sheet.contains(document.activeElement));
  frames.release();
  frames = undefined;
  await expect.poll(() => sheet.contains(document.activeElement)).toBe(true);
  expect(document.activeElement?.textContent).toBe("First");
});
