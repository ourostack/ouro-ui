import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { cleanupPage, renderPage, setScheme } from "../../../test/render";
import { toast } from "@/registry/ouro/lib/ouro/toast";
import { watchAnnouncements } from "@/registry/ouro/lib/ouro/testing/announcements";
import { PRESET_NAMES } from "../../themes/prepaint";
import { DIVE_DEPTH, length, moment, MOTION, planDive, STILL } from "./plan";

const root = document.documentElement;
const scene = () => document.querySelector<HTMLElement>("[data-site-dive]");

/** Opens the sample's dialog and presses Dive. */
async function dive(): Promise<void> {
  await userEvent.click(page.getByRole("button", { name: "Ready to dive?", exact: true }));
  await userEvent.click(page.getByRole("dialog", { name: "Dive to 300 fathoms?" }).getByRole("button", { name: "Dive", exact: true }));
  await expect.poll(scene, { timeout: 10_000 }).not.toBeNull();
}

beforeEach(async () => {
  await commands.emulateMedia({ reducedMotion: "no-preference" });
  await page.viewport(1280, 800);
  root.setAttribute("data-theme", "sleek");
  setScheme("light");
});
afterEach(async () => {
  toast.dismiss();
  await cleanupPage();
  root.removeAttribute("data-theme");
  setScheme("light");
});

describe("the dive's plan", () => {
  it("goes down, stays at 300 fathoms, and comes back up, the gauge following", () => {
    const { flood, descend, deep, surface } = MOTION;
    expect(moment(0)).toEqual({ phase: "flood", fathoms: 0 });
    expect(moment(flood + descend / 2)).toEqual({
      phase: "descend",
      fathoms: DIVE_DEPTH / 2,
    });
    expect(moment(flood + descend)).toEqual({
      phase: "deep",
      fathoms: DIVE_DEPTH,
    });
    expect(moment(flood + descend + deep + surface / 2)).toEqual({
      phase: "surface",
      fathoms: DIVE_DEPTH / 2,
    });
    expect(moment(length(false))).toEqual({ phase: "done", fathoms: 0 });
    // A few seconds either way.
    expect(length(false)).toBeLessThanOrEqual(6000);
    expect(length(true)).toBe(STILL.fadeIn + STILL.hold + STILL.fadeOut);
  });

  it("reads the checklist: an open hatch splashes, an untested lantern flickers, a sleeping harpooner sleeps", () => {
    const plan = (...ids: string[]) => planDive(new Set(ids));
    expect(plan("hatch")).toMatchObject({
      splash: false,
      flicker: true,
      sleeper: true,
      line: {
        title: "Back from the deep",
        description: expect.stringContaining("lantern flickered"),
      },
    });
    expect(plan()).toMatchObject({
      splash: true,
      line: {
        title: "Back up, and a little wet",
        description: expect.stringContaining("left the hatch open"),
      },
    });
    expect(plan("hatch", "lights")).toMatchObject({
      flicker: false,
      sleeper: true,
      line: { description: expect.stringContaining("Ned slept through") },
    });
    expect(plan("hatch", "lights", "harpooner")).toMatchObject({
      sleeper: false,
      line: { description: expect.stringContaining("ballast tanks") },
    });
    expect(plan("hatch", "lights", "harpooner", "tanks")).toEqual({
      splash: false,
      flicker: false,
      sleeper: false,
      line: {
        title: "Back from the deep",
        description: "Captain Nemo: Hatch shut, lantern bright, Ned awake. The fish glowed, just as I promised.",
      },
    });
  });
});

describe("pressing Dive", () => {
  it("takes the sample under, down to 300 fathoms and back, then says how it went once, and plays again", async () => {
    await renderPage("/");
    const announced = watchAnnouncements();
    try {
      await dive();
      const shown = scene()!;
      expect(shown.getAttribute("aria-hidden")).toBe("true");
      // Painted in the chosen preset's own dark colours.
      expect(shown.classList.contains("dark")).toBe(true);
      expect(shown.getAttribute("data-theme")).toBe("sleek");
      expect(shown.closest("[data-site-sample]")).not.toBeNull();
      const names = () => document.getAnimations().map((animation) => (animation as CSSAnimation).animationName);
      expect(names()).toContain("dive-flood");
      expect(shown.querySelectorAll(".dive-creature").length).toBeGreaterThan(4);
      await expect
        .poll(() => Number(shown.querySelector(".dive-number")?.textContent), {
          timeout: 10_000,
        })
        .toBe(DIVE_DEPTH);
      await expect.poll(scene, { timeout: length(false) + 5000 }).toBeNull();
      await expect.poll(() => announced.count("Back from the deep")).toBe(1);
      expect(announced.changes).toHaveLength(1);
      expect(announced.changes[0]!.region.getAttribute("role")).not.toBe("alert");
      // The page is as it was: the dialog opens again, and Dive plays again.
      await dive();
      await userEvent.keyboard("{Escape}");
      await expect.poll(scene, { timeout: 2000 }).toBeNull();
      await expect.poll(() => announced.count("Back from the deep")).toBe(2);
    } finally {
      announced.stop();
    }
  }, 30_000);

  it("ends early on a click, which reaches nothing under the water, or on the button under it", async () => {
    await renderPage("/");
    const announced = watchAnnouncements();
    try {
      const hatch = page.getByRole("checkbox", { name: "Close the hatch" });
      await userEvent.click(hatch);
      await dive();
      expect(scene()!.querySelector(".dive-splash")).not.toBeNull();
      // The click lands on the sea, not on the checklist beneath it.
      await userEvent.click(scene()!, { position: { x: 120, y: 160 } });
      await expect.poll(scene, { timeout: 2000 }).toBeNull();
      await expect.element(hatch).not.toBeChecked();
      await expect.poll(() => announced.count("Back up, and a little wet")).toBe(1);
      // From the keyboard: focus is back on the button, and pressing it again brings her up instead of reopening the dialog.
      await dive();
      const trigger = page.getByRole("button", {
        name: "Ready to dive?",
        exact: true,
      });
      await expect.element(trigger).toHaveFocus();
      await userEvent.keyboard("{Enter}");
      await expect.poll(scene, { timeout: 2000 }).toBeNull();
      await expect.element(page.getByRole("dialog", { name: "Dive to 300 fathoms?" })).not.toBeInTheDocument();
    } finally {
      announced.stop();
    }
  });

  it("with reduced motion, fades the still deep in and out: only opacity changes", async () => {
    await commands.emulateMedia({ reducedMotion: "reduce" });
    await renderPage("/");
    await dive();
    expect(scene()!.querySelector(".dive-number")!.textContent).toBe(String(DIVE_DEPTH));
    const moving = document
      .getAnimations()
      .filter((animation) => (animation as CSSAnimation).animationName?.startsWith("dive-"))
      .flatMap((animation) => (animation.effect as KeyframeEffect).getKeyframes().flatMap((frame) => Object.keys(frame)))
      .filter((property) => !["offset", "computedOffset", "easing", "composite", "opacity"].includes(property));
    expect(moving).toEqual([]);
    await expect.poll(scene, { timeout: length(true) + 5000 }).toBeNull();
  });
});

/** A CSS colour as sRGB, by painting it. */
function rgb(color: string): [number, number, number] {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d")!;
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
  return [r!, g!, b!];
}
const luminance = (color: [number, number, number]) => {
  const [r, g, b] = color.map((value) => (value / 255 <= 0.03928 ? value / 255 / 12.92 : ((value / 255 + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: string, b: string) => {
  const [light, dark] = [luminance(rgb(a)), luminance(rgb(b))].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
};

describe.each(["light", "dark"] as const)("the dive's words in %s", (scheme) => {
  it.each(PRESET_NAMES)("read on %s's sea, from the surface to the deep", async (name) => {
    await commands.emulateMedia({ reducedMotion: "reduce" });
    root.setAttribute("data-theme", name);
    setScheme(scheme);
    await renderPage("/");
    await dive();
    const shown = scene()!;
    const ink = getComputedStyle(shown).color;
    const probe = shown.appendChild(document.createElement("span"));
    for (const water of ["--dive-surface", "--dive-deep", "--dive-abyss"]) {
      probe.style.backgroundColor = `var(${water})`;
      expect(contrast(ink, getComputedStyle(probe).backgroundColor), `${water} in ${name} ${scheme}`).toBeGreaterThanOrEqual(4.5);
    }
    probe.remove();
    await userEvent.keyboard("{Escape}");
    await expect.poll(scene, { timeout: 2000 }).toBeNull();
  });
});
