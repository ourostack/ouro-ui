import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { server, userEvent } from "vitest/browser";
import { Lightbox } from "@/registry/ouro/components/ouro/lightbox/lightbox";
import { Attachment } from "@/registry/ouro/components/ouro/message/attachment";
import { Message, type MessageAction } from "@/registry/ouro/components/ouro/message/message";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";
import { ReactionBar } from "@/registry/ouro/components/ouro/reaction-bar/reaction-bar";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// What switching between two long conversations costs, as an app's conversation pane does it (MessageList keyed by the
// conversation): recorded in each run's notes (a GitHub notice on CI), so a change in the cost shows beside the change.
// It holds only what any version must: the switch lands at the newest message with every message in.

const COUNT = 1200;
const SWITCHES = 4;
const picture = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"><rect width="120" height="80" fill="#9cc"/></svg>')}`;
const actions: readonly MessageAction[] = [{ key: "like", label: "Like", icon: "👍", onClick: () => {} }];

function Conversation({ name }: { name: string }) {
  return (
    <MessageList key={name} label={`Chat with ${name}`} style={{ height: 600 }}>
      {Array.from({ length: COUNT }, (_, index) => (
        <Message
          key={`${name}-${index}`}
          variant="chat"
          role={index % 3 === 1 ? "user" : "assistant"}
          name={index % 3 === 1 ? "Ana" : name}
          actions={actions}
          attachments={
            index % 7 === 3 ? (
              <Lightbox label={`Photo from ${name}`} layout="mosaic" images={[{ src: picture, alt: "A photo", width: 1200, height: 800 }]} />
            ) : index % 11 === 5 ? (
              <Attachment name="plan.pdf" size={48_200} contentType="application/pdf" href={`#${name}-${index}`} />
            ) : undefined
          }
          footer={index % 4 === 2 ? <ReactionBar reactions={[{ key: "like", label: "Like", emoji: "👍", count: 2 }]} onReact={() => {}} /> : undefined}
        >
          {`${name}, message ${index}: ${"the dough rests an hour, covered, somewhere warm. ".repeat(1 + (index % 3))}`}
        </Message>
      ))}
    </MessageList>
  );
}

let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
});

const painted = () => new Promise<number>((resolve) => requestAnimationFrame(() => setTimeout(() => resolve(performance.now()))));
const median = (values: number[]) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)]!;

it("switches between two conversations of 1,200 messages with pictures, files, reactions and action bars, and records what it costs", { timeout: 120_000 }, async ({ annotate }) => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const scroller = () => host!.querySelector<HTMLElement>("[data-ouro-message-list-scroller]")!;
  const messages = () => scroller().querySelectorAll('[data-ouro="message"]');
  const newestGap = () => scroller().getBoundingClientRect().bottom - messages()[messages().length - 1]!.getBoundingClientRect().bottom;
  // Windowed, the list draws only the messages near its view: it is in once the newest is drawn, at its end.
  const allIn = () => messages()[messages().length - 1]?.getAttribute("aria-setsize") === String(COUNT);
  // A first conversation, every message in and the action bar's code loaded, as after the app has run a while.
  await act(async () => root!.render(<Conversation name="Mara" />));
  await expect.poll(allIn, { timeout: 60_000 }).toBe(true);
  // A list draws one action bar, on the message the pointer is over: hovering one loads its code, and leaving takes it away.
  const text = () => scroller().querySelector("[data-ouro-message-content]")!;
  await expect.poll(async () => (await userEvent.hover(text()), host!.querySelector('[role="toolbar"]'))).not.toBeNull();
  await userEvent.unhover(text());
  await expect.poll(() => host!.querySelector('[role="toolbar"]')).toBeNull();

  const runs: { commit: number; firstFrame: number; allIn: number; longestFrame: number; reads: number; jumps: number; blank: number }[] = [];
  for (let at = 0; at < SWITCHES; at++) {
    const name = at % 2 ? "Mara" : "Theo";
    await painted();
    const reads = { count: 0 };
    const read = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      reads.count++;
      return read.call(this);
    };
    const start = performance.now();
    flushSync(() => root!.render(<Conversation name={name} />));
    const commit = performance.now() - start;
    let last = await painted();
    Element.prototype.getBoundingClientRect = read;
    const firstFrame = last - start;
    const gap = newestGap();
    const atEnd = scroller().scrollHeight - scroller().clientHeight - scroller().scrollTop <= 2;
    let longestFrame = firstFrame;
    let jumps = atEnd ? 0 : 1;
    let blank = messages().length === 0 ? 1 : 0;
    // Ten frames after the first: what a switch costs past it, and whether anything moves.
    for (let more = 0; more < 10; more++) {
      const now = await painted();
      longestFrame = Math.max(longestFrame, now - last);
      last = now;
      if (Math.abs(newestGap() - gap) > 1) jumps++;
      if (messages().length === 0) blank++;
    }
    runs.push({ commit, firstFrame, allIn: last - start, longestFrame, reads: reads.count, jumps, blank });
    expect(allIn()).toBe(true);
    expect(scroller().scrollHeight - scroller().clientHeight - scroller().scrollTop).toBeLessThanOrEqual(2);
  }
  const of = (key: keyof (typeof runs)[number]) => Math.round(median(runs.map((run) => run[key])));
  await annotate(
    `${server.browser}, switch to ${COUNT} messages, median of ${SWITCHES}: first frame ${of("firstFrame")} ms (commit ${of("commit")} ms), ` +
      `ten frames on ${of("allIn")} ms, longest frame ${of("longestFrame")} ms, boxes read before the first frame ${of("reads")}, ` +
      `jumps ${runs.reduce((sum, run) => sum + run.jumps, 0)}, blank frames ${runs.reduce((sum, run) => sum + run.blank, 0)}`,
  );
});
