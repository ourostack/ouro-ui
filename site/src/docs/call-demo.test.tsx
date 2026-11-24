import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { cleanupPage, describeViolations, pageScanTimeout, renderPage, scan, setScheme } from "../../test/render";
import { watchAnnouncements } from "@/registry/ouro/lib/ouro/testing/announcements";
import { routes } from "../routes";

beforeAll(async () => {
  await import("./call-demo");
});

afterEach(async () => {
  await cleanupPage();
  setScheme("light");
});

describe("the call window page", () => {
  it("holds its made-up speaker and captions still while a pointer is in the window", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      await renderPage("/docs/call-demo/");
      const region = () => document.querySelector("[data-site-call-demo] [role=group]")?.textContent;
      await page.getByRole("button", { name: "Leave" }).hover();
      const before = region();
      vi.advanceTimersByTime(8000);
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      expect(region()).toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });

  it("has a route", () => {
    expect(routes.some((route) => route.path === "/docs/call-demo/")).toBe(true);
  });

  it("shows a tile for each person, and reflows when the count changes", async () => {
    await renderPage("/docs/call-demo/");
    await expect.element(page.getByRole("heading", { level: 1, name: "A call window" })).toBeInTheDocument();
    const tiles = () => document.querySelectorAll('[data-ouro="media-tile"]').length;
    await expect.poll(tiles).toBe(4);
    await page.getByRole("radio", { name: "6" }).click();
    await expect.poll(tiles).toBe(6);
    await page.getByRole("radio", { name: "1" }).click();
    await expect.poll(tiles).toBe(1);
  });

  it("announces a mute once, and who joined", async () => {
    const announced = watchAnnouncements();
    try {
      await renderPage("/docs/call-demo/");
      await page.getByRole("button", { name: "Mute" }).click();
      await expect.poll(() => announced.count("You are muted")).toBe(1);
      await page.getByRole("radio", { name: "5" }).click();
      await expect.poll(() => announced.count("Jonas Ek joined")).toBe(1);
    } finally {
      announced.stop();
    }
  });

  it("shows the waiting state with art, and moves focus to the call when the app changes the view", async () => {
    await renderPage("/docs/call-demo/");
    await page.getByRole("button", { name: "Leave" }).click();
    await expect.poll(() => document.querySelector("[data-site-call-demo] [data-ouro=\"moment\"]")?.textContent).toContain("You left the call");
    await expect.poll(() => document.activeElement?.textContent).toBe("Rejoin");
    await page.getByRole("button", { name: "Rejoin" }).click();
    await page.getByRole("button", { name: "Join now" }).click();
    await expect.poll(() => document.querySelector("[data-site-call-demo] [role=status]")?.textContent).toBe("You joined the call");
    await expect.poll(() => document.activeElement?.getAttribute("aria-label")).toBe("Mute");
    await page.getByRole("radio", { name: "Alone" }).click();
    const empty = document.querySelector<HTMLElement>('[data-ouro="moment"][data-moment="empty"]')!;
    expect(empty.querySelector("[data-moment-art]")).not.toBeNull();
  });

  it("replaces a stale status when you leave, so the bar never reads 'You are muted' on a left call", async () => {
    await renderPage("/docs/call-demo/");
    await page.getByRole("button", { name: "Mute" }).click();
    await expect.poll(() => document.querySelector("[data-site-call-demo] [role=status]")?.textContent).toBe("You are muted");
    await page.getByRole("button", { name: "Leave" }).click();
    await expect.poll(() => document.querySelector("[data-site-call-demo] [role=status]")?.textContent).toBe("You left the call");
  });

  it("starts a rejoined call clean: no raised hand left over, and the join is announced", async () => {
    await renderPage("/docs/call-demo/");
    await page.getByRole("button", { name: "Raise hand" }).click();
    await page.getByRole("button", { name: "Leave" }).click();
    await page.getByRole("button", { name: "Rejoin" }).click();
    await page.getByRole("button", { name: "Join now" }).click();
    await expect.poll(() => document.querySelector("[data-site-call-demo] [role=status]")?.textContent).toBe("You joined the call");
    await expect.element(page.getByRole("button", { name: "Raise hand" })).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps its switchers inside a narrow column with six others in the call", async () => {
    await renderPage("/docs/call-demo/");
    const root = document.querySelector<HTMLElement>("[data-site-call-demo]")!;
    const host = root.parentElement!;
    host.style.width = "320px";
    host.style.overflow = "visible";
    await page.getByRole("radio", { name: "6" }).click();
    await expect.poll(() => root.scrollWidth <= root.clientWidth).toBe(true);
    host.style.width = "";
    host.style.overflow = "";
  });

  it("keeps the self view clear of every tile, in each corner it can take", async () => {
    // The grid's columns follow the viewport's width, so the test sets the one it measures at, whatever a file before it left.
    await page.viewport(1280, 800);
    await renderPage("/docs/call-demo/");
    await document.fonts.ready;
    const pip = document.querySelector<HTMLElement>('[data-site-call-demo] [data-ouro="snap-pip"]')!;
    const overlaps = () => {
      const a = pip.getBoundingClientRect();
      return [...document.querySelectorAll<HTMLElement>('[data-site-call-demo] [data-ouro="media-tile"]')].filter((tile) => {
        const b = tile.getBoundingClientRect();
        return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      }).length;
    };
    await page.getByRole("radio", { name: "6" }).click();
    await expect.poll(overlaps).toBe(0);
    pip.focus();
    await userEvent.keyboard("{Alt>}{ArrowUp}{/Alt}");
    await expect.poll(overlaps).toBe(0);
  });

  it("starts the self view tucked away on a phone with a full grid, and shows it on request", async () => {
    const real = window.matchMedia.bind(window);
    const spy = vi.spyOn(window, "matchMedia").mockImplementation((query) => (query === "(max-width: 639px)" ? ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} } as unknown as MediaQueryList) : real(query)));
    try {
      await renderPage("/docs/call-demo/");
      const pip = () => document.querySelector<HTMLElement>('[data-site-call-demo] [data-ouro="snap-pip"]')!;
      await expect.poll(() => pip().hasAttribute("data-collapsed")).toBe(true);
      await page.getByRole("button", { name: "Show Your camera" }).click();
      await expect.poll(() => pip().hasAttribute("data-collapsed")).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it("says which parts of the demo are scripted", async () => {
    await renderPage("/docs/call-demo/");
    expect(document.body.textContent).toMatch(/own script/);
  });

  it.each(["light", "dark"] as const)("passes the accessibility scan in %s", async (scheme) => {
    setScheme(scheme);
    await renderPage("/docs/call-demo/");
    const violations = await scan();
    expect(violations, describeViolations(violations)).toEqual([]);
  }, pageScanTimeout);
});
