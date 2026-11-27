import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  vi.useRealTimers();
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
    /** Makes the first messages, far above the view, longer: the list holds the reader's place by writing its scroll position. */
    grow: () => {
      items = items.map((item, index) => (index < 5 ? { ...item, text: `${item.text} ${"more ".repeat(60)}` } : item));
      return draw();
    },
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

  /** Grows the messages above a scrolled-up reader, and returns the scroll position the list wrote to hold their place. */
  async function held() {
    const list = await mountScrolledUp(false);
    const before = list.scroller.scrollTop;
    // The scroll event of the list's own write, at once: a poll could take past the time a stray is put back in on a slow runner.
    const scrolled = new Promise((resolve) => list.scroller.addEventListener("scroll", resolve, { once: true }));
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    await list.grow();
    await scrolled;
    expect(list.scroller.scrollTop).not.toBe(before);
    return { ...list, at: list.scroller.scrollTop };
  }

  it("puts back a scroll of a few pixels at rest that neither the reader nor the list made, just after the list held the reader's place", async () => {
    // The stray comes after the scroll event the list's own write brings, in the frame after it.
    const { scroller, at } = await held();
    const reading = firstVisible(scroller);
    Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop")!.set!.call(scroller, at - 4);
    await act(() => scroller.dispatchEvent(new Event("scroll")));
    expect(scroller.scrollTop).toBe(at);
    expect(Math.abs(firstVisible(scroller).top - reading.top)).toBeLessThanOrEqual(2);
  });

  const inputs: [string, (scroller: HTMLElement) => void][] = [
    // A press on a message whose own handler stops it still counts: the list hears it on the way down.
    ["a press", (scroller) => {
      const message = firstVisible(scroller).message as HTMLElement;
      message.addEventListener("pointerdown", (event) => event.stopPropagation(), { once: true });
      message.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    }],
    ["a key", (scroller) => scroller.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }))],
    ["focus moving", (scroller) => scroller.dispatchEvent(new FocusEvent("focusin", { bubbles: true }))],
    // The touch event the list reads, in any browser (WebKit on a desktop makes no TouchEvent).
    ["a touch", (scroller) => scroller.dispatchEvent(Object.assign(new Event("touchstart", { bubbles: true }), { touches: [{ clientY: 100 }] }))],
  ];
  for (const [name, input] of inputs) {
    it(`keeps a scroll of a few pixels that comes after ${name}`, async () => {
      const { scroller, at } = await held();
      input(scroller);
      Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop")!.set!.call(scroller, at - 2);
      await act(() => scroller.dispatchEvent(new Event("scroll")));
      expect(scroller.scrollTop).toBe(at - 2);
    });
  }

  it("keeps a scroll of a few pixels frames after the list's own write, or after a larger move", async () => {
    const later = await held();
    vi.useRealTimers();
    await frames(2);
    later.scroller.scrollTop = later.at - 2;
    await frames(2);
    expect(later.scroller.scrollTop).toBe(later.at - 2);
    const moved = await held();
    vi.useRealTimers();
    const scrolled = new Promise((resolve) => moved.scroller.addEventListener("scroll", resolve, { once: true }));
    moved.scroller.scrollTop = moved.at - 10;
    await scrolled;
    moved.scroller.scrollTop = moved.at - 2;
    await frames(2);
    expect(moved.scroller.scrollTop).toBe(moved.at - 2);
  });

  // A find's smooth scroll to its match in a tall message began just after the list held the reader's place: its first frames
  // move a pixel or two, and putting one back would stop the scroll short of the match (ourostack/ouro-ui#3042).
  for (const name of ["scrollTo", "scrollBy"] as const) {
    it(`lets a smooth ${name} code asks for just after the list held the reader's place go all the way`, async () => {
      const { scroller, at } = await held();
      vi.useRealTimers();
      if (name === "scrollTo") scroller.scrollTo({ top: at - 400, behavior: "smooth" });
      else scroller.scrollBy({ top: -400, behavior: "smooth" });
      await expect.poll(() => scroller.scrollTop).toBe(at - 400);
    });
  }

  chromiumOnly(`keeps layout still as three pages of older messages go in above a scrolled-up reader, with no layout shift, when every message is drawn`, async () => {
    const pages = await prependPages(false);
    expect(pages.reduce((sum, page) => sum + page.shift, 0)).toBeLessThan(0.01);
    for (const page of pages) expect(page.moved).toBeLessThanOrEqual(ROUNDING);
  });
});
