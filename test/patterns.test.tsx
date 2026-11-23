import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { DashboardPage } from "@/registry/ouro/patterns/dashboard-page/dashboard-page";
import { ListDetailPage } from "@/registry/ouro/patterns/list-detail-page/list-detail-page";
import { SettingsPage } from "@/registry/ouro/patterns/settings-page/settings-page";
import dashboardSource from "@/registry/ouro/patterns/dashboard-page/dashboard-page.tsx?raw";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { watchAnnouncements } from "@/registry/ouro/lib/ouro/testing/announcements";
import { audit, axeExclude, describeFindings } from "@/registry/ouro/lib/ouro/testing/axe";
import { settle } from "./stories.tsx";

// The page patterns an app installs whole, in a real browser: each draws a whole page from the components with no
// stylesheet of its own, passes axe at a phone's and a laptop's width, and does what its words say.

const roots: Root[] = [];
let host: HTMLDivElement;

async function render(node: ReactNode) {
  host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
}

afterEach(async () => {
  await page.viewport(1280, 800);
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  host?.remove();
  vi.restoreAllMocks();
});

/**
 * axe over the page and anything it opened, at each width. Scanned only once the page has settled: an overlay that has just
 * mounted is still fading in, and a colour read mid-fade (#1894) fails contrast the finished overlay passes.
 */
async function passesAxe() {
  for (const [width, height] of [[390, 844], [1280, 800]] as const) {
    await page.viewport(width, height);
    await settle();
    expect(describeFindings(await audit({ include: [document.body], exclude: axeExclude.map((selector) => [selector]) }))).toBe("");
  }
}

const field = (name: string) => page.getByRole("textbox", { name, exact: true });
/** The page's own save status (an open dialog adds a status region of its own). */
const status = () => page.elementLocator(host.querySelector('p[role="status"]')!);

describe("SettingsPage", () => {
  it("is a whole page: a main landmark, its heading, the theme toggle, the profile form and the danger zone, and passes axe", async () => {
    await render(<SettingsPage />);
    expect(host.querySelector("main h1")?.textContent).toBe("Settings");
    await expect.element(page.getByRole("button", { name: "Save" })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Delete account" })).toBeVisible();
    expect(host.querySelector('[data-ouro="color-scheme-toggle"]')).not.toBeNull();
    await passesAxe();
  });

  it("keeps the save status in the row with Save, so the card has no empty band under the button", async () => {
    await render(<SettingsPage />);
    const save = host.querySelector('button[type="submit"]')!.getBoundingClientRect();
    const line = host.querySelector('p[role="status"]')!.getBoundingClientRect();
    expect(line.top).toBeLessThan(save.bottom);
  });

  it("saves only once the browser's checks and its own pass, shows a returned error on its field, and says when it saved", async () => {
    const onSave = vi.fn((settings: { email: string }) => (settings.email === "taken@example.com" ? { email: "That email is in use." } : undefined));
    await render(<SettingsPage onSave={onSave} initial={{ name: "", email: "", language: "fr", notifications: false }} />);
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    expect(onSave).not.toHaveBeenCalled();
    await userEvent.fill(field("Display name"), "Ada");
    await userEvent.fill(field("Email"), "not-an-email");
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    expect(onSave).not.toHaveBeenCalled();
    await userEvent.fill(field("Display name"), "A");
    await userEvent.fill(field("Email"), "ada@example.com");
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    await expect.element(field("Display name")).toHaveAttribute("aria-invalid", "true");
    await expect.element(field("Display name")).toHaveAccessibleDescription(/Use at least 2 letters\./);
    expect(onSave).not.toHaveBeenCalled();
    await userEvent.fill(field("Display name"), "Ada");
    await userEvent.fill(field("Email"), "taken@example.com");
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    await expect.element(field("Email")).toHaveAccessibleDescription(/That email is in use\./);
    expect(status().element().textContent).toBe("");
    await userEvent.fill(field("Email"), "ada@example.com");
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    await expect.element(status()).toHaveTextContent("Settings saved.");
    expect(onSave).toHaveBeenLastCalledWith({ name: "Ada", email: "ada@example.com", language: "fr", notifications: false });
  });

  it("deletes the account only once the person confirms, then starts the form over", async () => {
    const onDelete = vi.fn();
    await render(<SettingsPage onDelete={onDelete} initial={{ name: "Ada", email: "ada@example.com", language: "en", notifications: true }} />);
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    await expect.element(status()).toHaveTextContent("Settings saved.");
    await userEvent.fill(field("Display name"), "Edited");
    await userEvent.click(page.getByRole("button", { name: "Delete account" }));
    await expect.element(page.getByRole("alertdialog")).toBeVisible();
    await passesAxe();
    await userEvent.click(page.getByRole("alertdialog").getByRole("button", { name: "Delete account" }));
    await expect.poll(() => onDelete.mock.calls.length).toBe(1);
    await expect.element(field("Display name")).toHaveValue("");
    await expect.element(field("Email")).toHaveValue("");
    await expect.element(status()).toHaveTextContent("Account deleted.");
    await userEvent.fill(field("Display name"), "Bo");
    await userEvent.fill(field("Email"), "bo@example.com");
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    await expect.element(status()).toHaveTextContent("Settings saved.");
  });

  it("clears what it said while the next save runs, so each save is announced and a failed one never reads as saved", async () => {
    let finish = () => {};
    const onSave = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    await render(<SettingsPage onSave={onSave} initial={{ name: "Ada", email: "ada@example.com", language: "en", notifications: true }} />);
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    finish();
    await expect.element(status()).toHaveTextContent("Settings saved.");
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    await expect.poll(() => onSave.mock.calls.length).toBe(2);
    expect(status().element().textContent).toBe("");
    finish();
    await expect.element(status()).toHaveTextContent("Settings saved.");
  });

  it("shows Save busy while a save runs, cannot be pressed again meanwhile, and settles when it answers", async () => {
    let finish = () => {};
    const onSave = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    await render(<SettingsPage onSave={onSave} initial={{ name: "Ada", email: "ada@example.com", language: "en", notifications: true }} />);
    const save = page.getByRole("button", { name: "Save" });
    await expect.element(save).not.toHaveAttribute("aria-busy", "true");
    await userEvent.click(save);
    await expect.element(save).toHaveAttribute("aria-busy", "true");
    await expect.element(save).toBeDisabled();
    expect(onSave).toHaveBeenCalledTimes(1);
    finish();
    await expect.element(status()).toHaveTextContent("Settings saved.");
    await expect.element(save).not.toHaveAttribute("aria-busy", "true");
  });

  it("empties its status for a frame before a repeat save that resolves at once, so a screen reader hears it again", async () => {
    await render(<SettingsPage initial={{ name: "Ada", email: "ada@example.com", language: "en", notifications: true }} />);
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    await expect.element(status()).toHaveTextContent("Settings saved.");
    // What each frame shows, as a screen reader reads the page between tasks.
    const frames: string[] = [];
    let next: number;
    const sample = () => {
      frames.push(status().element().textContent ?? "");
      next = requestAnimationFrame(sample);
    };
    next = requestAnimationFrame(sample);
    try {
      await userEvent.click(page.getByRole("button", { name: "Save" }));
      await expect.poll(() => frames.lastIndexOf("") >= 0 && frames.at(-1) === "Settings saved.").toBe(true);
    } finally {
      cancelAnimationFrame(next);
    }
  });

  it("lets a save that finishes late change nothing once a later submit has answered", async () => {
    let finish = () => {};
    const onSave = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    await render(<SettingsPage onSave={onSave} initial={{ name: "Ada", email: "ada@example.com", language: "en", notifications: true }} />);
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    await expect.poll(() => onSave.mock.calls.length).toBe(1);
    await userEvent.fill(field("Display name"), "A");
    // A busy Save blocks Enter too, so a submit that overtakes the running save comes from code.
    await act(async () => host.querySelector("form")!.requestSubmit());
    await expect.element(field("Display name")).toHaveAttribute("aria-invalid", "true");
    finish();
    await act(async () => {
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
    });
    await expect.element(field("Display name")).toHaveAttribute("aria-invalid", "true");
    expect(status().element().textContent).toBe("");
  });

  it("lets a save still running when the account is deleted change nothing on the emptied form", async () => {
    let finish = () => {};
    const onSave = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    await render(<SettingsPage onSave={onSave} initial={{ name: "Ada", email: "ada@example.com", language: "en", notifications: true }} />);
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    await expect.poll(() => onSave.mock.calls.length).toBe(1);
    await userEvent.click(page.getByRole("button", { name: "Delete account" }));
    await userEvent.click(page.getByRole("alertdialog").getByRole("button", { name: "Delete account" }));
    await expect.element(field("Display name")).toHaveValue("");
    finish();
    await act(async () => {
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
    });
    expect(status().element().textContent).toBe("Account deleted.");
    await expect.element(field("Display name")).toHaveValue("");
  });

  it("keeps a running save's answer when the delete fails, since the account is still there", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      let finish = () => {};
      const onSave = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
      await render(<SettingsPage onSave={onSave} onDelete={() => Promise.reject(new Error("Offline"))} initial={{ name: "Ada", email: "ada@example.com", language: "en", notifications: true }} />);
      await userEvent.click(page.getByRole("button", { name: "Save" }));
      await expect.poll(() => onSave.mock.calls.length).toBe(1);
      await userEvent.click(page.getByRole("button", { name: "Delete account" }));
      await userEvent.click(page.getByRole("alertdialog").getByRole("button", { name: "Delete account" }));
      await expect.poll(() => warn.mock.calls.length).toBe(1);
      finish();
      await expect.element(status()).toHaveTextContent("Settings saved.");
      await userEvent.click(page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }));
      await expect.element(field("Display name")).toHaveValue("Ada");
    } finally {
      warn.mockRestore();
    }
  });

  it("works with no handlers, as installed", async () => {
    await render(<SettingsPage />);
    await userEvent.fill(field("Display name"), "Ada");
    await userEvent.fill(field("Email"), "ada@example.com");
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    await expect.element(status()).toHaveTextContent("Settings saved.");
    await userEvent.click(page.getByRole("button", { name: "Delete account" }));
    await userEvent.click(page.getByRole("alertdialog").getByRole("button", { name: "Delete account" }));
    await expect.element(field("Display name")).toHaveValue("");
  });
});

describe("DashboardPage", () => {
  it("is a Server Component that hands no function to the client components it renders", () => {
    expect(dashboardSource.startsWith('"use client"')).toBe(false);
    // A prop or column field that is a function, such as Table's cell: (row) => …, can't cross to the client.
    expect(dashboardSource.match(/\b\w+(?::|=\{)\s*(?:async\s*)?\([^()]*\)\s*=>/g)).toBeNull();
  });

  it("is a whole page: a heading, a card per number, headed by the number with its label, with how it moved, a chart and the recent activity, and passes axe", async () => {
    await render(<DashboardPage />);
    expect(host.querySelector("main h1")?.textContent).toBe("Overview");
    for (const [label, value] of [["Revenue", "$48,200"], ["Orders", "1,284"], ["Returns", "38"]]) await expect.element(page.getByRole("heading", { name: `${label}: ${value}`, level: 2 })).toBeVisible();
    await expect.element(page.getByText("+12% from last month")).toBeVisible();
    await expect.element(page.getByRole("table", { name: "Recent activity" })).toBeVisible();
    await expect.element(page.getByRole("cell", { name: "Mara Lind" })).toBeVisible();
    expect(host.querySelector('[data-ouro="chart"]')).not.toBeNull();
    await passesAxe();
  });

  it("draws the numbers, months and rows it is given, and says when there is no activity", async () => {
    await render(
      <DashboardPage
        stats={[{ label: "Visitors", value: "9,120", change: "No change", trend: "flat" }]}
        months={[{ month: "Jul", orders: 10, returns: 1 }]}
        activity={[]}
      />,
    );
    await expect.element(page.getByRole("heading", { name: "Visitors: 9,120", level: 2 })).toBeVisible();
    await expect.element(page.getByText("No change")).toBeVisible();
    await expect.element(page.getByText("No activity yet.")).toBeVisible();
    expect(host.querySelector('[data-ouro="table"]')).toBeNull();
  });
});

describe("ListDetailPage", () => {
  const row = (name: string) => page.getByRole("button", { name, exact: true });
  // Found by tag, since a part hidden on a phone is out of the accessibility tree.
  const section = () => host.querySelector("section")!;
  const shownNow = (element: Element) => element.checkVisibility();
  const backButton = () => [...host.querySelectorAll("button")].find((button) => button.textContent === "Back to recipes")!;
  const frame = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));

  it("is a whole page: a heading, a search, the list and the detail of the first entry, and passes axe", async () => {
    await render(<ListDetailPage />);
    expect(host.querySelector("main h1")?.textContent).toBe("Recipes");
    await expect.element(page.getByRole("searchbox", { name: "Search recipes" })).toBeVisible();
    await expect.element(page.getByRole("list", { name: "Recipes" })).toBeVisible();
    await expect.element(row("Braised short ribs")).toHaveAttribute("aria-current", "true");
    await expect.element(page.getByRole("heading", { level: 2, name: "Braised short ribs" })).toBeVisible();
    await passesAxe();
  });

  it("shows the entry a row's press chooses, and marks that row shown", async () => {
    await render(<ListDetailPage />);
    await userEvent.click(row("Lentil soup"));
    await expect.element(page.getByRole("heading", { level: 2, name: "Lentil soup" })).toBeVisible();
    await expect.element(row("Lentil soup")).toHaveAttribute("aria-current", "true");
    expect(row("Braised short ribs").element().hasAttribute("aria-current")).toBe(false);
    expect(section().getAttribute("aria-label")).toBe("Lentil soup");
  });

  it("says which entry is showing when a row is chosen beside the list, where focus stays in the list, and says nothing on a phone, where focus moves to the heading", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const announced = watchAnnouncements();
    try {
      await page.viewport(1280, 800);
      await render(<ListDetailPage />);
      await userEvent.click(row("Lentil soup"));
      await act(() => vi.advanceTimersByTimeAsync(1500));
      expect(announced.count("Showing Lentil soup")).toBe(1);
      expect(document.activeElement).not.toBe(host.querySelector("h2"));
      await page.viewport(390, 844);
      await userEvent.click(backButton());
      await frame();
      await userEvent.click(row("Lemon olive oil cake"));
      await act(() => vi.advanceTimersByTimeAsync(1500));
      expect(announced.count("Showing Lemon olive oil cake")).toBe(0);
      expect(document.activeElement).toBe(host.querySelector("h2"));
    } finally {
      announced.stop();
      vi.useRealTimers();
    }
  });

  it("narrows the list as you search, says how many match to a screen reader, and says when nothing matches", async () => {
    await render(<ListDetailPage />);
    const search = page.getByRole("searchbox", { name: "Search recipes" });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const announced = watchAnnouncements();
    try {
      const searchFor = async (words: string) => {
        await userEvent.fill(search, words);
        await act(() => vi.advanceTimersByTimeAsync(1500));
      };
      await searchFor("lemon");
      expect(row("Lemon olive oil cake").element()).toBeVisible();
      expect(host.querySelectorAll("[data-ouro=item]")).toHaveLength(1);
      expect(announced.count("1 match")).toBe(1);
      await searchFor("o");
      expect(announced.count("3 matches")).toBe(1);
      await searchFor("pizza");
      expect(page.getByText("Nothing matches").element()).toBeVisible();
      expect(host.querySelectorAll("[data-ouro=item]")).toHaveLength(0);
      expect(announced.count("0 matches")).toBe(1);
    } finally {
      announced.stop();
      vi.useRealTimers();
    }
    await passesAxe();
  });

  it("says how many match once the person stops typing, not while each key is still being said", async () => {
    await render(<ListDetailPage />);
    const search = page.getByRole("searchbox", { name: "Search recipes" });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const announced = watchAnnouncements();
    try {
      // A key every 100 ms, as a person types: the count is ready at the first key, and waits until they pause.
      for (const typed of ["z", "zz", "zzz", "zzzz"]) {
        await userEvent.fill(search, typed);
        await act(() => vi.advanceTimersByTimeAsync(100));
        expect(announced.count("0 matches")).toBe(0);
      }
      await act(() => vi.advanceTimersByTimeAsync(1300));
      expect(announced.count("0 matches")).toBe(0);
      await act(() => vi.advanceTimersByTimeAsync(100));
      expect(announced.count("0 matches")).toBe(1);
      // Cleared before the count is said: nothing more.
      await userEvent.fill(search, "lemon");
      await userEvent.fill(search, "");
      await act(() => vi.advanceTimersByTimeAsync(3000));
      expect(announced.changes).toHaveLength(1);
    } finally {
      announced.stop();
      vi.useRealTimers();
    }
  });

  it("on a phone moves focus to the heading in the same task as a row's press, so the page never holds it between", async () => {
    await page.viewport(390, 844);
    await render(<ListDetailPage />);
    // Looked up without a locator, which throws while the element is not in the page yet.
    const rowElement = () => [...host.querySelectorAll("button")].find((button) => button.textContent?.startsWith("Lemon olive oil cake"))!;
    const headingElement = () => [...host.querySelectorAll("h2")].find((heading) => heading.textContent === "Lemon olive oil cake");
    // A click is a discrete event, which React commits in a microtask, before the browser renders again. The press
    // hides the row, so focus must be on the heading by then: a move a frame later would leave the browser to put
    // focus on the page first, and a screen reader starts reading the page, cut off by the move that follows.
    rowElement().focus();
    rowElement().click();
    for (let tick = 0; tick < 5; tick++) await Promise.resolve();
    expect(document.activeElement).toBe(headingElement());
  });

  it("on a phone keeps focus on Back while the list comes back, then moves it to the row once the list has had a frame, never through the page", async () => {
    await page.viewport(390, 844);
    await render(<ListDetailPage />);
    const rowElement = () => [...host.querySelectorAll("button")].find((button) => button.textContent?.startsWith("Lemon olive oil cake"))!;
    await userEvent.click(rowElement());
    await expect.poll(() => shownNow(host.querySelector("ul")!)).toBe(false);
    backButton().focus();
    // Each frame's focused element, from the press until focus reaches the row.
    const seen: Element[] = [];
    const watching = new Promise<void>((done) => {
      const sample = () => {
        if (seen.at(-1) !== document.activeElement) seen.push(document.activeElement!);
        if (document.activeElement === rowElement()) done();
        else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    backButton().click();
    for (let tick = 0; tick < 5; tick++) await Promise.resolve();
    // The list is back, and focus is still on Back, which stays focusable though unseen.
    expect(shownNow(host.querySelector("ul")!)).toBe(true);
    expect(document.activeElement).toBe(backButton());
    await watching;
    expect(seen).toEqual([backButton(), rowElement()]);
    await expect.poll(() => shownNow(section())).toBe(false);
  });

  it("on a phone shows the list first, the detail in its place once chosen with focus on its heading, and Back to the row", async () => {
    await page.viewport(390, 844);
    await render(<ListDetailPage />);
    expect(shownNow(section())).toBe(false);
    await userEvent.click(row("Lemon olive oil cake"));
    const heading = page.getByRole("heading", { level: 2, name: "Lemon olive oil cake" });
    await expect.element(heading).toBeVisible();
    await expect.poll(() => document.activeElement).toBe(heading.element());
    expect(shownNow(host.querySelector("ul")!)).toBe(false);
    const back = page.getByRole("button", { name: "Back to recipes" });
    // Its chevron keeps the size the button gives it, and points back in a right-to-left page.
    const chevron = back.element().querySelector("svg")!;
    expect(chevron.getBoundingClientRect().width).toBeGreaterThan(0);
    expect(chevron.getAttribute("class")).toContain("rtl:-scale-x-100");
    await userEvent.click(back);
    await expect.element(row("Lemon olive oil cake")).toBeVisible();
    await expect.poll(() => document.activeElement).toBe(row("Lemon olive oil cake").element());
    // Focus reaches the row a render before the unseen detail it came from leaves the page.
    await expect.poll(() => shownNow(section())).toBe(false);
  });

  it("on a phone marks a row shown only while its entry shows in the list's place", async () => {
    await page.viewport(390, 844);
    await render(<ListDetailPage />);
    const current = () => host.querySelectorAll("[aria-current]").length;
    expect(current()).toBe(0);
    await userEvent.click(row("Lentil soup"));
    await expect.element(page.getByRole("heading", { level: 2, name: "Lentil soup" })).toBeVisible();
    // Found by tag, since the list is hidden while the detail shows in its place.
    expect(host.querySelector("[aria-current]")?.textContent).toBe("Lentil soup");
    await userEvent.click(page.getByRole("button", { name: "Back to recipes" }));
    await expect.element(row("Lentil soup")).toBeVisible();
    expect(current()).toBe(0);
    await page.viewport(1280, 800);
    await expect.poll(() => row("Lentil soup").element().getAttribute("aria-current")).toBe("true");
  });

  it("leaves focus where it was on a wide screen, where the detail is beside the list, and hides the way back", async () => {
    await render(<ListDetailPage />);
    await userEvent.click(row("Lentil soup"));
    await frame();
    expect(document.activeElement).not.toBe(page.getByRole("heading", { level: 2, name: "Lentil soup" }).element());
    expect(shownNow(section())).toBe(true);
    expect(shownNow(backButton())).toBe(false);
  });

  it("names its list and empty state after its title, and says when there are no entries", async () => {
    await render(<ListDetailPage entries={[]} title="Notes" />);
    await expect.element(page.getByRole("searchbox", { name: "Search notes" })).toBeVisible();
    await expect.element(page.getByText("No notes yet")).toBeVisible();
    // Nothing was searched, so the list doesn't say nothing matches.
    expect(host.textContent).not.toContain("Nothing matches");
    // On a phone too, the page says there is nothing yet.
    await page.viewport(390, 844);
    expect(shownNow(page.getByText("No notes yet").element())).toBe(true);
    await passesAxe();
    expect(section().getAttribute("aria-label")).toBe("Notes");
  });

  it("shows the first entry once entries arrive, and the first again when the one shown goes", async () => {
    const roots0 = roots.length;
    await render(<ListDetailPage entries={[]} />);
    const root = roots[roots0]!;
    const entries = [
      { id: "a", title: "Apple tart", summary: "One hour", body: "Bake it.", updated: "Jun 1" },
      { id: "b", title: "Bean stew", summary: "Two hours", body: "Simmer it.", updated: "Jun 2" },
    ];
    await act(async () => root.render(<ListDetailPage entries={entries} />));
    await expect.element(page.getByRole("heading", { level: 2, name: "Apple tart" })).toBeVisible();
    await expect.element(row("Apple tart")).toHaveAttribute("aria-current", "true");
    await userEvent.click(row("Bean stew"));
    await act(async () => root.render(<ListDetailPage entries={entries.slice(0, 1)} />));
    await expect.element(page.getByRole("heading", { level: 2, name: "Apple tart" })).toBeVisible();
  });

  it("on a phone keeps a way back to the list when the entry shown goes away", async () => {
    await page.viewport(390, 844);
    const roots0 = roots.length;
    const entries = [{ id: "a", title: "Apple tart", summary: "One hour", body: "Bake it.", updated: "Jun 1" }];
    await render(<ListDetailPage entries={entries} />);
    await userEvent.click(row("Apple tart"));
    await expect.element(page.getByRole("heading", { level: 2, name: "Apple tart" })).toBeVisible();
    await act(async () => roots[roots0]!.render(<ListDetailPage entries={[]} />));
    // Nothing to read, so the list and its search come back, and the page says there is nothing.
    expect(shownNow(host.querySelector("input")!)).toBe(true);
    expect(shownNow(page.getByText("No recipes yet").element())).toBe(true);
  });

  it("on a phone sends Back to the search when a search has left the shown row out", async () => {
    await page.viewport(390, 844);
    await render(<ListDetailPage />);
    await userEvent.fill(page.getByRole("searchbox", { name: "Search recipes" }), "lentil");
    await userEvent.click(row("Lentil soup"));
    await expect.poll(() => document.activeElement).toBe(page.getByRole("heading", { level: 2, name: "Lentil soup" }).element());
    // The search no longer finds the entry shown, so its row is gone from the list.
    await act(async () => {
      const input = host.querySelector("input")!;
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(input, "cake");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await userEvent.click(page.getByRole("button", { name: "Back to recipes" }));
    await expect.poll(() => document.activeElement).toBe(host.querySelector("input"));
  });

  it("turns its back chevron to point back in a right-to-left page", async () => {
    await page.viewport(390, 844);
    await render(
      <div dir="rtl">
        <ListDetailPage />
      </div>,
    );
    await userEvent.click(row("Lentil soup"));
    const chevron = page.getByRole("button", { name: "Back to recipes" }).element().querySelector("svg")!;
    // Tailwind's scale-x utility sets the scale property.
    expect(getComputedStyle(chevron).scale).toBe("-1 1");

  });
});
