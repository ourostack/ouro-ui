import { afterEach, describe, expect, it } from "vitest";
import { findLayoutIssues } from "@/registry/ouro/check/layout-check";

// Ouro check's layout rules, off-screen, duplicate-control and stray-scrollbar, in a real browser: for each a page that
// fails it and the near misses that pass, and the opt-outs. scripts/check/check.test.mts runs the whole check on their
// fixture pages.

const state = window as unknown as { __ouroCheckRef?: number };
let host: HTMLDivElement;

afterEach(() => {
  host?.remove();
  delete state.__ouroCheckRef;
  window.scrollTo(0, 0);
});

function render(html: string): HTMLDivElement {
  host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  return host;
}

const of = (rule: string, options?: Parameters<typeof findLayoutIssues>[0]) => findLayoutIssues(options).filter((issue) => issue.rule === rule);

describe("findLayoutIssues: off-screen", () => {
  it("finds a control or text the screen cuts off at either edge, once for a nest, named by its words", () => {
    render(`
      <button id="save" style="position:fixed;top:0;right:-60px;width:140px">Save the draft</button>
      <p style="position:fixed;top:40px;left:-30px;width:200px;margin:0">Words cut at the left</p>
      <a href="#x" style="position:fixed;top:80px;right:-40px;width:120px;display:block"><span>A link with words in it</span></a>`);
    const issues = of("off-screen");
    expect(issues.map(({ element, detail }) => [element, detail.replace(/\d+px screen/, "screen")])).toEqual([
      ['button#save "Save the draft"', "60px past the right edge of a screen, where nothing scrolls to it"],
      ['a "A link with words in it"', "40px past the right edge of a screen, where nothing scrolls to it"],
      ['p "Words cut at the left"', "30px past the left edge of a screen, where nothing scrolls to it"],
    ]);
    expect(host.querySelector("#save")!.getAttribute("data-ouro-check-ref")).toBe(issues[0]!.ref);
    host.innerHTML = `<button class="a b c d" style="position:fixed;top:0;right:-60px;width:140px">A button whose words run on well past forty letters</button><button data-ouro-allow="off-screen" style="position:fixed;top:40px;right:-60px;width:140px">Allowed without a reason</button>`;
    expect(of("off-screen").map((issue) => issue.element)).toEqual(['button.a.b.c "A button whose words run on well past fo…"', 'button "Allowed without a reason"']);
  });

  it("passes what fits, a row that scrolls, a box wholly off the screen, hidden text, a clipped ellipsis, and allowed elements", () => {
    render(`
      <button style="position:fixed;top:0;right:0">Fits</button>
      <button style="position:fixed;top:0;right:-2px">Two pixels over</button>
      <div style="overflow-x:auto;width:200px;white-space:nowrap"><span style="display:inline-block;width:2000px">A row that scrolls sideways</span></div>
      <nav style="position:fixed;top:0;left:-400px;width:300px"><a href="#d">A closed drawer</a></nav>
      <span style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)">Visually hidden</span>
      <span style="position:fixed;top:0;right:-40px;width:120px;clip-path:inset(50%)">Hidden by a clip path</span>
      <p style="width:200px;overflow:hidden;white-space:nowrap"><span style="display:inline-block;width:3000px">Clipped inside the screen by its box</span></p>
      <button hidden style="position:fixed;right:-60px">Hidden</button>
      <button style="position:fixed;right:-60px;opacity:0">Faded out</button>
      <button aria-hidden="true" tabindex="-1" style="position:fixed;right:-60px">Hidden from the tree</button>
      <button data-ouro-allow="off-screen" data-ouro-allow-why="a peek of the next card" style="position:fixed;top:0;right:-60px;width:140px">Peeking</button>
      <svg style="position:fixed;right:-60px" width="100" height="20"><text y="10">svg text</text></svg>`);
    expect(of("off-screen")).toEqual([]);
    expect(of("off-screen", { cutPx: 1 }).map((issue) => issue.element)).toEqual(['button "Two pixels over"']);
  });

  it("passes a page that scrolls sideways to it, which sideways-scroll judges", () => {
    render(`<div style="position:absolute;left:0;top:0;width:${innerWidth + 200}px"><button style="margin-left:${innerWidth - 40}px;width:120px">Reached by scrolling</button></div>`);
    expect(of("off-screen")).toEqual([]);
  });
});

describe("findLayoutIssues: duplicate-control", () => {
  it("finds two controls in view with the same role and name, once a pair, marking both", () => {
    render(`
      <section><button id="one">Close</button><p>Words</p><button id="two"> close </button><button>Close</button></section>
      <a href="#a">Chat</a> <a href="#b" aria-label="Chat">💬</a>
      <span id="label">Settings</span><button aria-labelledby="label">⚙</button><button aria-labelledby="nowhere none">x</button><div role="button" tabindex="0">Settings</div>`);
    const issues = of("duplicate-control");
    expect(issues.map(({ element, detail }) => [element, detail])).toEqual([
      ['button "close"', 'drawn twice in view: button#one "Close" and button#two "close"'],
      ['link "Chat"', 'drawn twice in view: a "Chat" and a "Chat"'],
      ['button "Settings"', 'drawn twice in view: button "Settings" and div "Settings"'],
    ]);
    expect(host.querySelector("#one")!.getAttribute("data-ouro-check-ref")).toBe(issues[0]!.ref);
    expect(host.querySelector("#two")!.getAttribute("data-ouro-check-ref")).toBe(issues[0]!.ref);
    host.innerHTML = `<button title="Help" style="width:40px;height:20px"></button><button title="Help" style="width:40px;height:20px"></button><button style="width:40px;height:20px"></button><button style="width:40px;height:20px"></button><input type="search" aria-label="Find"><input type="search" aria-label="Find">`;
    expect(of("duplicate-control").map((issue) => issue.element)).toEqual(['button "Help"', 'search field "Find"']);
  });

  it("passes rows' own controls, different roles or names, one out of view, nameless and nested controls, and allowed ones", () => {
    render(`
      <ul><li>One <button>Delete</button></li><li>Two <button>Delete</button></li></ul>
      <table><tbody><tr><td><a href="#1">Open</a></td></tr><tr><td><a href="#2">Open</a></td></tr></tbody></table>
      <button>Save the draft</button><button>Save and send</button>
      <a href="#s">Search</a><button>Search</button>
      <input type="text" aria-label="Name"><input type="email" aria-label="Name">
      <button></button><button></button>
      <div role="button" tabindex="0">Outer <span role="button" tabindex="0">Outer</span></div>
      <button data-ouro-allow="duplicate-control" data-ouro-allow-why="a bar that repeats at the foot on purpose">Back to top</button><button>Back to top</button>
      <button hidden>Hidden</button><button>Hidden</button>
      <div style="height:${innerHeight * 2}px"></div><button>Save the draft</button>
      <button style="position:fixed;top:0;left:-400px">Save and send</button>`);
    expect(of("duplicate-control")).toEqual([]);
  });
});

describe("findLayoutIssues: stray-scrollbar", () => {
  it("finds a region that scrolls by a few pixels, either way, and a page a few pixels taller than the screen", () => {
    render(`
      <div id="list" style="height:120px;overflow:auto"><div style="height:123px">The content</div></div>
      <div style="width:200px;overflow-x:scroll;overflow-y:hidden"><div style="width:205px;height:20px">Across</div></div>
      <div style="width:200px;height:100px;overflow:auto"><div style="width:202px;height:104px">Both ways</div></div>
      <div style="height:40px;overflow:auto"><div style="height:42px"></div></div>`);
    expect(of("stray-scrollbar").map(({ element, detail }) => [element, detail])).toEqual([
      ['div#list "The content"', "scrolls by 3px down"],
      ['div "Across"', "scrolls by 5px across"],
      ['div "Both ways"', "scrolls by 4px down and 2px across"],
      ["div", "scrolls by 2px down"],
    ]);
    host.innerHTML = `<div style="height:${innerHeight - document.body.getBoundingClientRect().top + 4}px"></div>`;
    document.body.style.margin = "0";
    try {
      expect(of("stray-scrollbar").map(({ element, detail }) => [element, detail])).toEqual([["the page", expect.stringMatching(/^scrolls by [1-8]px down$/)]]);
      expect(document.body.getAttribute("data-ouro-check-ref")).toMatch(/^l\d+$/);
    } finally {
      document.body.style.margin = "";
      document.body.removeAttribute("data-ouro-check-ref");
    }
  });

  it("passes a region that fits or scrolls by a real amount, one that hides its overflow, a hidden one and allowed ones", () => {
    render(`
      <div style="height:120px;overflow:auto"><div style="height:120px">Fits</div></div>
      <div style="height:120px;overflow:auto"><div style="height:400px">A real scroll</div></div>
      <div style="height:120px;overflow:hidden"><div style="height:123px">Hidden overflow</div></div>
      <div hidden style="height:120px;overflow:auto"><div style="height:123px">Hidden region</div></div>
      <div data-ouro-allow="stray-scrollbar" data-ouro-allow-why="a vendor's widget" style="height:120px;overflow:auto"><div style="height:123px">Allowed</div></div>`);
    expect(of("stray-scrollbar")).toEqual([]);
    expect(of("stray-scrollbar", { maxScroll: 300 }).map((issue) => issue.element)).toEqual(['div "A real scroll"']);
  });
});
