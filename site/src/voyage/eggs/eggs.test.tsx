import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { cleanupPage, renderPage } from "../../../test/render";
import { firstFind, watchForWord } from "./listen";
import { LEAGUES, leaguesAt, startLeagues } from "./leagues";
import { setXray } from "../xray-store";
import { guess, search } from "../../components/lost-at-sea";

const nemo = () => document.querySelector<HTMLElement>('[data-egg="nemo"]');
const leagues = () => document.querySelector<HTMLElement>('[data-egg="leagues"]');
/** Waits for a toast with this title. */
const toasted = (title: string) => expect.poll(() => document.querySelector('[data-ouro="toaster"]')?.textContent ?? "", { timeout: 5000 }).toContain(title);

beforeEach(async () => {
  sessionStorage.clear();
  await commands.emulateMedia({ reducedMotion: "no-preference" });
});
afterEach(async () => {
  await cleanupPage();
  for (const egg of document.querySelectorAll("[data-egg]")) egg.remove();
  scrollTo(0, 0);
});

describe("typing a word", () => {
  it("counts the word typed outside a field, in any case, and not with a modifier key or inside a field", async () => {
    const heard = vi.fn();
    const stop = watchForWord("nemo", heard);
    const field = document.body.appendChild(document.createElement("input"));
    try {
      await userEvent.keyboard("xNeMo");
      expect(heard).toHaveBeenCalledTimes(1);
      await userEvent.keyboard("ne{Control>}m{/Control}o");
      expect(heard).toHaveBeenCalledTimes(1);
      field.focus();
      await userEvent.keyboard("nemo");
      expect(heard).toHaveBeenCalledTimes(1);
      field.blur();
      await userEvent.keyboard("nemonemo");
      expect(heard).toHaveBeenCalledTimes(3);
    } finally {
      stop();
      field.remove();
    }
    await userEvent.keyboard("nemo");
    expect(heard).toHaveBeenCalledTimes(3);
  });

  it("finds each egg once a visit", () => {
    expect(firstFind("test")).toBe(true);
    expect(firstFind("test")).toBe(false);
    expect(firstFind("other")).toBe(true);
  });
});

describe("Captain Nemo and the Dive", () => {
  it("stays away while the theme sample dives, and still comes once it has surfaced", async () => {
    await renderPage("/");
    const dive = document.body.appendChild(document.createElement("div"));
    dive.dataset.siteDive = "";
    try {
      await userEvent.keyboard("nemo");
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(nemo()).toBeNull();
    } finally {
      dive.remove();
    }
    await userEvent.keyboard("nemo");
    await expect.poll(nemo, { timeout: 10_000 }).not.toBeNull();
  });
});

describe.each(["/", "/nautilus/"])("Captain Nemo on %s", (path) => {
  it("sails by when someone types nemo, waves hello in a toast, ends on Escape, and comes once a visit", async () => {
    await renderPage(path);
    await userEvent.keyboard("nemo");
    await expect.poll(nemo, { timeout: 10_000 }).not.toBeNull();
    expect(nemo()!.getAttribute("aria-hidden")).toBe("true");
    expect(getComputedStyle(nemo()!).pointerEvents).toBe("none");
    expect(nemo()!.querySelectorAll(".egg-bubble").length).toBeGreaterThan(10);
    expect(nemo()!.querySelector(".egg-ship svg")).not.toBeNull();
    await toasted("Captain Nemo waves hello!");
    // Moving: the ship sails and the bubbles rise.
    expect(document.getAnimations().some((animation) => (animation as CSSAnimation).animationName === "egg-sail")).toBe(true);
    await userEvent.keyboard("{Escape}");
    await expect.poll(nemo, { timeout: 2000 }).toBeNull();
    await userEvent.keyboard("nemo");
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(nemo()).toBeNull();
  });
});

describe("Captain Nemo with reduced motion", () => {
  it("fades in still: nothing moves, and the bubbles rest on the screen", async () => {
    await commands.emulateMedia({ reducedMotion: "reduce" });
    await renderPage("/nautilus/");
    await userEvent.keyboard("nemo");
    await expect.poll(nemo, { timeout: 10_000 }).not.toBeNull();
    const names = document.getAnimations().map((animation) => (animation as CSSAnimation).animationName).filter(Boolean);
    expect(names.filter((name) => name.startsWith("egg-"))).toEqual([]);
    const bubble = nemo()!.querySelector(".egg-bubble")!.getBoundingClientRect();
    expect(bubble.top).toBeGreaterThanOrEqual(0);
    expect(bubble.bottom).toBeLessThanOrEqual(innerHeight);
    // A press anywhere ends it, and the page keeps the press.
    await userEvent.click(document.body);
    await expect.poll(nemo, { timeout: 2000 }).toBeNull();
  });
});

describe("the ship's log of leagues", () => {
  it("counts by tens to twenty thousand, which the end of the page reaches", () => {
    expect([0, 0.5, 0.123, 0.99, 1, 2, -1].map(leaguesAt)).toEqual([0, 10_000, 2460, LEAGUES, LEAGUES, LEAGUES, 0]);
  });

  it("grows as the Nautilus's story scrolls, never runs back, and stops at twenty thousand with a toast that says why", async () => {
    await page.viewport(1280, 800);
    await renderPage("/nautilus/");
    expect(leagues()).toBeNull();
    const room = () => document.documentElement.scrollHeight - innerHeight;
    // Chapter I loads as it nears the screen; the story is long once it has.
    await expect.poll(() => document.getElementById("chapter-one")?.querySelector("h2") ?? null, { timeout: 10_000 }).not.toBeNull();
    await expect.poll(room).toBeGreaterThan(1000);
    scrollTo({ top: room() / 2, behavior: "instant" });
    await expect.poll(leagues, { timeout: 10_000 }).not.toBeNull();
    const count = () => Number(leagues()!.querySelector(".egg-leagues-count")!.textContent!.replace(/,/g, ""));
    await expect.poll(count).toBeGreaterThan(8000);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const half = count();
    expect(half).toBeLessThan(LEAGUES);
    expect(leagues()!.getAttribute("aria-hidden")).toBe("true");
    scrollTo({ top: 0, behavior: "instant" });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    expect(count()).toBe(half);
    scrollTo({ top: room(), behavior: "instant" });
    await expect.poll(count).toBe(LEAGUES);
    expect(leagues()!.hasAttribute("data-done")).toBe(true);
    expect(leagues()!.textContent).toContain("a distance, not a depth");
    await toasted("Twenty thousand leagues!");
  });

  it("steps aside while X-ray is on, and comes back when it is off", async () => {
    const stop = startLeagues();
    try {
      expect(getComputedStyle(leagues()!).visibility).toBe("visible");
      setXray(true);
      expect(getComputedStyle(leagues()!).visibility).toBe("hidden");
      setXray(false);
      expect(getComputedStyle(leagues()!).visibility).toBe("visible");
    } finally {
      setXray(false);
      stop();
    }
  });

  it("keeps no log on the home page", async () => {
    await renderPage("/");
    scrollTo(0, 400);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(leagues()).toBeNull();
  });
});

describe("lost at sea", () => {
  it("guesses the page a mistyped address meant, and searches the docs by title or address", () => {
    expect(guess("/docs/buton/")?.title).toBe("Button");
    expect(guess("/docs/text-feild/")?.title).toBe("TextField");
    expect(guess("/docs/zzzzzzzz/")).toBeUndefined();
    expect(guess("/x/")).toBeUndefined();
    expect(search("text field").map((chart) => chart.title)).toContain("TextField");
    expect(search("   ")).toEqual([]);
    expect(search("e").length).toBe(8);
  });
});
