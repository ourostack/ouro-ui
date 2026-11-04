import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// WebKit on macOS lays out every item of a flex column again when one of them changes. With rows that cost a lot to lay
// out, such as a picture sized by percentages in a grid of a fixed shape, a long conversation then stalls whenever a
// message streams, a picture loads or older ones come in above; in block flow, a change lays out only what it moves.
// MessageList keeps its messages in block flow. This holds it there, nightly and before a release, on a macOS runner
// (.github/workflows/webkit-layout.yml): it times the same rows as MessageList lays them out, forced into a flex column,
// and forced into block flow, all on one page, so the runner's speed falls out, and MessageList must grow with its
// length as block flow does. WebKit elsewhere (Linux) lays a flex column of these rows out as fast as block flow, so
// there is nothing to hold and the test is skipped.

const roots: Root[] = [];
const nodes: Element[] = [];
afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of nodes.splice(0)) node.remove();
});

/** A 1200×750 picture, drawn here, so the rows lay out a real image of that size. */
async function picture(): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 750;
  const context = canvas.getContext("2d")!;
  const sky = context.createLinearGradient(0, 0, 1200, 750);
  sky.addColorStop(0, "#334455");
  sky.addColorStop(1, "#ee9988");
  context.fillStyle = sky;
  context.fillRect(0, 0, 1200, 750);
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((made) => resolve(made!), "image/png"));
  return URL.createObjectURL(blob);
}

/** A row that costs a lot to lay out: a picture filling a button filling a cell of a grid of a fixed shape. */
function Row({ index, src }: { index: number; src: string }) {
  return (
    <Message
      role={index % 2 ? "assistant" : "user"}
      name="Mara Quill"
      attachments={
        <div style={{ width: "100%", maxWidth: "min(100%, 25rem)" }}>
          <ul style={{ display: "grid", aspectRatio: "1200 / 750", margin: 0, padding: 0, listStyle: "none" }}>
            <li style={{ position: "relative", minHeight: 0, minWidth: 0 }}>
              <button type="button" data-test-harness="" style={{ display: "block", width: "100%", height: "100%", padding: 0, border: 0 }}>
                <img src={src} alt={`Photo ${index}`} width={1200} height={750} style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }} />
              </button>
            </li>
          </ul>
        </div>
      }
    >
      {`Post ${index}: the venue is confirmed for Friday, and the long cord is packed.`}
    </Message>
  );
}

// The same rows laid out another way, by a style over the list. "flex" is the messages as items of a flex column, as
// MessageList once had them; "block" is plain block flow; "blockInFlex" is block flow inside a flex column of one item,
// as MessageList had them for a while. None changes what the list draws, only how WebKit lays it out.
const layouts = {
  shipped: "",
  flex: "[data-ouro-message-list-content]{display:flex!important;flex-direction:column!important;row-gap:1rem!important}[data-ouro-message-list-column]{display:contents!important}",
  block: "[data-ouro-message-list-content]{display:block!important;align-content:normal!important}[data-ouro-message-list-column]{display:block!important}",
  blockInFlex: "[data-ouro-message-list-content]{display:flex!important;flex-direction:column!important}[data-ouro-message-list-column]{display:block!important}",
};
type Layout = keyof typeof layouts;
const all = Object.keys(layouts) as Layout[];

/** How long one forced layout takes after one message in the middle changes, in ms: the sum over 20 changes. */
function cost(scroller: HTMLElement): number {
  const contents = [...scroller.querySelectorAll("[data-ouro-message-content]")];
  const middle = contents[Math.floor(contents.length / 2)]!;
  let total = 0;
  for (let change = 0; change < 20; change++) {
    middle.append(document.createTextNode(" More."));
    const start = performance.now();
    void scroller.scrollHeight;
    total += performance.now() - start;
  }
  return total;
}

/** A conversation of `rows` costly rows, its pictures decoded, and its scrolling list. */
async function mount(rows: number, src: string): Promise<HTMLElement> {
  const host = document.createElement("div");
  host.style.width = "900px";
  document.body.append(host);
  nodes.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () =>
    root.render(
      <MessageList label={`Channel of ${rows}`} style={{ height: 700 }} springy={false}>
        {Array.from({ length: rows }, (_, index) => (
          <Row key={index} index={index} src={src} />
        ))}
      </MessageList>,
    ),
  );
  const images = [...host.querySelectorAll("img")];
  await Promise.race([Promise.all(images.map((image) => image.decode().catch(() => {}))), new Promise((resolve) => setTimeout(resolve, 5000))]);
  return host.querySelector<HTMLElement>("[data-ouro-message-list-scroller]")!;
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

it("lays out a change to one message in a long conversation as block flow does, not as a flex column, in WebKit on macOS", { timeout: 600_000 }, async ({ annotate, skip }) => {
  skip(!navigator.platform.startsWith("Mac"), "only WebKit on macOS lays a flex column of costly rows out again whole");
  const src = await picture();
  // A short conversation and a long one on the page together, so each pass times both within moments of each other.
  const short = await mount(20, src);
  const long = await mount(160, src);
  const style = document.createElement("style");
  document.head.append(style);
  nodes.push(style);
  // How much more a change costs in the long conversation than in the short one, as a share of what it adds in block
  // flow, in each pass: what a long conversation adds is what stalls it. Each pass times every layout in turn, in
  // alternating orders, so the runner's speed and its drift are in every layout's figure alike; the median pass counts.
  const ratios = Object.fromEntries(all.map((layout) => [layout, [] as number[]])) as Record<Layout, number[]>;
  for (let pass = 0; pass < 9; pass++) {
    const growth = {} as Record<Layout, number>;
    for (const layout of pass % 2 ? [...all].reverse() : all) {
      style.textContent = layouts[layout];
      void short.scrollHeight;
      void long.scrollHeight;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      growth[layout] = Math.max(cost(long) - cost(short), 5);
    }
    for (const layout of all) ratios[layout].push(growth[layout] / growth.block);
  }
  const ratio = (layout: Layout) => median(ratios[layout]);
  const report = all.map((layout) => `${layout} ${ratio(layout).toFixed(2)}× (${ratios[layout].map((value) => value.toFixed(2)).join(" ")})`).join(", ");
  await annotate(`WebKit forced layout over 20 changes to one message, what 160 rows add over 20, against block flow, the median of 9 passes: ${report}`);
  // The flex column must cost clearly more than block flow here, or this runner's WebKit no longer shows what the gate holds.
  expect(ratio("flex"), `this WebKit lays out a flex column of these rows nearly as fast as block flow (${report}), so the gate holds nothing; check the fixture, or retire the gate`).toBeGreaterThanOrEqual(1.4);
  // MessageList grows with its length as block flow does.
  expect(ratio("shipped"), `MessageList's layout grows with its length faster than block flow's (${report})`).toBeLessThanOrEqual(1.2);
});
