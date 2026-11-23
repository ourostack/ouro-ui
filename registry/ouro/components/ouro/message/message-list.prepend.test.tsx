import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { commands, server } from "vitest/browser";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";
import { OLDER_CHUNK } from "@/registry/ouro/components/ouro/message/message-list-styles";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Layout-shift entries are Chromium's; the other browsers have no such measure.
const chromiumOnly = it.skipIf(server.browser !== "chromium");

/** The tolerance for where a message sits, in pixels: a sub-pixel rounding, as the windowing tests allow. */
const ROUNDING = 2;
// A page needs enough messages to span several OLDER_CHUNK-sized frames of chunked insertion and
// to clear WINDOW_ABOVE for the windowed cases; three chunks of OLDER_CHUNK (20) does both at a
// fraction of the DOM size and poll time a much larger page costs, without losing either proof.
const PAGE = 60;
const PAGES = 3;
const MESSAGE = '[data-ouro="message"]';

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
  const message = [...scroller.querySelectorAll(MESSAGE)].find((node) => node.getBoundingClientRect().top >= viewTop)!;
  return { message, top: message.getBoundingClientRect().top };
}

const drawn = (scroller: HTMLElement) => scroller.querySelectorAll(MESSAGE).length;

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

/**
 * Mounts a list of PAGE messages, scrolled up to the middle, as a reader who has scrolled up sees it. Returns its scroller,
 * and what an app does to it: starts loading older messages (`startLoading`, which shows "Loading older messages"), then
 * prepends a page (`prepend`, with `page` counting from 1).
 */
async function mountScrolledUp(windowing?: boolean) {
  const host = document.createElement("div");
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  let items = history(PAGE);
  const draw = (loadingOlder?: boolean) => act(async () => root.render(<Chat items={items} loadingOlder={loadingOlder} windowing={windowing} />));
  await draw();
  const scroller = host.querySelector<HTMLElement>("[data-ouro-message-list-scroller]")!;
  await settle(scroller);
  scroller.scrollTop = 3000;
  await settle(scroller);
  return {
    scroller,
    startLoading: () => draw(true),
    prepend: (page: number) => {
      items = [...history(PAGE, -PAGE * page), ...items];
      return draw();
    },
  };
}

interface Shifts {
  /** The layout shift of the pages, where the browser measures it, leaving out shifts a person's input caused. */
  shift: number;
  /** How far the reader's message moved in the furthest frame, in pixels. */
  moved: number;
}

/** Each of PAGES pages of older messages going in above a reader scrolled up, after the one before it has settled. */
async function prependPages(windowing?: boolean): Promise<Shifts[]> {
  const { scroller, startLoading, prepend } = await mountScrolledUp(windowing);
  const pages: Shifts[] = [];
  for (let page = 1; page <= PAGES; page++) {
    const reading = firstVisible(scroller);
    const shifts: { value: number; recent: boolean }[] = [];
    const layout = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) shifts.push({ value: entry.value, recent: entry.hadRecentInput });
    });
    layout.observe({ type: "layout-shift" });
    let moved = 0;
    let watching = true;
    const watch = () => {
      moved = Math.max(moved, Math.abs(reading.message.getBoundingClientRect().top - reading.top));
      if (watching) requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
    await startLoading();
    await frames(5);
    await prepend(page);
    // A list that draws every message puts the page in a few at a time, so it is done once all of them are in.
    if (windowing === false) await expect.poll(() => drawn(scroller)).toBe(PAGE * (page + 1));
    await settle(scroller);
    await frames(2);
    watching = false;
    for (const record of layout.takeRecords() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) shifts.push({ value: record.value, recent: record.hadRecentInput });
    layout.disconnect();
    moved = Math.max(moved, Math.abs(reading.message.getBoundingClientRect().top - reading.top));
    pages.push({ shift: shifts.filter((shift) => !shift.recent).reduce((sum, shift) => sum + shift.value, 0), moved });
  }
  return pages;
}

/**
 * The messages added to the list in each animation frame while one page of PAGE older messages goes in above a reader
 * scrolled up: from the frame its loading starts to the frame the page settles.
 */
async function messagesAddedPerFrame(windowing?: boolean): Promise<number[]> {
  const { scroller, startLoading, prepend } = await mountScrolledUp(windowing);
  // A message added counts once, whatever it is wrapped in.
  const messagesIn = (node: Node) => (node instanceof Element ? Number(node.matches(MESSAGE)) + node.querySelectorAll(MESSAGE).length : 0);
  let added = 0;
  const collect = (records: MutationRecord[]) => {
    for (const record of records) for (const node of record.addedNodes) added += messagesIn(node);
  };
  const observer = new MutationObserver(collect);
  observer.observe(scroller, { childList: true, subtree: true });
  // Each frame takes what was added since the last one.
  const perFrame: number[] = [];
  let watching = true;
  const tick = () => {
    perFrame.push(added);
    added = 0;
    if (watching) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  await startLoading();
  await frames(5);
  await prepend(1);
  if (windowing === false) await expect.poll(() => drawn(scroller)).toBe(2 * PAGE);
  await settle(scroller);
  await frames(2);
  watching = false;
  collect(observer.takeRecords());
  observer.disconnect();
  perFrame.push(added);
  return perFrame;
}

describe("MessageList prepending older history", () => {
  for (const reduced of [false, true]) {
    const motion = reduced ? "reduced motion" : "full motion";
    chromiumOnly(`keeps layout still as three pages of older messages go in above a scrolled-up reader, with no layout shift, at ${motion}`, async () => {
      const pages = await atMotion(reduced, () => prependPages());
      expect(pages.reduce((sum, page) => sum + page.shift, 0)).toBeLessThan(0.01);
      for (const page of pages) expect(page.moved).toBeLessThanOrEqual(ROUNDING);
    });

    it(`adds no more than ${OLDER_CHUNK} messages in any frame while a page of ${PAGE} older messages goes in above a windowed list, at ${motion}`, async () => {
      const added = await atMotion(reduced, () => messagesAddedPerFrame());
      expect(Math.max(...added)).toBeLessThanOrEqual(OLDER_CHUNK);
    });

    it(`puts a page of ${PAGE} older messages in over several frames, no more than ${OLDER_CHUNK} in any one, above a list that draws every message, at ${motion}`, async () => {
      const added = await atMotion(reduced, () => messagesAddedPerFrame(false));
      expect(Math.max(...added)).toBeLessThanOrEqual(OLDER_CHUNK);
      expect(added.filter((count) => count > 0).length).toBeGreaterThan(1);
      expect(added.reduce((sum, count) => sum + count, 0)).toBe(PAGE);
    });
  }

  chromiumOnly(`keeps layout still as three pages of older messages go in above a scrolled-up reader, with no layout shift, when every message is drawn`, async () => {
    const pages = await prependPages(false);
    expect(pages.reduce((sum, page) => sum + page.shift, 0)).toBeLessThan(0.01);
    for (const page of pages) expect(page.moved).toBeLessThanOrEqual(ROUNDING);
  });
});
