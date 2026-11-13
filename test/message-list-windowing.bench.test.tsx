import { createRoot, type Root } from "react-dom/client";
import { type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { server } from "vitest/browser";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// What windowing saves MessageList in a long conversation: 2,000 messages drawn whole (windowing={false}, as every
// MessageList was before) and windowed. Each arm reports how many messages and elements are in the page, how long the
// first draw takes (render to the frame after), how long the app drawing the list again takes (as when someone types in
// the composer), and the longest frame while a page of 100 older messages goes in above a reader scrolled up (the middle of three
// such pages in turn).
//
// Timings are this runner's, with React's development build, not a person's device or an app's production build: they
// vary from run to run, so the test holds windowed to a share of whole rather than to a number, and reports the numbers
// as annotations (on GitHub, as notices on the run).

const COUNT = 2000;
const PAGE = 100;
/** How many pages of older messages go in, one after another, for the middle of their longest frames. */
const PREPENDS = 3;
const roots: Root[] = [];
let mounted: Element[] = [];

afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
});

const frame = () => new Promise<number>((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

/** A conversation's worth of messages: a few lengths, both sides, with a quote now and then. */
function Chat({ from, count, windowing }: { from: number; count: number; windowing: boolean }) {
  return (
    <MessageList label="Conversation" style={{ height: 700, width: 420 }} windowing={windowing}>
      {Array.from({ length: count }, (_, offset) => {
        const id = from + offset;
        const lines = ((id % 4) + 4) % 4;
        return (
          <Message
            key={id}
            id={`m${id}`}
            role={id % 3 === 0 ? "user" : "assistant"}
            name={id % 3 === 0 ? "Ana" : "Ouro"}
            quote={id % 17 === 0 ? { author: "Ana", excerpt: `Message ${id - 3}` } : undefined}
          >
            {`Message ${id}.${" A few more words, as people write.".repeat(lines * 3)}`}
          </Message>
        );
      })}
    </MessageList>
  );
}

/** The longest frame, in milliseconds, from now until `done` settles and the frames after it run steadily. */
async function longestFrame(work: () => Promise<void>): Promise<number> {
  let longest = 0;
  let last = performance.now();
  let watching = true;
  const tick = (now: number) => {
    longest = Math.max(longest, now - last);
    last = now;
    if (watching) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  await work();
  for (let wait = 0; wait < 10; wait++) await frame();
  watching = false;
  return longest;
}

interface Numbers {
  messages: number;
  elements: number;
  firstDraw: number;
  redraw: number;
  prependFrame: number;
}

async function measure(windowing: boolean): Promise<Numbers> {
  const host = document.createElement("div");
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  const start = performance.now();
  await act(async () => root.render(<Chat from={0} count={COUNT} windowing={windowing} />));
  await frame();
  const firstDraw = performance.now() - start;
  for (let wait = 0; wait < 5; wait++) await frame();
  const list = host.querySelector<HTMLElement>('[data-ouro="message-list"]')!;
  const messages = list.querySelectorAll('[data-ouro="message"]').length;
  const elements = list.querySelectorAll("*").length;
  // The app draws again with the same messages.
  const redrawStart = performance.now();
  await act(async () => root.render(<Chat from={0} count={COUNT} windowing={windowing} />));
  const redraw = performance.now() - redrawStart;
  // Up the conversation, a page of older messages loads above.
  const scroller = list.querySelector<HTMLElement>("[data-ouro-message-list-scroller]")!;
  await act(async () => void (scroller.scrollTop = scroller.scrollHeight / 2));
  for (let wait = 0; wait < 5; wait++) await frame();
  // Three pages in turn, and the middle of their longest frames: one frame is one sample of a shared runner, which a slow
  // moment can double.
  const prependFrames: number[] = [];
  for (let page = 1; page <= PREPENDS; page++) {
    prependFrames.push(await longestFrame(() => act(async () => root.render(<Chat from={-PAGE * page} count={COUNT + PAGE * page} windowing={windowing} />))));
  }
  const prependFrame = prependFrames.sort((a, b) => a - b)[Math.floor(PREPENDS / 2)]!;
  await act(async () => root.unmount());
  roots.splice(roots.indexOf(root), 1);
  return { messages, elements, firstDraw, redraw, prependFrame };
}

const round = (value: number) => Math.round(value);
const report = (name: string, numbers: Numbers) =>
  `${name}: ${numbers.messages} messages and ${numbers.elements} elements in the page; first draw ${round(numbers.firstDraw)} ms; redraw ${round(numbers.redraw)} ms; longest frame as a page of ${PAGE} older messages goes in ${round(numbers.prependFrame)} ms (the middle of ${PREPENDS}) (this runner and React's development build, not a person's device)`;

// One browser and a fine pointer: the timings compare like with like, and the touch project would only repeat them. Drawing
// 2000 messages whole, more than once, takes longer than a test's usual 15 seconds on a slow runner.
describe("MessageList windowing benchmark", () => {
  it.runIf(server.browser === "chromium" && matchMedia("(pointer: fine)").matches)("draws a conversation of 2000 messages in a fraction of the elements and time it takes drawn whole", { timeout: 60_000 }, async ({ annotate }) => {
    const whole = await measure(false);
    const windowed = await measure(true);
    await annotate(report("whole (windowing={false})", whole), "benchmark");
    await annotate(report("windowed", windowed), "benchmark");
    expect(whole.messages).toBe(COUNT);
    expect(windowed.messages).toBeLessThan(60);
    expect(windowed.elements).toBeLessThan(whole.elements / 20);
    expect(windowed.firstDraw).toBeLessThan(whole.firstDraw / 2);
    expect(windowed.redraw).toBeLessThan(whole.redraw / 2);
    expect(windowed.prependFrame).toBeLessThan(whole.prependFrame / 2);
  });
});

/** How many times each row component rendered, by key, in the commits since it was last cleared. */
const renders = new Map<number, number>();

function Row({ id }: { id: number }) {
  renders.set(id, (renders.get(id) ?? 0) + 1);
  return (
    <Message id={`r${id}`} role={id % 2 ? "assistant" : "user"} name={id % 2 ? "Ouro" : "Ana"}>
      {`Row ${id}.${" A few more words, as people write.".repeat(((id % 4) + 4) % 4 * 3)}`}
    </Message>
  );
}

function Flat({ from, count }: { from: number; count: number }) {
  const rows: ReactNode[] = Array.from({ length: count }, (_, offset) => <Row key={from + offset} id={from + offset} />);
  return (
    <MessageList label="Conversation" style={{ height: 700, width: 420 }}>
      {rows}
    </MessageList>
  );
}

describe("MessageList older page", () => {
  it("lands a page of 200 older rows above a scrolled-up reader as space, drawing and rendering only the band in that commit", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    mounted.push(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () => root.render(<Flat from={0} count={500} />));
    for (let wait = 0; wait < 5; wait++) await frame();
    const scroller = host.querySelector<HTMLElement>("[data-ouro-message-list-scroller]")!;
    await act(async () => void (scroller.scrollTop = scroller.scrollHeight / 2));
    for (let wait = 0; wait < 8; wait++) await frame();
    const band = host.querySelectorAll("[data-ouro-message-list-slot]").length;
    renders.clear();
    await act(async () => root.render(<Flat from={-200} count={700} />));
    const slots = host.querySelectorAll("[data-ouro-message-list-slot]").length;
    expect(slots).toBeLessThanOrEqual(band + 2);
    expect(renders.size).toBeLessThanOrEqual(band + 2);
    expect([...renders.keys()].some((id) => id < 0)).toBe(false);
  });

  it("renders about a fifth of the rows, not the list again, when a short list the reader scrolled up in takes 200 older rows and 360 newer in one commit", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    mounted.push(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () => root.render(<Flat from={0} count={40} />));
    for (let wait = 0; wait < 5; wait++) await frame();
    const scroller = host.querySelector<HTMLElement>("[data-ouro-message-list-scroller]")!;
    await act(async () => void (scroller.scrollTop = 200));
    for (let wait = 0; wait < 5; wait++) await frame();
    renders.clear();
    await act(async () => root.render(<Flat from={-200} count={600} />));
    expect(host.querySelectorAll("[data-ouro-message-list-slot]").length).toBeLessThanOrEqual(81);
    // Those, and the band the window then finds for the view: a fifth of the 560 rows the list would draw whole.
    expect(renders.size).toBeLessThanOrEqual(120);
  });
});
