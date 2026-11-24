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

  it("announces the same message again when the same thing happens twice", async () => {
    const original = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => undefined } });
    const announced = watchAnnouncements();
    try {
      await renderPage("/docs/call-demo/");
      await page.getByRole("radio", { name: "Alone" }).click();
      await page.getByRole("button", { name: "Copy invite link" }).click();
      await expect.poll(() => announced.count("Invite link copied")).toBe(1);
      await page.getByRole("button", { name: "Copy invite link" }).click();
      await expect.poll(() => announced.count("Invite link copied")).toBe(2);
    } finally {
      announced.stop();
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: original });
    }
  });

  it("copies the invite link, and says so only when it did", async () => {
    const written: string[] = [];
    const original = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => void written.push(text) } });
    try {
      await renderPage("/docs/call-demo/");
      await page.getByRole("radio", { name: "Alone" }).click();
      await page.getByRole("button", { name: "Copy invite link" }).click();
      await expect.poll(() => written.length).toBe(1);
      await expect.poll(() => document.querySelector("[data-site-call-demo] [role=status]")?.textContent).toBe("Invite link copied");
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => Promise.reject(new Error("no")) } });
      await page.getByRole("button", { name: "Copy invite link" }).click();
      await expect.poll(() => document.querySelector("[data-site-call-demo] [role=status]")?.textContent).toBe("Couldn't copy the link");
    } finally {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: original });
    }
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

  it("shows a short assembly under the demo", async () => {
    await renderPage("/docs/call-demo/");
    const code = document.querySelector("[data-site-call-demo-page] pre, main pre");
    expect(code?.textContent).toMatch(/import \{ useRef \} from "react"/);
    expect(code?.textContent).toMatch(/import \{ SnapPiP \}[\s\S]*<SnapPiP[^>]*keepOut=\{\[gridRef, controlsRef\]\}/);
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
    // The first frames of the move still read the old place: wait for it to land before it is judged.
    await expect.poll(() => pip.hasAttribute("data-ouro-settling")).toBe(false);
    await expect.poll(overlaps).toBe(0);
  });

  it("starts the self view tucked away on a phone with a full grid, and shows it on request", async () => {
    const real = window.matchMedia.bind(window);
    const spy = vi.spyOn(window, "matchMedia").mockImplementation((query) => (query === "(max-width: 639px)" ? ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} } as unknown as MediaQueryList) : real(query)));
    try {
      await renderPage("/docs/call-demo/");
      const pip = () => document.querySelector<HTMLElement>('[data-site-call-demo] [data-ouro="snap-pip"]')!;
      await expect.poll(() => pip().hasAttribute("data-collapsed")).toBe(true);
      await page.getByRole("button", { name: "Show your camera" }).click();
      await expect.poll(() => pip().hasAttribute("data-collapsed")).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it("keeps the control bar inside a phone's window at an enlarged text size, moving what does not fit into More", async () => {
    await page.viewport(390, 844);
    document.documentElement.style.fontSize = "150%";
    // The State switcher's five labels outgrow a phone at this size; the control says so, and the demo scrolls it.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await renderPage("/docs/call-demo/");
      await document.fonts.ready;
      const bar = () => document.querySelector<HTMLElement>('[data-site-call-demo] [role="toolbar"]')!;
      await expect.poll(() => bar().getBoundingClientRect().left).toBeGreaterThanOrEqual(0);
      await expect.poll(() => bar().getBoundingClientRect().right).toBeLessThanOrEqual(window.innerWidth);
      expect(bar().querySelector("[data-ouro-toolbar-more]")).not.toBeNull();
    } finally {
      document.documentElement.style.fontSize = "";
      warn.mockRestore();
    }
  });

  it("tucks the self view away when a phone starts sharing, so it never sits on the control bar", async () => {
    const real = window.matchMedia.bind(window);
    const spy = vi.spyOn(window, "matchMedia").mockImplementation((query) => (query === "(max-width: 639px)" ? ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} } as unknown as MediaQueryList) : real(query)));
    try {
      await renderPage("/docs/call-demo/");
      const pip = () => document.querySelector<HTMLElement>('[data-site-call-demo] [data-ouro="snap-pip"]')!;
      await page.getByRole("button", { name: "Show your camera" }).click();
      await expect.poll(() => pip().hasAttribute("data-collapsed")).toBe(false);
      await page.getByRole("button", { name: "Share screen" }).click();
      await expect.poll(() => pip().hasAttribute("data-collapsed")).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it("sizes the captions to one line on a wide screen, without an empty line above it", async () => {
    await page.viewport(1280, 800);
    await renderPage("/docs/call-demo/");
    await document.fonts.ready;
    const captions = document.querySelector<HTMLElement>('[data-site-call-demo] [data-ouro="live-captions"]')!;
    expect(captions.getBoundingClientRect().height).toBeLessThan(56);
  });

  it("fits the tile grid in its area on a wide screen, with no scrollbar of its own", async () => {
    await page.viewport(1440, 900);
    await renderPage("/docs/call-demo/");
    await document.fonts.ready;
    const scroller = document.querySelector<HTMLElement>('[data-site-call-demo] .overflow-auto')!;
    for (const count of ["1", "2", "3", "4", "5", "6"]) {
      await page.getByRole("radio", { name: count }).click();
      await expect.poll(() => scroller.querySelectorAll('[data-ouro="media-tile"]').length).toBe(Number(count));
      expect(scroller.scrollHeight - scroller.clientHeight, `${count} people`).toBeLessThanOrEqual(0);
    }
  });

  it("shows a chosen reaction on the stage, not only in the status line", async () => {
    await renderPage("/docs/call-demo/");
    await page.getByRole("button", { name: "React" }).click();
    await page.getByRole("button", { name: "Applause" }).click();
    // The stage's ReactionBar has no onReact, so it is read-only (a <span>, not a button); scope
    // the search to the stage's own reaction group rather than matching any button named "Applause".
    await expect.poll(() => document.querySelector("[data-site-call-reaction] [role=group]")?.textContent).toContain("Applause");
    expect(document.querySelector("[data-site-call-reaction]")?.textContent).toContain("👏");
  });

  it("keeps the people strip tall enough to read while a screen is shared, whatever the call size", async () => {
    await page.viewport(1100, 800);
    await renderPage("/docs/call-demo/");
    await document.fonts.ready;
    await page.getByRole("button", { name: "Share screen" }).click();
    const seen: number[] = [];
    for (const count of ["1", "2", "3", "4", "5", "6"]) {
      await page.getByRole("radio", { name: count }).click();
      await expect.poll(() => document.querySelectorAll('[data-site-call-demo] [data-ouro="media-tile"]').length).toBe(Number(count) + 1);
      const tiles = [...document.querySelectorAll<HTMLElement>('[data-site-call-demo] [data-ouro="media-tile"]')];
      seen.push(Math.min(...tiles.slice(1).map((tile) => tile.getBoundingClientRect().height)));
    }
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(80);
  });

  it("rests a reopened self view above the captions, never on them or the control bar", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const [width, height] of [[1100, 800], [390, 844]] as const) {
      await page.viewport(width, height);
      await renderPage("/docs/call-demo/");
      await document.fonts.ready;
      const pip = () => document.querySelector<HTMLElement>('[data-site-call-demo] [data-ouro="snap-pip"]')!;
      const bottom = () => document.querySelector<HTMLElement>('[data-site-call-demo] [role="toolbar"]')!.parentElement!.closest<HTMLElement>("div.grid")!;
      await expect.poll(() => document.querySelector('[data-site-call-demo] [role="toolbar"]')).not.toBeNull();
      await page.getByRole("radio", { name: "2" }).click();
      if (pip().hasAttribute("data-collapsed")) await page.getByRole("button", { name: "Show your camera" }).click();
      await expect.poll(() => pip().hasAttribute("data-collapsed")).toBe(false);
      await expect.poll(() => pip().hasAttribute("data-ouro-settling")).toBe(false);
      await expect.poll(() => pip().getBoundingClientRect().bottom <= bottom().getBoundingClientRect().top).toBe(true);
      await cleanupPage();
    }
    warn.mockRestore();
  });

  it("moves a pinned tile to the front of the grid, with no one sharing", async () => {
    await renderPage("/docs/call-demo/");
    const names = () => [...document.querySelectorAll('[data-ouro="media-tile"]')].map((tile) => tile.getAttribute("aria-label") ?? tile.textContent ?? "");
    await expect.poll(() => names().length).toBe(4);
    const before = names();
    await page.getByRole("button", { name: /^Pin/ }).last().click({ force: true });
    await expect.poll(() => names()[0]).not.toBe(before[0]);
  });

  it("lets the tiles take the height the self view is not using, with no one sharing", async () => {
    await page.viewport(1100, 800);
    await renderPage("/docs/call-demo/");
    await document.fonts.ready;
    const scroller = document.querySelector<HTMLElement>('[data-site-call-demo] .overflow-auto')!;
    const grid = scroller.querySelector<HTMLElement>(".grid")!;
    const bottom = document.querySelector<HTMLElement>('[data-site-call-demo] [role="toolbar"]')!.parentElement!.closest<HTMLElement>("div.grid")!;
    const gap = () => bottom.getBoundingClientRect().top - grid.getBoundingClientRect().bottom;
    await page.getByRole("radio", { name: "4" }).click();
    await expect.poll(() => scroller.querySelectorAll('[data-ouro="media-tile"]').length).toBe(4);
    await expect.poll(() => gap()).toBeGreaterThanOrEqual(124);
    const pipBox = document.querySelector<HTMLElement>('[data-site-call-demo] [data-ouro="snap-pip"]')!.getBoundingClientRect();
    // The band is the self view's height, its 16px margin above the captions and below the tiles, and the scroller's 8px padding: no more.
    expect(gap()).toBeLessThanOrEqual(pipBox.height + 2 * 16 + 8);
    await page.getByRole("button", { name: "Hide your camera" }).click();
    await expect.poll(() => gap()).toBeLessThan(24);
    expect(scroller.scrollHeight - scroller.clientHeight).toBeLessThanOrEqual(0);
  });

  it("fills the height on a phone too, with the self view tucked away and one caption line", async () => {
    await page.viewport(390, 844);
    await renderPage("/docs/call-demo/");
    await document.fonts.ready;
    const scroller = document.querySelector<HTMLElement>('[data-site-call-demo] .overflow-auto')!;
    const grid = scroller.querySelector<HTMLElement>(".grid")!;
    const bottom = document.querySelector<HTMLElement>('[data-site-call-demo] [role="toolbar"]')!.parentElement!.closest<HTMLElement>("div.grid")!;
    for (const count of ["1", "6"]) {
      await page.getByRole("radio", { name: count }).click();
      await expect.poll(() => scroller.querySelectorAll('[data-ouro="media-tile"]').length).toBe(Number(count));
      await expect.poll(() => bottom.getBoundingClientRect().top - grid.getBoundingClientRect().bottom, { message: `${count} people` }).toBeLessThan(24);
    }
    const captions = document.querySelector<HTMLElement>('[data-site-call-demo] [data-ouro="live-captions"]')!;
    expect(captions.getBoundingClientRect().height).toBeLessThan(56);
  });

  it("says which parts of the demo are scripted", async () => {
    await renderPage("/docs/call-demo/");
    expect(document.body.textContent).toMatch(/own script/);
    expect(document.body.textContent).toMatch(/State and Others in the call switchers/);
    expect(document.body.textContent).toMatch(/timer is the app's to set/);
    expect(document.body.textContent).toMatch(/tucks into a small camera button/);
  });

  it.each(["light", "dark"] as const)("passes the accessibility scan in %s", async (scheme) => {
    setScheme(scheme);
    await renderPage("/docs/call-demo/");
    const violations = await scan();
    expect(violations, describeViolations(violations)).toEqual([]);
  }, pageScanTimeout);
});
