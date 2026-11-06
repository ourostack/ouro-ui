import { type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { ConversationList, type ConversationListItem, type ConversationListSection } from "@/registry/ouro/components/ouro/conversation-list/conversation-list";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { pressTab } from "@/registry/ouro/lib/ouro/testing/tab";

const roots: Root[] = [];
let mounted: Element[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
});

/** Renders into a 360 by 400 pixel pane that scrolls, as an app's sidebar does, under a header 60 pixels tall. */
async function render(node: ReactNode, height = 400) {
  const header = document.createElement("div");
  header.style.height = "60px";
  const pane = document.createElement("div");
  pane.style.cssText = `width: 360px; height: ${height}px; overflow-y: auto`;
  document.body.append(header, pane);
  mounted.push(header, pane);
  const root = createRoot(pane);
  roots.push(root);
  await act(async () => root.render(node));
  return {
    pane,
    root,
    rerender: (next: ReactNode) => act(async () => root.render(next)),
    list: () => pane.querySelector<HTMLUListElement>('[data-ouro="conversation-list"] > ul')!,
    rows: () => [...pane.querySelectorAll<HTMLButtonElement>('[data-ouro-part="row"]')],
    ids: () => [...pane.querySelectorAll<HTMLButtonElement>('[data-ouro-part="row"]')].map((row) => row.querySelector("[data-ouro-conversation-title]")!.textContent),
  };
}

const many = (count: number, extra: (index: number) => Partial<ConversationListItem> = () => ({})): ConversationListItem[] =>
  Array.from({ length: count }, (_, index) => ({ id: `c${index}`, title: `c${index}`, preview: "The latest message.", time: "9:41", ...extra(index) }) as ConversationListItem);

const scrollPane = (pane: HTMLElement, top: number) =>
  act(async () => {
    pane.scrollTop = top;
    pane.dispatchEvent(new Event("scroll"));
  });

/** Whether an element shows whole inside the pane. */
const inView = (element: Element, pane: HTMLElement) => {
  const box = element.getBoundingClientRect();
  const view = pane.getBoundingClientRect();
  return box.top >= view.top - 0.5 && box.bottom <= view.bottom + 0.5;
};

const titleOf = (element: Element | null) => element?.querySelector("[data-ouro-conversation-title], [data-ouro-conversation-section-title]")?.textContent;

/**
 * Checks that the rows rendered, other than those kept, are exactly those that reach the pane's view widened by 320
 * pixels each way: one run of rows in order, each reaching it, with the rows on either side of the run outside it.
 */
function expectBand(pane: HTMLElement, kept: readonly string[]) {
  const list = pane.querySelector<HTMLElement>('[data-ouro="conversation-list"] > ul')!;
  const listTop = list.getBoundingClientRect().top;
  const view = pane.getBoundingClientRect();
  const top = Math.max(view.top, 0) - listTop - 320;
  const bottom = Math.min(view.bottom, innerHeight) - listTop + 320;
  const slots = [...list.querySelectorAll<HTMLElement>('[data-ouro-part="row"]')]
    .filter((row) => !kept.includes(titleOf(row)!))
    .map((row) => ({ index: Number(titleOf(row)!.slice(1)), start: parseFloat(row.parentElement!.style.top), end: parseFloat(row.parentElement!.style.top) + row.parentElement!.offsetHeight }));
  expect(slots.map((slot) => slot.index)).toEqual(slots.map((_, at) => slots[0]!.index + at));
  for (const slot of slots) expect(slot.end > top && slot.start < bottom, `c${slot.index} reaches the view`).toBe(true);
  const [first, last] = [slots[0]!, slots.at(-1)!];
  const count = Number(list.querySelector("li")!.getAttribute("aria-setsize"));
  if (first.index > 1) expect(first.start, `c${first.index - 1} is outside the view`).toBeLessThanOrEqual(top);
  if (last.index < count - 1) expect(last.end, `c${last.index + 1} is outside the view`).toBeGreaterThanOrEqual(bottom);
}

describe("ConversationList windowing", () => {
  it("renders only the rows near the view of a long list, in a list as tall as all of them", async () => {
    const { list, rows, ids, pane } = await render(<ConversationList label="Conversations" items={many(500)} onSelect={() => {}} />);
    expectBand(pane, []);
    expect(rows().length).toBeLessThan(30);
    expect(ids().slice(0, 3)).toEqual(["c0", "c1", "c2"]);
    // The first row starts at the list's top, and each row is as tall as the first, with the gap a short list puts between rows.
    expect(rows()[0]!.getBoundingClientRect().top).toBe(list().getBoundingClientRect().top);
    const step = rows()[1]!.getBoundingClientRect().top - rows()[0]!.getBoundingClientRect().top;
    expect(list().getBoundingClientRect().height).toBeCloseTo(step * 499 + rows()[0]!.offsetHeight, 0);
    // Screen readers hear where a row is in the whole list.
    expect(rows().map((row) => row.parentElement!.getAttribute("aria-posinset")).slice(0, 2)).toEqual(["1", "2"]);
    expect(rows()[0]!.parentElement!.getAttribute("aria-setsize")).toBe("500");
    // The list holds rows only.
    expect([...list().childNodes].every((node) => node.nodeName === "LI")).toBe(true);
  });

  it("keeps a list of 60 conversations whole, as a short list always was", async () => {
    const { rows, list, rerender, pane } = await render(<ConversationList label="Conversations" items={many(60)} onSelect={() => {}} />);
    expect(rows()).toHaveLength(60);
    expect(rows()[0]!.parentElement!.hasAttribute("aria-setsize")).toBe(false);
    expect(list().style.height).toBe("");
    await rerender(<ConversationList label="Conversations" items={many(61)} onSelect={() => {}} />);
    expect(list().style.height).not.toBe("");
    // Grown long, the list follows its pane's scroll.
    await rerender(<ConversationList label="Conversations" items={many(200)} onSelect={() => {}} />);
    await scrollPane(pane, 5000);
    expectBand(pane, ["c0"]);
  });

  it("renders the rows a scroll reaches, in order, and drops the rows it leaves", async () => {
    const { pane, ids, rows } = await render(<ConversationList label="Conversations" items={many(500)} onSelect={() => {}} />);
    const step = rows()[1]!.getBoundingClientRect().top - rows()[0]!.getBoundingClientRect().top;
    await scrollPane(pane, step * 250);
    const now = ids();
    // The first row stays, as the list's Tab stop; the rows near the view follow it.
    expect(now[0]).toBe("c0");
    expect(now).toContain("c250");
    expectBand(pane, ["c0"]);
    // The rows sit where they would in the whole list.
    const row = rows().find((element) => titleOf(element) === "c250")!;
    expect(row.getBoundingClientRect().top - pane.getBoundingClientRect().top).toBeCloseTo(0, -1);
    // Scrolling the page, or a box beside the list, leaves the rows as they were.
    await act(async () => document.dispatchEvent(new Event("scroll")));
    await act(async () => document.body.dispatchEvent(new Event("scroll")));
    expect(ids()).toEqual(now);
  });

  it("renders exactly the rows the view and 320 pixels past each edge reach, a few pixels of scroll at a time", async () => {
    const { pane } = await render(<ConversationList label="Conversations" items={many(500)} onSelect={() => {}} />);
    // Steps of 7 pixels land a row's edge exactly on the view's widened top (at 434) and bottom (at 322).
    for (let top = 0; top <= 700; top += 7) {
      await scrollPane(pane, top);
      expectBand(pane, ["c0"]);
    }
  });

  it("does not limit the rows to a box around the list that does not clip it", async () => {
    const { pane } = await render(
      <div style={{ height: 40 }}>
        <ConversationList label="Conversations" items={many(500)} onSelect={() => {}} />
      </div>,
    );
    expectBand(pane, []);
  });

  it("renders the first screenful in server HTML and hydrates without a warning", async () => {
    const node = <ConversationList label="Conversations" items={many(500)} onSelect={() => {}} />;
    const host = document.createElement("div");
    host.style.cssText = "width: 360px; height: 400px; overflow-y: auto";
    host.innerHTML = renderToString(node);
    document.body.append(host);
    mounted.push(host);
    // As many rows as the first 1000 pixels hold at their estimated height, before anything is measured.
    expect(host.querySelectorAll('[data-ouro-part="row"]')).toHaveLength(18);
    const error = vi.spyOn(console, "error");
    const recoverable = vi.fn();
    await act(async () => {
      roots.push(hydrateRoot(host, node, { onRecoverableError: recoverable }));
    });
    expect(recoverable).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expectBand(host, []);
  });

  it("moves focus to the last row with End and back with Home, rendering and showing the row it reaches", async () => {
    const { pane, rows } = await render(<ConversationList label="Conversations" items={many(500)} onSelect={() => {}} />);
    await act(async () => rows()[0]!.focus());
    await userEvent.keyboard("{End}");
    expect(titleOf(document.activeElement)).toBe("c499");
    expect(inView(document.activeElement!, pane)).toBe(true);
    expect((document.activeElement as HTMLButtonElement).tabIndex).toBe(0);
    await userEvent.keyboard("{ArrowUp}");
    expect(titleOf(document.activeElement)).toBe("c498");
    await userEvent.keyboard("{Home}");
    expect(titleOf(document.activeElement)).toBe("c0");
    expect(pane.scrollTop).toBe(0);
  });

  it("walks down past the rows first rendered with the Down arrow, scrolling only as far as the row with focus needs", async () => {
    const { pane, rows } = await render(<ConversationList label="Conversations" items={many(80)} onSelect={() => {}} />, 200);
    await act(async () => rows()[0]!.focus());
    for (let index = 1; index <= 30; index++) {
      await userEvent.keyboard("{ArrowDown}");
      expect(titleOf(document.activeElement)).toBe(`c${index}`);
      const box = document.activeElement!.getBoundingClientRect();
      // A row already in view leaves the pane where it was; one below it comes up to the pane's bottom edge.
      if (index < 3) expect(pane.scrollTop).toBe(0);
      else expect(Math.abs(box.bottom - pane.getBoundingClientRect().bottom)).toBeLessThan(1);
    }
    expectBand(pane, ["c0"]);
  });

  it("moves on from a row with focus that the pane scrolled away from, showing the next row at the nearest edge", async () => {
    const { pane, rows } = await render(<ConversationList label="Conversations" items={many(500)} onSelect={() => {}} />);
    // The row is in view. Without preventScroll, WebKit's scroll to it runs on a timer and could bring it back after the scroll below.
    await act(async () => rows()[5]!.focus({ preventScroll: true }));
    await scrollPane(pane, 15000);
    expect(titleOf(document.activeElement)).toBe("c5");
    await userEvent.keyboard("{ArrowDown}");
    expect(titleOf(document.activeElement)).toBe("c6");
    expect(Math.abs(document.activeElement!.getBoundingClientRect().top - pane.getBoundingClientRect().top)).toBeLessThan(1);
  });

  it("scrolls a short list to the row the keyboard reaches as the browser scrolls to anything that takes focus", async () => {
    const { pane, rows } = await render(<ConversationList label="Conversations" items={many(12)} onSelect={() => {}} />, 120);
    // WebKit scrolls to an element that takes focus on a timer, which can fire after the key press or focus() returns.
    const shown = () => inView(document.activeElement!, pane);
    await act(async () => rows()[0]!.focus());
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    await expect.poll(shown).toBe(true);
    const before = pane.scrollTop;
    await userEvent.keyboard("{ArrowDown}");
    expect(titleOf(document.activeElement)).toBe("c4");
    await expect.poll(shown).toBe(true);
    const after = pane.scrollTop;
    expect(after).toBeGreaterThan(before);
    // The same move made by the browser alone: focus from the row before, with the pane where it was.
    await act(async () => rows()[3]!.focus({ preventScroll: true }));
    await scrollPane(pane, before);
    await act(async () => rows()[4]!.focus());
    await expect.poll(() => pane.scrollTop).toBe(after);
  });

  it("is one Tab stop on the open conversation, however far down it is", async () => {
    const { pane } = await render(
      <>
        <button type="button">Before</button>
        <ConversationList label="Conversations" items={many(500)} selectedId="c400" onSelect={() => {}} />
      </>,
    );
    await scrollPane(pane, 0);
    await act(async () => pane.querySelector("button")!.focus());
    await pressTab();
    expect(titleOf(document.activeElement)).toBe("c400");
    // The browser's own scroll to the row Tab reached, which WebKit runs on a timer.
    await expect.poll(() => inView(document.activeElement!, pane)).toBe(true);
  });

  it("renders the open conversation far down the list and scrolls it into view, and again when another opens", async () => {
    const { pane, rerender, ids } = await render(<ConversationList label="Conversations" items={many(500)} selectedId="c420" onSelect={() => {}} />);
    const current = () => pane.querySelector('[aria-current="true"]');
    expect(titleOf(current())).toBe("c420");
    expect(inView(current()!, pane)).toBe(true);
    expect(ids()).not.toContain("c1");
    await rerender(<ConversationList label="Conversations" items={many(500)} selectedId="c10" onSelect={() => {}} />);
    expect(titleOf(current())).toBe("c10");
    expect(inView(current()!, pane)).toBe(true);
  });

  it("brings the open conversation to the middle of the view when it opens out of view, and leaves one that opens in view where it is", async () => {
    const { pane, rerender } = await render(<ConversationList label="Conversations" items={many(500)} selectedId="c420" onSelect={() => {}} />);
    const middle = () => {
      const row = pane.querySelector('[aria-current="true"]')!.getBoundingClientRect();
      const view = pane.getBoundingClientRect();
      return Math.abs((row.top + row.bottom) / 2 - (view.top + view.bottom) / 2);
    };
    expect(middle()).toBeLessThan(1);
    const scrolled = pane.scrollTop;
    await rerender(<ConversationList label="Conversations" items={many(500)} selectedId="c422" onSelect={() => {}} />);
    expect(pane.scrollTop).toBe(scrolled);
    await rerender(<ConversationList label="Conversations" items={many(500)} selectedId="c10" onSelect={() => {}} />);
    expect(middle()).toBeLessThan(1);
  });

  it("leaves the view where it is when a list grows long, or long again after another conversation opened", async () => {
    const { pane, rerender, list } = await render(<ConversationList label="Conversations" items={many(60)} selectedId="c50" onSelect={() => {}} />);
    expect(pane.scrollTop).toBe(0);
    await rerender(<ConversationList label="Conversations" items={many(61)} selectedId="c50" onSelect={() => {}} />);
    expect(list().style.height).not.toBe("");
    expect(pane.scrollTop).toBe(0);
    await rerender(<ConversationList label="Conversations" items={many(60)} selectedId="c55" onSelect={() => {}} />);
    await rerender(<ConversationList label="Conversations" items={many(61)} selectedId="c55" onSelect={() => {}} />);
    expect(pane.scrollTop).toBe(0);
  });

  it("counts a row whose edge meets the view's edge as in view when it opens", async () => {
    const { pane, rows, list, rerender } = await render(<ConversationList label="Conversations" items={many(500)} onSelect={() => {}} />);
    const box = (id: string) => rows().find((row) => titleOf(row) === id)!.getBoundingClientRect();
    // A row in view near the bottom stays where it is.
    await rerender(<ConversationList label="Conversations" items={many(500)} selectedId="c5" onSelect={() => {}} />);
    expect(pane.scrollTop).toBe(0);
    // The pane ends exactly at a row's bottom edge, and then starts exactly at another row's top edge.
    pane.style.height = `${box("c6").bottom - pane.getBoundingClientRect().top}px`;
    await rerender(<ConversationList label="Conversations" items={many(500)} selectedId="c6" onSelect={() => {}} />);
    expect(pane.scrollTop).toBe(0);
    const top = box("c10").top - list().getBoundingClientRect().top;
    await scrollPane(pane, top);
    await rerender(<ConversationList label="Conversations" items={many(500)} selectedId="c10" onSelect={() => {}} />);
    expect(pane.scrollTop).toBe(top);
  });

  it("shows the row with focus at once when Home or End leaves focus where it is, and lets the pane scroll away after", async () => {
    const { pane, rows } = await render(<ConversationList label="Conversations" items={many(500)} onSelect={() => {}} />);
    // In view already; preventScroll leaves no scroll to it on WebKit's timer to undo the scroll below.
    await act(async () => rows()[0]!.focus({ preventScroll: true }));
    await scrollPane(pane, 3000);
    await userEvent.keyboard("{Home}");
    expect(titleOf(document.activeElement)).toBe("c0");
    expect(pane.scrollTop).toBe(0);
    await scrollPane(pane, 3000);
    await act(async () => pane.dispatchEvent(new Event("scroll")));
    expect(pane.scrollTop).toBe(3000);
    await userEvent.keyboard("{End}");
    expect(titleOf(document.activeElement)).toBe("c499");
    await scrollPane(pane, 3000);
    await userEvent.keyboard("{End}");
    expect(inView(document.activeElement!, pane)).toBe(true);
    await scrollPane(pane, 3000);
    await act(async () => pane.dispatchEvent(new Event("scroll")));
    expect(pane.scrollTop).toBe(3000);
  });

  it("keeps the row with focus, and the Tab stop on it, when the window loses focus", async () => {
    const { pane, rows } = await render(<ConversationList label="Conversations" items={many(500)} onSelect={() => {}} />);
    const row = rows()[5]!;
    // In view already; preventScroll leaves no scroll to it on WebKit's timer to undo the scroll below.
    await act(async () => row.focus({ preventScroll: true }));
    // The window losing focus blurs the row while it stays the page's focused element.
    await act(async () => row.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    await scrollPane(pane, 15000);
    expect(row.isConnected).toBe(true);
    expect(document.activeElement).toBe(row);
    expect(row.tabIndex).toBe(0);
  });

  it("keeps the open conversation in view while the rows measured first move the estimate for the rows above it", async () => {
    const items = many(500, (index) => (index < 30 ? { subtitle: "A second line", context: "Mentioned you in a channel" } : {}));
    const { pane } = await render(<ConversationList label="Conversations" items={items} selectedId="c430" onSelect={() => {}} />);
    expect(inView(pane.querySelector('[aria-current="true"]')!, pane)).toBe(true);
  });

  it("lets the pane scroll away from the open conversation once it has shown", async () => {
    const { pane } = await render(<ConversationList label="Conversations" items={many(500)} selectedId="c250" onSelect={() => {}} />);
    expect(pane.scrollTop).toBeGreaterThan(0);
    await scrollPane(pane, 0);
    await act(async () => pane.dispatchEvent(new Event("scroll")));
    expect(pane.scrollTop).toBe(0);
  });

  it("keeps the rows in view in place while rows above them are measured", async () => {
    // The rows seen first are short and the rest taller (a subtitle adds a line), so each tall row measured moves the
    // estimate for the rows above it that are not measured yet.
    const items = many(500, (index) => (index < 30 ? {} : { subtitle: "A second line" }));
    const { pane, rows } = await render(<ConversationList label="Conversations" items={items} onSelect={() => {}} />);
    await scrollPane(pane, 15000);
    const where = () => {
      const row = rows().find((element) => element.getBoundingClientRect().bottom > pane.getBoundingClientRect().top + 1)!;
      return { id: titleOf(row), top: row.getBoundingClientRect().top - pane.getBoundingClientRect().top };
    };
    const before = where();
    const scrolled = pane.scrollTop;
    await scrollPane(pane, scrolled - 500);
    // The list scrolled on by what the rows above grew, so the rows in view did not move.
    expect(pane.scrollTop).toBeGreaterThan(scrolled - 500);
    const row = rows().find((element) => titleOf(element) === before.id)!;
    // Within a pixel: WebKit scrolls to whole pixels.
    expect(Math.abs(row.getBoundingClientRect().top - pane.getBoundingClientRect().top - (before.top + 500))).toBeLessThan(1);
    // Every row rendered after the Tab stop is where its measured neighbours put it: no gap and no overlap.
    const boxes = rows()
      .slice(1)
      .map((element) => element.parentElement!.getBoundingClientRect());
    boxes.slice(1).forEach((box, index) => expect(box.top).toBeCloseTo(boxes[index]!.bottom, 0));
  });

  it("measures compact rows, which are shorter, when the density changes", async () => {
    const { list, rerender } = await render(<ConversationList label="Conversations" items={many(200)} onSelect={() => {}} />);
    const comfortable = list().getBoundingClientRect().height;
    await rerender(<ConversationList label="Conversations" items={many(200)} density="compact" onSelect={() => {}} />);
    expect(list().getBoundingClientRect().height).toBeLessThan(comfortable * 0.8);
    const shown = [...list().querySelectorAll<HTMLElement>('[data-ouro-part="row"]')];
    const step = shown[1]!.getBoundingClientRect().top - shown[0]!.getBoundingClientRect().top;
    expect(list().getBoundingClientRect().height).toBeCloseTo(step * 199 + shown[0]!.offsetHeight, 0);
  });

  it("follows the pane's height when it grows", async () => {
    const { pane } = await render(<ConversationList label="Conversations" items={many(500)} onSelect={() => {}} />, 100);
    pane.style.height = "400px";
    await expect.poll(() => pane.querySelectorAll('[data-ouro-part="row"]').length).toBeGreaterThan(12);
    expectBand(pane, []);
  });

  it("stops following the page once it is gone", async () => {
    const { root } = await render(<ConversationList label="Conversations" items={many(500)} onSelect={() => {}} />);
    const error = vi.fn();
    addEventListener("error", error);
    await act(async () => root.unmount());
    await act(async () => {
      dispatchEvent(new Event("resize"));
      document.dispatchEvent(new Event("scroll"));
    });
    removeEventListener("error", error);
    expect(error).not.toHaveBeenCalled();
  });

  it("renders in a page that scrolls, with no pane around it, and follows the window's height", async () => {
    const host = document.createElement("div");
    host.style.width = "360px";
    document.body.append(host);
    mounted.push(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () => root.render(<ConversationList label="Conversations" items={many(500)} onSelect={() => {}} />));
    const count = () => host.querySelectorAll('[data-ouro-part="row"]').length;
    const tall = count();
    const [width, height] = [innerWidth, innerHeight];
    await page.viewport(width, 300);
    await expect.poll(count).toBeLessThan(tall);
    await page.viewport(width, height);
    await expect.poll(count).toBe(tall);
    const top = host.getBoundingClientRect().top + scrollY;
    await act(async () => {
      window.scrollTo({ top: top + 10000 });
      document.dispatchEvent(new Event("scroll"));
    });
    expect(scrollY).toBeGreaterThan(top + 9000);
    expect([...host.querySelectorAll('[data-ouro-part="row"]')].filter((row) => row.getBoundingClientRect().top >= 0 && row.getBoundingClientRect().bottom <= innerHeight).length).toBeGreaterThan(5);
    await act(async () => window.scrollTo({ top: 0 }));
  });
});

describe("ConversationList windowing with sections", () => {
  const sections: ConversationListSection[] = [
    { id: "a", title: "First" },
    { id: "b", title: "Second" },
    { id: "c", title: "Third" },
  ];
  const items = many(600, (index) => ({ section: ["a", "b", "c"][Math.floor(index / 200)] }));
  const headers = (pane: HTMLElement) => [...pane.querySelectorAll<HTMLButtonElement>('[data-ouro-part="section"]')].map(titleOf);

  it("keeps rows under their headers in order, and closes and opens a section", async () => {
    const { pane, ids, list } = await render(<ConversationList label="Chats" items={items} sections={[sections[0]!, sections[1]!, { ...sections[2]!, defaultOpen: false }]} onSelect={() => {}} />);
    // Only the sections with a control near the view render, closed or open.
    expect(headers(pane)).toEqual(["First"]);
    expect(pane.querySelectorAll("li[data-ouro-conversation-section]")).toHaveLength(1);
    expect(ids()[0]).toBe("c0");
    const first = pane.querySelector<HTMLButtonElement>('[data-ouro-part="section"]')!;
    expect(first.closest("li")!.getAttribute("aria-setsize")).toBe("3");
    const group = document.getElementById(first.getAttribute("aria-controls")!)!;
    expect(group.getAttribute("aria-label")).toBe("First");
    expect([...group.childNodes].every((node) => node.nodeName === "LI")).toBe(true);
    const open = list().getBoundingClientRect().height;
    await userEvent.click(first);
    expect(first.getAttribute("aria-expanded")).toBe("false");
    // Closed, the first section's rows go and the next section comes up under it.
    expect(headers(pane)).toEqual(["First", "Second"]);
    expect(pane.querySelectorAll("li[data-ouro-conversation-section]")).toHaveLength(2);
    expect(ids()[0]).toBe("c200");
    expect(list().getBoundingClientRect().height).toBeLessThan(open * 0.75);
    await userEvent.click(first);
    expect(ids()[0]).toBe("c0");
    expect(headers(pane)).toEqual(["First"]);
  });

  it("spaces rows and headers as a short list does", async () => {
    const gaps = (pane: HTMLElement) => {
      const controls = [...pane.querySelectorAll('[data-ouro-control="conversation-list"]')].slice(0, 6).map((control) => control.getBoundingClientRect());
      const list = pane.querySelector("ul")!.getBoundingClientRect();
      return [controls[0]!.top - list.top, ...controls.slice(1).map((box, index) => Math.round((box.top - controls[index]!.bottom) * 100) / 100)];
    };
    const few = [...many(2), ...many(2, () => ({ section: "a" })).map((item, index) => ({ ...item, id: `a${index}` })), ...many(2, () => ({ section: "b" })).map((item, index) => ({ ...item, id: `b${index}` }))];
    const short = await render(<ConversationList label="Chats" items={few} sections={sections} onSelect={() => {}} />);
    const fill = many(100, () => ({ section: "c" })).map((item, index) => ({ ...item, id: `f${index}` }));
    const long = await render(<ConversationList label="Chats" items={[...few, ...fill]} sections={sections} onSelect={() => {}} />);
    expect(long.list().style.height).not.toBe("");
    expect(gaps(long.pane)).toEqual(gaps(short.pane));
  });

  it("estimates the rows and headers it has not measured from those it has, so the list's height holds as it scrolls", async () => {
    const many_sections = Array.from({ length: 30 }, (_, index) => ({ id: `s${index}`, title: `Section ${index}` }));
    const rows = many(120, (index) => ({ section: `s${Math.floor(index / 4)}` }));
    const { pane, list } = await render(<ConversationList label="Chats" items={rows} sections={many_sections} onSelect={() => {}} />);
    const height = list().getBoundingClientRect().height;
    for (let top = 0; top < height; top += 300) await scrollPane(pane, top);
    expect(list().getBoundingClientRect().height).toBeCloseTo(height, 0);
  });

  it("moves from a section's last row to the next header with the Down arrow, and reaches the last row with End", async () => {
    const { pane } = await render(<ConversationList label="Chats" items={items} sections={sections} selectedId="c199" onSelect={() => {}} />);
    await act(async () => pane.querySelector<HTMLButtonElement>('[aria-current="true"]')!.focus());
    await userEvent.keyboard("{ArrowDown}");
    expect(titleOf(document.activeElement)).toBe("Second");
    expect(inView(document.activeElement!, pane)).toBe(true);
    await userEvent.keyboard("{End}");
    expect(titleOf(document.activeElement)).toBe("c599");
    expect(inView(document.activeElement!, pane)).toBe(true);
    // A row in a section knows its place in that section.
    expect(document.activeElement!.parentElement!.getAttribute("aria-posinset")).toBe("200");
    expect(document.activeElement!.parentElement!.getAttribute("aria-setsize")).toBe("200");
    expect(document.activeElement!.closest("li[data-ouro-conversation-section]")!.getAttribute("aria-posinset")).toBe("3");
  });
});
