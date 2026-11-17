import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { commands, server } from "vitest/browser";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Layout-shift and long-task entries are Chromium's; the other browsers have no such measure.
const chromiumOnly = it.skipIf(server.browser !== "chromium");

/** The tolerance for where a message sits, in pixels: a sub-pixel rounding, as the windowing tests allow. */
const ROUNDING = 2;
/** A task longer than this blocks input for a person; the browser reports only tasks past it, as long tasks. */
const LONG_TASK_MS = 50;
const PAGES = 3;
const PAGE = 200;

const roots: Root[] = [];
let mounted: Element[] = [];

afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
});

interface Item {
  id: number;
  role: "user" | "assistant";
  text: string;
}

const history = (count: number, from = 0): Item[] =>
  Array.from({ length: count }, (_, offset) => ({
    id: from + offset,
    role: (from + offset) % 2 ? "assistant" : "user",
    text: `Message ${from + offset}: ${"step ".repeat(12)}`,
  }));

function Chat({ items, loadingOlder, windowing }: { items: Item[]; loadingOlder?: boolean | undefined; windowing?: boolean | undefined }) {
  return (
    <MessageList label="Conversation" style={{ height: 300, marginTop: 120 }} hasOlder loadingOlder={loadingOlder} windowing={windowing}>
      {items.map((item) => (
        <Message key={item.id} id={`older-${item.id}`} role={item.role} name={item.role === "user" ? "Ana" : "Ouro"}>
          {item.text}
        </Message>
      ))}
    </MessageList>
  );
}

/** The first message whose top is inside the list's view, and where that top is. */
function firstVisible(scroller: HTMLElement): { message: Element; top: number } {
  const viewTop = scroller.getBoundingClientRect().top;
  const message = [...scroller.querySelectorAll('[data-ouro="message"]')].find((node) => node.getBoundingClientRect().top >= viewTop)!;
  return { message, top: message.getBoundingClientRect().top };
}

const frames = async (count: number) => {
  for (let frame = 0; frame < count; frame++) await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
};

/** Waits until the scroll position reads the same across two frames, and no message springs. */
async function settle(scroller: HTMLElement) {
  let last = -1;
  await expect.poll(async () => {
    await frames(1);
    const same = scroller.scrollTop === last;
    last = scroller.scrollTop;
    return same;
  }).toBe(true);
  await expect.poll(() => scroller.querySelector("[data-ouro-settling]")).toBeNull();
}

/** Runs `body` with the page's motion preference set, then puts back the one it found. */
async function atMotion<T>(reduced: boolean, body: () => Promise<T>): Promise<T> {
  const before = await commands.mediaState();
  try {
    if (reduced) await commands.emulateMedia({ reducedMotion: "reduce" });
    return await body();
  } finally {
    await commands.restoreMedia(before);
  }
}

interface Page {
  /** The layout shift of the page, where the browser measures it: shifts a person's input caused are left out. */
  shift: number;
  /** How far the reader's message moved in the furthest frame, or after the page, in pixels. */
  moved: number;
  /** Each task the browser reports as long during the page, in milliseconds. */
  longTasks: number[];
}

/**
 * Pages of 200 older messages (three, by default), each going in above a reader scrolled up, after the one before it has
 * settled. Each page first shows "Loading older messages" (`loadingOlder`), as an app does while it fetches, then the messages come.
 */
async function prependPages(windowing?: boolean, count = PAGES): Promise<Page[]> {
  const host = document.createElement("div");
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  let items = history(PAGE);
  await act(async () => root.render(<Chat items={items} windowing={windowing} />));
  const scroller = host.querySelector<HTMLElement>("[data-ouro-message-list-scroller]")!;
  await settle(scroller);
  scroller.scrollTop = 3000;
  await settle(scroller);
  const pages: Page[] = [];
  for (let page = 1; page <= count; page++) {
    const reading = firstVisible(scroller);
    const shifts: { value: number; recent: boolean }[] = [];
    const layout = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) shifts.push({ value: entry.value, recent: entry.hadRecentInput });
    });
    layout.observe({ type: "layout-shift" });
    const longTasks: number[] = [];
    const long = new PerformanceObserver((list) => list.getEntries().forEach((entry) => longTasks.push(entry.duration)));
    long.observe({ type: "longtask" });
    let moved = 0;
    let watching = true;
    const watch = () => {
      moved = Math.max(moved, Math.abs(reading.message.getBoundingClientRect().top - reading.top));
      if (watching) requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
    await act(async () => root.render(<Chat items={items} loadingOlder windowing={windowing} />));
    await frames(5);
    items = [...history(PAGE, -PAGE * page), ...items];
    await act(async () => root.render(<Chat items={items} windowing={windowing} />));
    // A list that draws every message puts the page in a few at a time, so it is done when all of them are in the page.
    if (windowing === false) {
      await expect.poll(() => scroller.querySelectorAll('[data-ouro="message"]').length).toBe(PAGE * (page + 1));
    }
    await settle(scroller);
    await frames(2);
    watching = false;
    for (const record of layout.takeRecords() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) shifts.push({ value: record.value, recent: record.hadRecentInput });
    layout.disconnect();
    long.disconnect();
    moved = Math.max(moved, Math.abs(reading.message.getBoundingClientRect().top - reading.top));
    pages.push({
      shift: shifts.filter((shift) => !shift.recent).reduce((sum, shift) => sum + shift.value, 0),
      moved,
      longTasks,
    });
  }
  return pages;
}

describe("MessageList prepending older history", () => {
  for (const reduced of [false, true]) {
    const motion = reduced ? "reduced motion" : "full motion";
    chromiumOnly(`keeps layout still as three pages of older messages go in above a scrolled-up reader, with no layout shift, at ${motion}`, async () => {
      const pages = await atMotion(reduced, () => prependPages());
      expect(pages.reduce((sum, page) => sum + page.shift, 0)).toBeLessThan(0.01);
      for (const page of pages) expect(page.moved).toBeLessThanOrEqual(ROUNDING);
    });

    chromiumOnly(`spends no task over ${LONG_TASK_MS} ms on a page of ${PAGE} older messages, at ${motion}`, async () => {
      const pages = await atMotion(reduced, () => prependPages());
      // Only tasks past the threshold are reported, so a long task is one that is reported at all.
      pages.forEach((page, index) => expect(page.longTasks, `page ${index + 1}`).toEqual([]));
    });
  }

  chromiumOnly(`keeps layout still as three pages of older messages go in above a scrolled-up reader, with no layout shift, when every message is drawn`, async () => {
    const pages = await prependPages(false);
    expect(pages.reduce((sum, page) => sum + page.shift, 0)).toBeLessThan(0.01);
    for (const page of pages) expect(page.moved).toBeLessThanOrEqual(ROUNDING);
  });

  chromiumOnly(`spends no task over ${LONG_TASK_MS} ms on a page of ${PAGE} older messages, when every message is drawn`, async () => {
    // One page: a list that draws every message gets more costly with each page, which the windowed list does not.
    const [page] = await prependPages(false, 1);
    expect(page!.longTasks).toEqual([]);
  });
});
