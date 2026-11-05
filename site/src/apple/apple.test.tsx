import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { springAt } from "@/registry/ouro/lib/ouro/spring";
import { cleanupPage, describeViolations, pageScanTimeout, renderPage, scan, setScheme, settle } from "../../test/render";
import { APPLE_PATHS } from "../paths";
import { routes } from "../routes";
import { CLIPS } from "./clips";
import { tapsFor } from "./haptics";
import kit from "./kit.json";
import { TWIN } from "./spring-twin";
import { REPORTS, stateOf } from "./xray-explorer";

beforeEach(async () => {
  await commands.emulateMedia({ reducedMotion: "no-preference" });
});
afterEach(async () => {
  await cleanupPage();
  setScheme("light");
});

const TITLES = {
  "/apple/": "Same manners, now in Swift.",
  "/apple/hx/": "Feel it before you read about it.",
  "/apple/ax/": "Siri reads your app like a manual. Write a good one.",
  "/apple/start/": "One line of Swift.",
} as const;

describe("Ouro UI for Apple", () => {
  it.each(APPLE_PATHS)("renders %s with its title, its section menu and a route", async (path) => {
    await renderPage(path);
    await expect.element(page.getByRole("heading", { level: 1, name: TITLES[path] })).toBeInTheDocument();
    const menu = page.getByRole("navigation", { name: "Ouro UI for Apple" });
    expect(menu.element().querySelector('[aria-current="page"]')?.getAttribute("href")).toMatch(new RegExp(`${path}$`));
    expect(routes.some((route) => route.path === path)).toBe(true);
  });

  it("puts the X-ray's real numbers on the page, from the reports it shows", () => {
    expect([REPORTS.spoonjoy.before.summary.holding, REPORTS.spoonjoy.after.summary.holding, REPORTS.spoonjoy.after.summary.claims]).toEqual([5, 12, 29]);
    expect([REPORTS["ouro-md"].before.summary.holding, REPORTS["ouro-md"].after.summary.holding, REPORTS["ouro-md"].after.summary.claims]).toEqual([8, 14, 30]);
    for (const app of Object.values(REPORTS)) {
      for (const side of [app.before, app.after]) {
        expect(side.claims.length).toBe(side.summary.claims);
        expect(side.claims.filter((claim) => stateOf(claim) === "holds").length).toBe(side.summary.holding);
      }
    }
  });

  it("control: xray lets you flip apps and sides, and filter the claims", async () => {
    await renderPage("/apple/ax/");
    const xray = page.getByRole("region", { name: "Spoonjoy and Ouro MD, X‑rayed, before and after." });
    await expect.element(xray).toBeInTheDocument();
    const holding = () => xray.element().querySelector(".apple-xray-holding")?.textContent;
    expect(holding()).toBe("12");
    await userEvent.click(xray.getByRole("radio", { name: "Before" }));
    await expect.poll(holding).toBe("5");
    await userEvent.click(xray.getByRole("radio", { name: "Ouro MD" }));
    await expect.poll(holding).toBe("8");
    await userEvent.click(xray.getByRole("radio", { name: "After" }));
    await expect.poll(holding).toBe("14");
    await userEvent.click(xray.getByRole("radio", { name: /^Fail / }));
    await expect.element(xray.getByText("Nothing fails. Not one.", { exact: false })).toBeInTheDocument();
    await userEvent.click(xray.getByRole("radio", { name: /^Hold / }));
    await expect.poll(() => xray.element().querySelectorAll(".apple-claim").length).toBe(14);
  });

  it("runs the web twin on the kit's own spring, and its curve settles where it says", () => {
    expect(TWIN).toEqual({ response: kit.spring.visualDuration, damping: 1 - kit.spring.bounce });
    expect(TWIN.response).toBe(0.4);
    expect(TWIN.damping).toBeCloseTo(0.85, 10);
    const end = springAt(0, 1, 0, kit.spring.settle * 1000, TWIN);
    expect(Math.abs(end.value - 1)).toBeLessThan(0.01);
  });

  it("control: twin sends the puck over and back, and only fades under Reduce Motion", async () => {
    await renderPage("/apple/hx/");
    const send = page.getByRole("button", { name: "Send it over" });
    await expect.element(send).toBeInTheDocument();
    await userEvent.click(send);
    await expect.element(page.getByRole("button", { name: "Send it back" })).toBeInTheDocument();
    await userEvent.click(page.getByRole("switch", { name: "Reduce Motion" }));
    await userEvent.click(page.getByRole("button", { name: "Send it back" }));
    await expect.element(page.getByRole("button", { name: "Send it over" })).toBeInTheDocument();
  });

  it("control: haptics lists all eight moments, each with taps to see", async () => {
    await renderPage("/apple/hx/");
    const list = page.getByRole("list", { name: "OuroHaptics moments" });
    await expect.element(list).toBeInTheDocument();
    expect(list.element().querySelectorAll("li").length).toBe(kit.haptics.length);
    expect(kit.haptics.length).toBe(8);
    for (const moment of kit.haptics) expect(tapsFor(moment).length).toBeGreaterThan(0);
    await userEvent.click(list.getByRole("button").first());
    await expect.poll(() => list.element().querySelector(".apple-wave-playing")).not.toBeNull();
  });

  it("shows stills, not video, under Reduce Motion", async () => {
    await commands.emulateMedia({ reducedMotion: "reduce" });
    await renderPage("/apple/");
    await expect.element(page.getByRole("heading", { level: 1, name: TITLES["/apple/"] })).toBeInTheDocument();
    const loop = document.querySelector(".apple-loop")!;
    const visible = [...loop.querySelectorAll("video, img")].filter((el) => getComputedStyle(el).display !== "none");
    expect(visible.map((el) => el.tagName)).toEqual(["IMG"]);
    expect(loop.querySelector("video")?.getAttribute("autoplay")).toBeNull();
  });

  it("shows the light capture in dark mode when a clip has no dark one, and the dark capture when it has", async () => {
    setScheme("dark");
    await renderPage("/apple/");
    await expect.element(page.getByRole("heading", { level: 1, name: TITLES["/apple/"] })).toBeInTheDocument();
    const showing = (clip: string) =>
      [...document.querySelectorAll(`[data-apple-clip="${clip}"] video`)].filter((el) => getComputedStyle(el).display !== "none").map((el) => el.getAttribute("data-apple-scheme"));
    expect(showing("spoonjoy-add-recipe")).toEqual(["light"]);
    expect(showing("hx-spring")).toEqual(["dark"]);
  });

  it("gives every clip an honest caption and real media names", () => {
    for (const [name, clip] of Object.entries(CLIPS)) {
      expect(clip.label.length, name).toBeGreaterThan(0);
      expect(clip.source, name).toMatch(/Captured/);
      expect(clip.width).toBeGreaterThan(0);
      expect(clip.height).toBeGreaterThan(0);
    }
  });

  it.each(["light", "dark"] as const)("has no axe violations on any Apple page in %s", async (scheme) => {
    setScheme(scheme);
    for (const path of APPLE_PATHS) {
      await renderPage(path);
      await expect.element(page.getByRole("heading", { level: 1, name: TITLES[path] })).toBeInTheDocument();
      await settle();
      const violations = await scan();
      expect(violations, `${path}: ${describeViolations(violations)}`).toEqual([]);
      await cleanupPage();
    }
  }, pageScanTimeout * 4);
});
