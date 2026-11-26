import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { cleanupPage, describeViolations, pageScanTimeout, renderPage, scan, setScheme } from "../../test/render";
import { routes } from "../routes";

beforeAll(async () => {
  await import("./calendar-demo");
});

afterEach(async () => {
  await cleanupPage();
  setScheme("light");
});

const eventTitles = () => document.querySelectorAll("[data-site-calendar-demo] [data-ouro='time-grid'] [data-event-id], [data-site-calendar-demo] [data-ouro='time-grid'] button[aria-label*=', ']").length;

describe("the calendar page", () => {
  it("has a route", () => {
    expect(routes.some((route) => route.path === "/docs/calendar-demo/")).toBe(true);
  });

  it("shows an empty week from the State switcher", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      await renderPage("/docs/calendar-demo/");
      await page.getByRole("radio", { name: "Empty week" }).click();
      await expect.element(page.getByText("Nothing on this week")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("opens a dialog from New event and asks for a title", async () => {
    await renderPage("/docs/calendar-demo/");
    await expect.element(page.getByRole("heading", { level: 1, name: "A calendar" })).toBeInTheDocument();
    await page.getByRole("button", { name: "New event" }).click();
    const dialog = page.getByRole("dialog", { name: "New event" });
    await expect.element(dialog).toBeInTheDocument();
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect.element(dialog.getByText("Add a title")).toBeInTheDocument();
    await expect.poll(() => `${document.activeElement?.tagName}${document.activeElement?.getAttribute("aria-invalid")}`).toBe("INPUTtrue");
  });

  it("fits the State control without a scrollbar at normal text on a narrow phone", async () => {
    await page.viewport(372, 844);
    try {
      await renderPage("/docs/calendar-demo/");
      const control = page.getByRole("radiogroup", { name: "State" });
      await expect.element(control).toBeInTheDocument();
      const wrap = control.element().closest(".overflow-x-auto") as HTMLElement;
      await expect.poll(() => wrap.scrollWidth <= wrap.clientWidth).toBe(true);
    } finally {
      await page.viewport(1100, 900);
    }
  });

  it("keeps the Add a title message above the footer at large text on a short screen", async () => {
    await page.viewport(550, 450);
    document.documentElement.style.fontSize = "32px";
    // The page's State switcher reports that it spills at this size; that is not what this test is about.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await renderPage("/docs/calendar-demo/");
      await page.getByRole("radio", { name: "Empty week" }).click();
      await page.getByRole("button", { name: "New event" }).click();
      const dialog = page.getByRole("dialog", { name: "New event" });
      await dialog.getByRole("button", { name: "Create" }).click();
      await expect.element(dialog.getByText("Add a title")).toBeInTheDocument();
      const clear = () => {
        const message = [...document.querySelectorAll("[role=dialog] *")].find((el) => el.children.length === 0 && el.textContent === "Add a title");
        const footer = document.querySelector("[data-ouro-footer]");
        return !!message && !!footer && message.getBoundingClientRect().bottom <= footer.getBoundingClientRect().top;
      };
      await expect.poll(clear).toBe(true);
    } finally {
      warn.mockRestore();
      document.documentElement.style.fontSize = "";
      await page.viewport(1100, 900);
    }
  });

  it("keeps the Add a title message above the footer when the footer grows after the first scroll", async () => {
    await page.viewport(550, 450);
    document.documentElement.style.fontSize = "32px";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const grow = document.createElement("style");
    grow.setAttribute("data-test-harness", "");
    try {
      await renderPage("/docs/calendar-demo/");
      await page.getByRole("radio", { name: "Empty week" }).click();
      await page.getByRole("button", { name: "New event" }).click();
      const dialog = page.getByRole("dialog", { name: "New event" });
      await dialog.getByRole("button", { name: "Create" }).click();
      await expect.element(dialog.getByText("Add a title")).toBeInTheDocument();
      const clear = () => {
        const message = [...document.querySelectorAll("[role=dialog] *")].find((el) => el.children.length === 0 && el.textContent === "Add a title");
        const footer = document.querySelector("[data-ouro-footer]");
        return !!message && !!footer && message.getBoundingClientRect().bottom <= footer.getBoundingClientRect().top;
      };
      await expect.poll(clear).toBe(true);
      // The footer settles to a taller height after the scrolls that ran when the message appeared.
      for (let frame = 0; frame < 6; frame += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
      grow.textContent = "[data-ouro-footer] { padding-block-start: 1.5rem !important; }";
      document.head.append(grow);
      await expect.poll(clear).toBe(true);
    } finally {
      grow.remove();
      warn.mockRestore();
      document.documentElement.style.fontSize = "";
      await page.viewport(1100, 900);
    }
  });

  it("keeps the Add a title message above the footer when the sheet is still moving as the message appears", async () => {
    await page.viewport(550, 450);
    document.documentElement.style.fontSize = "32px";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const move = document.createElement("style");
    move.setAttribute("data-test-harness", "");
    move.textContent = "[role=dialog] { transform: translateY(120px) !important; }";
    try {
      await renderPage("/docs/calendar-demo/");
      await page.getByRole("radio", { name: "Empty week" }).click();
      await page.getByRole("button", { name: "New event" }).click();
      const dialog = page.getByRole("dialog", { name: "New event" });
      await expect.element(dialog).toBeVisible();
      document.head.append(move);
      await dialog.getByRole("button", { name: "Create" }).click();
      await expect.element(dialog.getByText("Add a title")).toBeInTheDocument();
      for (let frame = 0; frame < 6; frame += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
      // The sheet settles into place with a transition, which resizes nothing.
      move.textContent = "[role=dialog] { transition: transform 100ms !important; transform: none !important; }";
      const clear = () => {
        const message = [...document.querySelectorAll("[role=dialog] *")].find((el) => el.children.length === 0 && el.textContent === "Add a title");
        const footer = document.querySelector("[data-ouro-footer]");
        return !!message && !!footer && message.getBoundingClientRect().bottom <= footer.getBoundingClientRect().top;
      };
      await expect.poll(clear).toBe(true);
    } finally {
      move.remove();
      warn.mockRestore();
      document.documentElement.style.fontSize = "";
      await page.viewport(1100, 900);
    }
  });

  it("puts a new event on the grid once it has a title", async () => {
    await renderPage("/docs/calendar-demo/");
    await page.getByRole("button", { name: "New event" }).click();
    const dialog = page.getByRole("dialog", { name: "New event" });
    await dialog.getByRole("textbox", { name: /Title/ }).fill("Garden club");
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect.element(dialog).not.toBeInTheDocument();
    await expect.poll(() => document.body.textContent).toContain("Garden club");
  });

  it("leaves the now line off an empty week, and draws it on a week with events", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    vi.setSystemTime(new Date(2026, 2, 11, 12, 0));
    try {
      await renderPage("/docs/calendar-demo/");
      const line = () => document.querySelector("[data-site-calendar-demo] [data-ouro-time-grid-now-label]");
      await page.getByRole("radio", { name: "Empty week" }).click();
      await expect.element(page.getByText("Nothing on this week")).toBeInTheDocument();
      expect(line()).toBeNull();
      await page.getByRole("radio", { name: "Full week" }).click();
      await expect.poll(line).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("starts the date picker's weeks on Monday, as the work week does", async () => {
    await renderPage("/docs/calendar-demo/");
    await page.getByRole("button", { name: "Go to date" }).click();
    await expect.poll(() => document.querySelector("[role=dialog] [role=columnheader], [role=dialog] th")?.textContent).toMatch(/^Mon/);
  });

  it("shows one day on a phone, with no view switch, so every event keeps a readable width", async () => {
    await page.viewport(390, 844);
    await renderPage("/docs/calendar-demo/");
    await expect.poll(() => document.querySelector("[data-site-calendar-demo] [data-ouro=time-grid]")).not.toBeNull();
    expect(page.getByRole("radio", { name: /Work week/ }).query()).toBeNull();
  });

  it("lands focus in the grid after a date is picked from Go to date", async () => {
    await page.viewport(1100, 900);
    await renderPage("/docs/calendar-demo/");
    await page.getByRole("button", { name: "Go to date" }).click();
    await expect.poll(() => document.querySelectorAll("[role=dialog] button[data-day], [role=dialog] [role=gridcell] button").length).toBeGreaterThan(20);
    await userEvent.click(page.getByRole("dialog").getByRole("button", { name: /\b15\b/ }).first());
    await expect.poll(() => document.activeElement?.closest('[data-ouro="time-grid"]') !== null).toBe(true);
  });

  it("shows a loading state from the State switcher", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      await renderPage("/docs/calendar-demo/");
      await page.getByRole("radio", { name: "Loading" }).click();
      await expect.poll(() => document.querySelector("[data-site-calendar-demo] [aria-busy=true]")).not.toBeNull();
      await expect.element(page.getByRole("status")).toHaveTextContent("Loading your week");
      // The week's shape, not a bare spinner: a placeholder block per day, and no spinner.
      const skeleton = document.querySelector("[data-site-week-skeleton]")!;
      expect(skeleton.querySelectorAll("[data-ouro='skeleton']").length).toBeGreaterThanOrEqual(4);
      expect(skeleton.querySelector("[role=progressbar], svg")).toBeNull();
      await commands.emulateMedia({ reducedMotion: "reduce" });
      try {
        expect(getComputedStyle(skeleton.querySelector("[data-ouro='skeleton']")!).animationName).toBe("none");
      } finally {
        await commands.emulateMedia({ reducedMotion: "no-preference" });
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("opens on one day on a phone and on a work week on a laptop", async () => {
    await page.viewport(390, 844);
    await renderPage("/docs/calendar-demo/");
    await expect.poll(() => document.querySelector("[data-site-calendar-demo] [data-ouro=time-grid]")).not.toBeNull();
    await expect.poll(() => document.querySelectorAll('[data-site-calendar-demo] [role=radio]').length).toBe(3);
    await cleanupPage();
    await page.viewport(1100, 900);
    await renderPage("/docs/calendar-demo/");
    await expect.element(page.getByRole("radio", { name: /Work week/ })).toBeChecked();
  });

  it("leaves room under the grid on a phone for the Undo toast", async () => {
    await page.viewport(390, 844);
    await renderPage("/docs/calendar-demo/");
    const root = document.querySelector<HTMLElement>("[data-site-calendar-demo]")!;
    await expect.poll(() => getComputedStyle(root).paddingBottom).toBe("96px");
  });

  it("puts the date heading on its own row above the controls on a phone", async () => {
    await page.viewport(390, 844);
    await renderPage("/docs/calendar-demo/");
    const heading = document.querySelector<HTMLElement>("[data-site-calendar-demo] h2")!;
    const jump = [...document.querySelectorAll<HTMLElement>("[data-site-calendar-demo] button")].find((b) => b.textContent === "Go to date")!;
    await expect.poll(() => heading.getBoundingClientRect().bottom <= jump.getBoundingClientRect().top).toBe(true);
    expect(Math.round(heading.getBoundingClientRect().width)).toBeGreaterThan(300);
  });

  it("deletes an event from its details and brings it back with Undo", async () => {
    await page.viewport(1100, 900);
    await renderPage("/docs/calendar-demo/");
    const before = eventTitles();
    await page.getByRole("button", { name: /Sprint planning/ }).first().click();
    await userEvent.click(page.getByRole("button", { name: "Delete" }));
    await expect.element(page.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    await expect.poll(eventTitles).toBe(before - 1);
    await userEvent.click(page.getByRole("button", { name: "Undo" }));
    await expect.poll(eventTitles).toBe(before);
  });

  it.each(["light", "dark"] as const)("passes the accessibility scan in the day view on a phone in %s", async (scheme) => {
    setScheme(scheme);
    await page.viewport(390, 844);
    await renderPage("/docs/calendar-demo/");
    const violations = await scan();
    expect(violations, describeViolations(violations)).toEqual([]);
  }, pageScanTimeout);

  it("opens an event's details with focus inside them, not on Delete", async () => {
    await page.viewport(1100, 900);
    await renderPage("/docs/calendar-demo/");
    await page.getByRole("button", { name: /Sprint planning/ }).first().click();
    const details = page.getByRole("dialog", { name: /Sprint planning/ });
    await expect.element(details).toBeInTheDocument();
    await expect.poll(() => (document.activeElement as HTMLElement | null)?.textContent).not.toBe("Delete");
    await expect.poll(() => document.activeElement?.closest("[role=dialog]") !== null).toBe(true);
  });

  it("moves focus into the edit dialog after Edit, and back to the event after Cancel", async () => {
    await page.viewport(1100, 900);
    await renderPage("/docs/calendar-demo/");
    await page.getByRole("button", { name: /Sprint planning/ }).first().click();
    page.getByRole("button", { name: "Edit" }).element().focus();
    await userEvent.keyboard("{Enter}");
    const dialog = page.getByRole("dialog", { name: "Edit event" });
    await expect.element(dialog).toBeInTheDocument();
    await expect.poll(() => document.activeElement?.closest("[role=dialog]")?.getAttribute("aria-labelledby")).toBe(dialog.element().getAttribute("aria-labelledby"));
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    await expect.element(dialog).not.toBeInTheDocument();
  });

  it("names a length that is not a preset with its unit, so an edited event never shows a bare number", async () => {
    await page.viewport(1100, 900);
    await renderPage("/docs/calendar-demo/");
    await page.getByRole("button", { name: /more events/ }).first().click();
    await page.getByRole("menuitem", { name: /Weekly cross-team sync/ }).click();
    page.getByRole("button", { name: "Edit" }).element().focus();
    await userEvent.keyboard("{Enter}");
    const dialog = page.getByRole("dialog", { name: "Edit event" });
    await expect.element(dialog.getByRole("combobox", { name: "Length" })).toHaveTextContent("45 minutes");
  });

  it("shows one Undo toast at a time, and says how to reach it", async () => {
    await page.viewport(1100, 900);
    await renderPage("/docs/calendar-demo/");
    for (const name of [/Sprint planning/, /Design review/]) {
      await page.getByRole("button", { name }).first().click();
      await userEvent.click(page.getByRole("button", { name: "Delete" }));
      await expect.element(page.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    }
    await expect.poll(() => page.getByRole("button", { name: "Undo" }).elements().length).toBe(1);
    expect(document.body.textContent).toContain("Ctrl or Cmd+Z also undoes it.");
  });

  it("names no key on a touch screen, and keeps the Undo toast reachable when Go to date opens over it", async () => {
    const real = window.matchMedia.bind(window);
    vi.stubGlobal("matchMedia", (query: string) => (query === "(pointer: coarse)" ? ({ matches: true, media: query, addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList) : real(query)));
    try {
      await page.viewport(390, 844);
      await renderPage("/docs/calendar-demo/");
      await expect.poll(() => document.querySelector('[data-ouro="time-grid"] [data-ouro-part="event"]')).not.toBeNull();
      (document.querySelector('[data-ouro="time-grid"] [data-ouro-part="event"]') as HTMLElement).click();
      await expect.element(page.getByRole("button", { name: "Delete" })).toBeInTheDocument();
      page.getByRole("button", { name: "Delete" }).element().focus();
      await userEvent.keyboard("{Enter}");
      await expect.element(page.getByRole("button", { name: "Undo" })).toBeInTheDocument();
      expect(document.body.textContent).not.toContain("Cmd+Z");
      await userEvent.click(page.getByRole("button", { name: "Go to date" }));
      await expect.poll(() => document.querySelector('[data-ouro-part="action"]')).not.toBeNull();
      // The phone sheet rises from the bottom, so Undo hangs from the top while it is open.
      await expect.poll(() => (document.querySelector('[data-ouro-part="action"]')?.getBoundingClientRect().bottom ?? Infinity) < innerHeight / 2).toBe(true);
      // Undo stays on screen after the toast has moved, not only while it leaves.
      for (let frame = 0; frame < 20; frame += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
      expect(document.querySelector('[data-ouro-part="action"]')).not.toBeNull();
    } finally {
      vi.unstubAllGlobals();
      await page.viewport(1100, 900);
    }
  });


  it("draws the toolbar's buttons at one height", async () => {
    await page.viewport(1280, 900);
    await renderPage("/docs/calendar-demo/");
    await expect.poll(() => page.getByRole("button", { name: "New event" }).elements().length).toBe(1);
    const height = (name: string) => Math.round(page.getByRole("button", { name }).element().getBoundingClientRect().height);
    expect(new Set(["Today", "Previous week", "Next week", "Go to date", "New event"].map(height)).size).toBe(1);
  });

  it("puts focus back in the grid after Delete, so the keyboard does not start over", async () => {
    await page.viewport(1100, 900);
    await renderPage("/docs/calendar-demo/");
    await page.getByRole("button", { name: /Sprint planning/ }).first().click();
    page.getByRole("button", { name: "Delete" }).element().focus();
    await userEvent.keyboard("{Enter}");
    await expect.element(page.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    await expect.poll(() => document.activeElement?.closest('[data-ouro="time-grid"]') !== null).toBe(true);
  });

  it("puts focus in the grid after Delete on a phone, not on the page body", async () => {
    await page.viewport(390, 844);
    await renderPage("/docs/calendar-demo/");
    await expect.poll(() => document.querySelector('[data-ouro="time-grid"] [data-ouro-part="event"]')).not.toBeNull();
    (document.querySelector('[data-ouro="time-grid"] [data-ouro-part="event"]') as HTMLElement).click();
    await expect.element(page.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    await userEvent.click(page.getByRole("button", { name: "Delete" }));
    await expect.element(page.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    // The closing sheet takes focus back for a moment, so watch every frame, not just the first.
    for (let frame = 0; frame < 90; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    expect(document.activeElement?.closest('[data-ouro="time-grid"]')).not.toBeNull();
  });

  it("puts focus in the grid after Delete even when the sheet takes ages to close", async () => {
    await page.viewport(390, 844);
    await renderPage("/docs/calendar-demo/");
    await expect.poll(() => document.querySelector('[data-ouro="time-grid"] [data-ouro-part="event"]')).not.toBeNull();
    (document.querySelector('[data-ouro="time-grid"] [data-ouro-part="event"]') as HTMLElement).click();
    await expect.element(page.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    // A sheet that takes a long while to leave, so focus is handed back well after the delete.
    const slow = document.createElement("style");
    slow.setAttribute("data-test-harness", "");
    slow.textContent = '[data-ouro="sheet"], [data-ouro="sheet"] * { transition-duration: 1500ms !important; }';
    document.head.append(slow);
    try {
      await userEvent.click(page.getByRole("button", { name: "Delete" }));
      await expect.poll(() => document.activeElement?.closest('[data-ouro="time-grid"]') !== null, { timeout: 10_000 }).toBe(true);
    } finally {
      slow.remove();
    }
  });

  it("returns focus to Go to date when its popover is dismissed without a pick", async () => {
    await page.viewport(1100, 900);
    await renderPage("/docs/calendar-demo/");
    const jump = page.getByRole("button", { name: /Go to date/ });
    const button = jump.element();
    await userEvent.click(jump);
    await expect.poll(() => button.getAttribute("aria-expanded")).toBe("true");
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => button.getAttribute("aria-expanded")).toBe("false");
    await expect.poll(() => document.activeElement === button).toBe(true);
  });

  it("keeps the slot cursor on the slot just created, so the keyboard does not start over", async () => {
    await page.viewport(1100, 900);
    await renderPage("/docs/calendar-demo/");
    await expect.poll(() => document.querySelector('[data-ouro="time-grid"] [role="grid"]')).not.toBeNull();
    const slots = document.querySelector<HTMLElement>('[data-ouro="time-grid"] [role="grid"]')!;
    slots.focus();
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowRight}");
    const was = slots.getAttribute("aria-activedescendant");
    expect(was).not.toBeNull();
    await userEvent.keyboard("{Enter}");
    const dialog = page.getByRole("dialog", { name: "New event" });
    await expect.element(dialog).toBeInTheDocument();
    await dialog.getByRole("textbox", { name: /Title/ }).fill("Qwe");
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect.element(dialog).not.toBeInTheDocument();
    await expect.poll(() => document.activeElement === slots).toBe(true);
    expect(slots.getAttribute("aria-activedescendant")).toBe(was);
  });

  it("scrolls the week inside its frame at large text instead of squeezing the days or the page", async () => {
    await page.viewport(700, 900);
    document.documentElement.style.fontSize = "200%";
    // The View control's labels outgrow its scroller at this size, which its own message says.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await renderPage("/docs/calendar-demo/");
      const frame = () => document.querySelector<HTMLElement>('[data-site-calendar-demo] [data-ouro="time-grid"]')!.parentElement!.parentElement!;
      const sizes = () => `${frame().scrollWidth}:${frame().clientWidth}:${document.documentElement.scrollWidth}`;
      let last = "";
      await expect.poll(() => { const now = sizes(); const same = now === last; last = now; return same; }).toBe(true);
      expect(frame().scrollWidth).toBeGreaterThan(frame().clientWidth);
      const grid = document.querySelector<HTMLElement>('[data-site-calendar-demo] [data-ouro="time-grid"]')!;
      expect(grid.getBoundingClientRect().width).toBeGreaterThanOrEqual(36 * parseFloat(getComputedStyle(document.documentElement).fontSize));
    } finally {
      warn.mockRestore();
      document.documentElement.style.fontSize = "";
    }
  });

  it("deletes a focused event with the Delete key, and Ctrl+Z brings it back with focus on it", async () => {
    await page.viewport(1100, 900);
    await renderPage("/docs/calendar-demo/");
    const before = eventTitles();
    const event = page.getByRole("button", { name: /Sprint planning/ }).first().element() as HTMLElement;
    event.focus();
    await userEvent.keyboard("{Delete}");
    await expect.poll(eventTitles).toBe(before - 1);
    await userEvent.keyboard("{Control>}z{/Control}");
    await expect.poll(eventTitles).toBe(before);
    await expect.poll(() => document.activeElement?.getAttribute("aria-label")).toMatch(/Sprint planning/);
  });

  it("puts focus on the event again after a second delete and Undo", async () => {
    await page.viewport(1100, 900);
    await renderPage("/docs/calendar-demo/");
    for (let round = 0; round < 2; round++) {
      page.getByRole("button", { name: /Sprint planning/ }).first().element().focus();
      await userEvent.keyboard("{Delete}");
      await userEvent.click(page.getByRole("button", { name: "Undo" }).last());
      await expect.poll(() => document.activeElement?.getAttribute("aria-label")).toMatch(/Sprint planning/);
      (document.activeElement as HTMLElement).blur();
    }
  });

  it("puts focus on the event Undo brings back", async () => {
    await page.viewport(1100, 900);
    await renderPage("/docs/calendar-demo/");
    page.getByRole("button", { name: /Sprint planning/ }).first().element().focus();
    await userEvent.keyboard("{Delete}");
    await userEvent.click(page.getByRole("button", { name: "Undo" }));
    await expect.poll(() => document.activeElement?.getAttribute("aria-label")).toMatch(/Sprint planning/);
  });

  it("marks Go to date as opening a dialog", async () => {
    await renderPage("/docs/calendar-demo/");
    expect(page.getByRole("button", { name: "Go to date" }).element().getAttribute("aria-haspopup")).toBe("dialog");
  });

  it.each(["light", "dark"] as const)("passes the accessibility scan in %s", async (scheme) => {
    setScheme(scheme);
    await renderPage("/docs/calendar-demo/");
    const violations = await scan();
    expect(violations, describeViolations(violations)).toEqual([]);
  }, pageScanTimeout);
});
