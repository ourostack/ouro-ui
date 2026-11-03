import { afterEach, describe, expect, it } from "vitest";
import { server, userEvent } from "vitest/browser";
import { findLoadingIssues, interactionSince, listenForMeasures, markPressables, pressPoint, type Measures } from "@/registry/ouro/check/measure";

// Ouro check's measured rules, in the page (ouro-check). The check runs in Chromium, the browser that reports layout
// shifts, the largest content drawn and each event's timing, so these run there. scripts/check.test.mjs runs the whole
// check on the fixture pages, a pass and a fail page per rule.

const chromiumOnly = it.skipIf(server.browser !== "chromium");
const state = window as unknown as { __ouroCheckRef?: number; __ouroCheckMeasures?: Measures };
const budgets = { "layout-shift": 0.1, "first-content": 2500 };
const frames = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 50))));
let host: HTMLDivElement;

afterEach(() => {
  host?.remove();
  delete state.__ouroCheckRef;
  delete state.__ouroCheckMeasures;
  window.scrollTo(0, 0);
});

function render(html: string): HTMLDivElement {
  host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  return host;
}

const measures = () => {
  listenForMeasures();
  return state.__ouroCheckMeasures!;
};
// Measures as a page recorded them, without observers that would add the test page's own.
const recorded = (values: Partial<Measures>) => {
  state.__ouroCheckMeasures = { shift: 0, shiftNode: null, paint: 0, paintNode: null, events: [], add: () => undefined, ...values };
};

describe("listenForMeasures", () => {
  chromiumOnly("records the largest content the page draws, and each shift as it happens", async () => {
    const m = measures();
    render('<p id="words" style="font-size:40px">Content drawn after the check began to listen.</p><div id="below" style="height:40px"></div>');
    await frames();
    await expect.poll(() => m.paint).toBeGreaterThan(0);
    document.getElementById("words")!.before(Object.assign(document.createElement("div"), { style: "height:300px" }));
    await expect.poll(() => m.shift).toBeGreaterThan(0);
  });

  it("scores the largest burst of shifts no input caused, and keeps the element that moved most", () => {
    const m = measures();
    const [a, b, c] = ["a", "b", "c"].map((id) => Object.assign(document.createElement("div"), { id }));
    const shift = (value: number, startTime: number, nodes: (Node | null)[], hadRecentInput = false) => m.add({ value, startTime, hadRecentInput, sources: nodes.map((node) => ({ node })) });
    m.shift = 0;
    shift(0.05, 2000, [a!]);
    shift(0.08, 2600, [null, b!]);
    expect(m.shift).toBeCloseTo(0.13);
    expect(m.shiftNode).toBe(b);
    // A shift just after input is the person's own doing.
    shift(0.5, 2700, [c!], true);
    expect(m.shift).toBeCloseTo(0.13);
    // A second's pause starts a new burst; the score is the largest burst, and the node the largest single shift's.
    shift(0.02, 4000, []);
    shift(0.01, 4500, [c!]);
    expect(m.shift).toBeCloseTo(0.13);
    expect(m.shiftNode).toBe(b);
    // So does a burst five seconds long, however close its shifts: the last one here starts its own.
    for (const at of [5000, 5900, 6800, 7700, 8600]) shift(0.04, at, []);
    shift(0.1, 9100, []);
    expect(m.shift).toBeCloseTo(0.23);
  });
});

describe("findLoadingIssues", () => {
  it("finds a page that shifted or drew its content over budget, marked on what moved and what drew, with each number and budget", async () => {
    render('<div id="moved" class="card">Moved</div><p id="late">Late words</p>');
    // A text node, as a shift's source can be: named by its element.
    recorded({ shift: 0.2345, shiftNode: document.getElementById("moved")!.firstChild, paint: 3200.4, paintNode: document.getElementById("late") });
    const issues = await findLoadingIssues(budgets);
    expect(issues).toEqual([
      { ref: "m1", rule: "layout-shift", element: 'div#moved.card "Moved"', detail: "shifted 0.235 while loading, over the budget of 0.1", value: 0.235, budget: 0.1, unit: "" },
      { ref: "m2", rule: "first-content", element: 'p#late "Late words"', detail: "3200 ms to its largest content, over the budget of 2500 ms", value: 3200, budget: 2500, unit: "ms" },
    ]);
    expect(document.getElementById("late")!.getAttribute("data-ouro-check-ref")).toBe("m2");
  });

  it("names an element by its tag, id, classes and first words, or its label", async () => {
    render('<div id="box" style="height:40px"></div><p aria-label="A label longer than the forty characters a name keeps">Words</p>');
    recorded({ shift: 0.3, shiftNode: host.querySelector("div"), paint: 3000, paintNode: host.querySelector("p") });
    expect((await findLoadingIssues(budgets)).map((issue) => issue.element)).toEqual(["div#box", 'p "A label longer than the forty characters…"']);
  });

  it("names content that has left the page, or was never named, as the page", async () => {
    recorded({ shift: 0.3, shiftNode: document.createElement("p"), paint: 2600, paintNode: null });
    const issues = await findLoadingIssues(budgets);
    expect(issues.map((issue) => issue.element)).toEqual(["the page", "the page"]);
    expect(document.body.getAttribute("data-ouro-check-ref")).toBe("m1 m2");
    document.body.removeAttribute("data-ouro-check-ref");
  });

  it("passes a page within its budgets, and an element allowed the rule with a reason", async () => {
    render('<div data-ouro-allow="layout-shift" data-ouro-allow-why="a ticker that moves on purpose"><p id="ticker">Ticker</p></div><div data-ouro-allow="all" data-ouro-allow-why="a demo"><p id="demo">Demo</p></div>');
    recorded({ shift: 0.1, paint: 2500 });
    expect(await findLoadingIssues(budgets)).toEqual([]);
    recorded({ shift: 0.5, shiftNode: document.getElementById("ticker"), paint: 4000, paintNode: document.getElementById("demo") });
    expect(await findLoadingIssues(budgets)).toEqual([]);
  });
});

describe("markPressables", () => {
  it("marks and names the controls a person can press, shown and enabled, up to the limit, and no link or form submit", () => {
    render(`
      <button id="one" class="a b c d">One</button>
      <div role="tab" aria-label="Second tab">2</div>
      <summary>More</summary>
      <input type="checkbox" aria-label="Agree">
      <button disabled>Off</button>
      <div role="button" aria-disabled="true">Off too</div>
      <button hidden>Hidden</button>
      <button style="visibility:hidden">Invisible</button>
      <span data-ouro-allow="inp" data-ouro-allow-why="slow on purpose"><button>Allowed</button></span>
      <form><button>Send</button><button type="button">Add a row</button></form>
      <a href="#">A link</a>
      <button>${"A long label ".repeat(5)}</button>
      <button>Past the limit</button>`);
    expect(markPressables(7)).toEqual([
      { ref: "p1", element: 'button#one.a.b.c "One"' },
      { ref: "p2", element: 'div "Second tab"' },
      { ref: "p3", element: 'summary "More"' },
      { ref: "p4", element: 'input "Agree"' },
      { ref: "p5", element: 'button "Add a row"' },
      { ref: "p6", element: 'button "A long label A long label A long label A…"' },
      { ref: "p7", element: 'button "Past the limit"' },
    ]);
    expect(markPressables(1)).toEqual([{ ref: "p8", element: 'button#one.a.b.c "One"' }]);
    expect(document.getElementById("one")!.getAttribute("data-ouro-check-ref")).toBe("p1 p8");
    host.remove();
    render('<button aria-label="" style="width:24px;height:24px"></button>');
    expect(markPressables(20).at(-1)!.element).toBe("button");
  });
});

describe("pressPoint", () => {
  it("gives the middle of a control scrolled into view, and null for one covered or gone", () => {
    render(`
      <div style="height:${innerHeight * 2}px"></div>
      <button data-ouro-check-ref="p1" style="width:80px;height:40px">Press</button>
      <span style="position:relative;display:inline-block"><button data-ouro-check-ref="p2">Covered</button><span style="position:absolute;inset:0"></span></span>`);
    const point = pressPoint("p1")!;
    const rect = host.querySelector('[data-ouro-check-ref="p1"]')!.getBoundingClientRect();
    expect(point).toEqual({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    expect(point.y).toBeLessThan(innerHeight);
    expect(pressPoint("p2")).toBeNull();
    expect(pressPoint("p9")).toBeNull();
  });
});

describe("interactionSince", () => {
  chromiumOnly("gives the longest event of the presses since a time, after two frames, and 0 for none", async () => {
    const m = measures();
    render('<button id="slow">Slow</button>');
    document.getElementById("slow")!.addEventListener("click", () => {
      const start = performance.now();
      while (performance.now() - start < 200);
    });
    const since = performance.now();
    await userEvent.click(document.getElementById("slow")!);
    expect(await interactionSince(since)).toBeGreaterThanOrEqual(200);
    expect(m.events.length).toBeGreaterThan(0);
    expect(await interactionSince(performance.now())).toBe(0);
  });
});
