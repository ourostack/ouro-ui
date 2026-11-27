import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { cleanupPage, renderFixture } from "../../test/render";
import ToolbarDemo from "./demos/toolbar.demo";
import MediaTileDemo from "./demos/media-tile.demo";
import SnapPiPDemo from "./demos/snap-pip.demo";

afterEach(cleanupPage);

describe.each([["Toolbar", ToolbarDemo], ["MediaTile", MediaTileDemo], ["SnapPiP", SnapPiPDemo]] as const)("%s call surface", (_name, Demo) => {
  it("uses Ouro parts for the call and operates the camera, microphone and leave action", async () => {
    const host = await renderFixture(<Demo />);
    expect(host.querySelectorAll('[data-ouro="media-tile"]').length).toBe(5);
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
});
