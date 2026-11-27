import { Suspense } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { cleanupPage, renderFixture } from "../../test/render";
import { pageDemos } from "./demos";

afterEach(cleanupPage);

describe.each([["Toolbar", pageDemos.toolbar!], ["MediaTile", pageDemos["media-tile"]!], ["SnapPiP", pageDemos["snap-pip"]!]] as const)("%s call surface", (_name, Demo) => {
  it("uses Ouro parts for the call and operates the camera, microphone and leave action", async () => {
    const host = await renderFixture(<Suspense fallback={null}><Demo /></Suspense>);
    await expect.poll(() => host.querySelectorAll('[data-ouro="media-tile"]').length).toBe(6);
    expect(host.querySelector('[data-ouro="snap-pip"]')).not.toBeNull();
    const mute = page.getByRole("button", { name: "Unmute microphone", exact: true });
    await expect.element(mute).not.toHaveAttribute("aria-pressed");
    await mute.click();
    await expect.element(page.getByRole("button", { name: "Mute microphone", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Turn camera off", exact: true }).click();
    await expect.element(page.getByRole("button", { name: "Turn camera on", exact: true })).toBeVisible();
    expect(host.querySelector('[data-ouro="snap-pip"] [data-ouro="media-tile"]')?.getAttribute("aria-label")).toContain("camera off");
    await page.getByRole("button", { name: "Leave", exact: true }).click();
    await expect.element(page.getByRole("button", { name: "Rejoin", exact: true })).toHaveFocus();
    await page.getByRole("button", { name: "Rejoin", exact: true }).click();
    await expect.element(page.getByRole("button", { name: "Unmute microphone", exact: true })).toHaveFocus();
  });

  describe("call surface layout", () => {
    it("keeps every control Ouro and the self view clear of faces, shared words and controls on a phone and desktop", async () => {
      const original = [window.innerWidth, window.innerHeight] as const;
      try {
        for (const width of [390, 1280]) {
          await page.viewport(width, 900);
          const host = await renderFixture(<Suspense fallback={null}><Demo /></Suspense>);
          await expect.poll(() => host.querySelectorAll('[data-ouro="media-tile"]').length).toBe(6);
          const pip = host.querySelector<HTMLElement>('[data-ouro="snap-pip"]')!;
          const safe = [...host.querySelectorAll<HTMLElement>('[data-source="camera"], [data-source="screen"] [data-ouro="text"], [data-ouro="toolbar"]')].filter((element) => !pip.contains(element));
          const clear = () => {
            const a = pip.getBoundingClientRect();
            return safe.every((element) => {
              const b = element.getBoundingClientRect();
              return a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom;
            });
          };
          expect([...host.querySelectorAll("button,[tabindex='0']")].every((control) => control.hasAttribute("data-ouro-control"))).toBe(true);
          await expect.poll(clear).toBe(true);
          pip.focus();
          for (const arrow of ["ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"]) {
            await userEvent.keyboard(`{Alt>}{${arrow}}{/Alt}`);
            await expect.poll(() => pip.hasAttribute("data-ouro-settling")).toBe(false);
            await expect.poll(clear).toBe(true);
          }
        }
      } finally {
        await page.viewport(...original);
      }
    });
  });
});
