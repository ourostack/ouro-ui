import { afterEach, describe, expect, it } from "vitest";
import { findLayoutIssues } from "@/registry/ouro/check/layout-check";

// Ouro check's layout rules, off-screen, duplicate-control, stray-scrollbar and near-miss, in a real browser: for each a page that
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

  it("passes rows' own controls, different roles or names or places, one link twice, own toggles, one out of view, nameless and nested controls, and allowed ones", () => {
    render(`
      <ul><li>One <button>Delete</button></li><li>Two <button>Delete</button></li></ul>
      <table><tbody><tr><td><a href="#1">Open</a></td></tr><tr><td><a href="#2">Open</a></td></tr></tbody></table>
      <button>Save the draft</button><button>Save and send</button>
      <a href="#s">Search</a><button>Search</button>
      <nav aria-label="Main"><button>Menu</button></nav><aside><button>Menu</button></aside>
      <p>See <a href="#source">Source</a> and again <a href="#source">Source</a></p>
      <button aria-controls="first">Show more</button><div id="first"></div><button aria-controls="second">Show more</button><div id="second"></div>
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
      <main style="height:120px;overflow:auto"><h2 style="margin:0">A heading</h2><ul style="margin:0"><li style="height:98px">A row</li></ul></main>
      <div style="width:200px;overflow-x:scroll;overflow-y:hidden"><div style="width:205px;height:20px">Across</div></div>
      <div style="width:200px;height:100px;overflow:auto"><div style="width:202px;height:104px">Both ways</div></div>
      <div style="height:40px;overflow:auto"><div style="height:42px"></div></div>`);
    expect(of("stray-scrollbar").map(({ element, detail }) => [element, detail])).toEqual([
      ['div#list "The content"', "scrolls by 3px down"],
      ['main "A heading A row"', "scrolls by 2px down"],
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

  it("passes a region that fits or scrolls by a real amount, one that hides its overflow, a hidden one, a pixel across, unwrapped text, a list's region and allowed ones", () => {
    render(`
      <div style="height:120px;overflow:auto"><div style="height:120px">Fits</div></div>
      <div style="height:120px;overflow:auto"><div style="height:400px">A real scroll</div></div>
      <div style="height:120px;overflow:hidden"><div style="height:123px">Hidden overflow</div></div>
      <div hidden style="height:120px;overflow:auto"><div style="height:123px">Hidden region</div></div>
      <div data-ouro-allow="stray-scrollbar" data-ouro-allow-why="a vendor's widget" style="height:120px;overflow:auto"><div style="height:123px">Allowed</div></div>
      <div style="width:200px;overflow-x:auto"><div style="width:201px;height:10px"></div></div>
      <pre style="width:200px;overflow-x:auto;margin:0">x<span style="display:inline-block;width:203px"></span></pre>
      <div style="width:200px;overflow-x:auto;white-space:nowrap"><span style="display:inline-block;width:203px">A row</span></div>
      <div style="width:200px;overflow-x:auto"><code style="display:block;width:203px">code</code></div>
      <div style="height:120px;overflow:auto"><ul style="margin:0"><li style="height:123px">A row</li></ul></div>
      <ol style="height:120px;overflow:auto;margin:0"><li style="height:123px">An item</li></ol>
      <div style="height:120px;overflow:auto"><div data-ouro="message" style="height:123px">A message</div></div>`);
    expect(of("stray-scrollbar")).toEqual([]);
    expect(of("stray-scrollbar", { maxScroll: 300 }).map((issue) => issue.element).filter((element) => element !== "the page")).toEqual(['div "A real scroll"']);
  });
});

describe("findLayoutIssues: near-miss", () => {
  const box = (id: string, left: number, top: number, width: number, height: number, style = "background:#cde") =>
    `<div id="${id}" style="position:fixed;left:${left}px;top:${top}px;width:${width}px;height:${height}px;box-sizing:border-box;${style}"></div>`;
  const found = () => of("near-miss").map(({ element, detail }) => [element, detail.replace(/ apart.*$/, "")]);

  it("finds two surfaces a few pixels apart, across and down, and a surface a few pixels inside the one around it", () => {
    render(`${box("a", 10, 10, 60, 30)}${box("b", 74, 10, 60, 30)}${box("c", 10, 100, 60, 30)}${box("d", 10, 133, 60, 30)}`);
    const issues = of("near-miss");
    expect(issues.map(({ element, detail }) => [element, detail.replace(/ apart.*$/, "")])).toEqual([
      ["div#a and div#b", "4px"],
      ["div#c and div#d", "3px"],
    ]);
    expect(host.querySelector("#a")!.getAttribute("data-ouro-check-ref")).toBe(issues[0]!.ref);
    expect(host.querySelector("#b")!.getAttribute("data-ouro-check-ref")).toBe(issues[0]!.ref);
    expect(issues[0]!.detail).toBe("4px apart: more than 0 and under the 8px minimum gap, so neither touching nor clearly apart");
    host.innerHTML = `<div id="card" style="position:fixed;left:10px;top:10px;width:200px;height:100px;box-sizing:border-box;border:2px solid #888;padding:3px 40px 40px 40px">${box("in", 0, 0, 60, 30).replace("position:fixed", "position:relative")}</div>`;
    expect(found()).toEqual([["div#card and div#in", "3px"]]);
    host.innerHTML = `<div id="card" style="position:fixed;left:10px;top:10px;width:200px;height:100px;box-sizing:border-box;background:#eee;padding:40px 40px 40px 5px"><div id="in" style="width:60px;height:30px;background:#cde"></div></div>`;
    expect(found()).toEqual([["div#card and div#in", "5px"]]);
    host.innerHTML = `<div id="card" style="position:fixed;left:10px;top:10px;width:200px;height:100px;box-sizing:border-box;background:#eee;padding:40px 5px 40px 40px"><div id="in" style="width:155px;height:30px;background:#cde"></div></div><div id="card2" style="position:fixed;left:10px;top:200px;width:200px;height:100px;box-sizing:border-box;background:#eee;padding:40px 40px 6px"><div id="in2" style="width:60px;height:54px;background:#cde"></div></div>`;
    expect(found()).toEqual([
      ["div#card and div#in", "5px"],
      ["div#card2 and div#in2", "6px"],
    ]);
  });

  it("finds a picture, an outlined box, a ringed one and a framed one as surfaces, and one finding for two cards with parts in them", () => {
    render(`
      <img id="p" alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" style="position:fixed;left:10px;top:10px;width:60px;height:30px">
      ${box("o", 74, 10, 60, 30, "outline:2px solid #888")}
      ${box("r", 138, 10, 60, 30, "box-shadow:0 0 0 2px #888, inset 0 0 0 4px #fff")}
      ${box("f", 202, 10, 60, 30, "border:1px solid #888")}`);
    expect(found()).toEqual([
      ["img#p and div#o", "4px"],
      ["div#o and div#r", "4px"],
      ["div#r and div#f", "4px"],
    ]);
    host.innerHTML = `
      <div id="x" style="position:fixed;left:10px;top:10px;width:100px;height:80px;background:#eee"><div style="width:50px;height:30px;background:#cde"></div></div>
      <div id="y" style="position:fixed;left:114px;top:10px;width:100px;height:80px;background:#eee"><div style="width:50px;height:30px;background:#cde"></div></div>`;
    expect(found()).toEqual([["div#x and div#y", "4px"]]);
  });

  it("reads the minimum from the page's --ouro-gap-min, and the option's value where the page has none", () => {
    render(`${box("a", 10, 10, 60, 30)}${box("b", 80, 10, 60, 30)}`);
    expect(found()).toEqual([]);
    document.documentElement.style.setProperty("--ouro-gap-min", "initial");
    expect(of("near-miss", { gapMin: 12 }).map((issue) => issue.detail)).toEqual(["10px apart: more than 0 and under the 12px minimum gap, so neither touching nor clearly apart"]);
    try {
      document.documentElement.style.setProperty("--ouro-gap-min", "0.75rem");
      expect(found()).toEqual([["div#a and div#b", "10px"]]);
      document.documentElement.style.setProperty("--ouro-gap-min", "4px");
      expect(found()).toEqual([]);
    } finally {
      document.documentElement.style.removeProperty("--ouro-gap-min");
    }
  });

  it("passes surfaces that touch, are a gap apart, overlap or nest, small and unfilled boxes, and the opted out", () => {
    render(`
      ${box("a", 10, 10, 60, 30)}${box("b", 70, 10, 60, 30)}
      ${box("c", 10, 60, 60, 30)}${box("d", 78, 60, 60, 30)}
      ${box("e", 10, 110, 60, 30)}${box("f", 40, 120, 60, 30)}
      ${box("g", 10, 160, 60, 30)}${box("h", 74, 188, 60, 30)}
      ${box("i", 10, 240, 12, 30)}${box("j", 25, 240, 60, 30)}
      ${box("k", 10, 290, 60, 30, "background:transparent")}${box("l", 74, 290, 60, 30, "background:transparent")}
      ${box("m", 10, 340, 60, 30, "border:1px solid transparent")}${box("n", 74, 340, 60, 30, "border:0 solid #888;border-left:1px solid #888")}
      ${box("o", 10, 390, 60, 30, "outline:0 solid #888")}${box("p", 74, 390, 60, 30, "outline:2px solid transparent")}
      ${box("q", 10, 440, 60, 30, "box-shadow:inset 0 0 0 2px #888")}${box("r", 74, 440, 60, 30, "box-shadow:0 0 0 0 #888")}
      <p style="position:fixed;left:10px;top:540px;margin:0;width:200px"><span style="background:#cde;padding:4px 8px">An inline chip</span> <span style="background:#cde;padding:4px 8px">beside it</span></p>
      <svg style="position:fixed;left:10px;top:590px" width="60" height="30"><rect width="60" height="30" fill="#cde"/></svg><svg style="position:fixed;left:74px;top:590px" width="60" height="30"><rect width="60" height="30" fill="#cde"/></svg>
      <div hidden style="background:#cde;width:60px;height:30px"></div>
      <div data-ouro-allow="near-miss" data-ouro-allow-why="a deliberate hairline" style="position:fixed;left:10px;top:640px;width:60px;height:30px;background:#cde"></div>${box("t", 74, 640, 60, 30)}
      <div id="card" style="position:fixed;left:200px;top:10px;width:200px;height:100px;box-sizing:border-box;background:#eee;padding:0"><div style="width:60px;height:30px;background:#cde"></div><div style="margin:20px 0 0 8px;width:60px;height:30px;background:#cde"></div></div>`);
    expect(found()).toEqual([]);
  });

  it("passes a surface a few pixels inside a button, switch, checkbox, radio or slider, whose parts are drawn as one piece", () => {
    const piece = (left: number, extra = "") =>
      `<div ${extra} style="position:fixed;left:${left}px;top:10px;width:200px;height:100px;box-sizing:border-box;padding:3px 40px 40px 40px;background:#eee">${box("in", 0, 0, 60, 30).replace("position:fixed", "position:relative")}</div>`;
    render(`${piece(10, 'role="switch" tabindex="0"')}${piece(220, 'role="checkbox" tabindex="0"')}${piece(430, 'role="radio" tabindex="0"')}${piece(640, 'role="slider" tabindex="0"')}`);
    expect(found()).toEqual([]);
    host.innerHTML = `<button style="position:fixed;left:10px;top:10px;width:200px;height:100px;box-sizing:border-box;padding:3px 40px 40px 40px;background:#eee;border:0">${box("in", 0, 0, 60, 30).replace("position:fixed", "position:relative")}</button>`;
    expect(found()).toEqual([]);
    // A plain div with no control role still finds the same gap: the skip is for a control's own parts only.
    host.innerHTML = `<div style="position:fixed;left:10px;top:10px;width:200px;height:100px;box-sizing:border-box;padding:3px 40px 40px 40px;background:#eee">${box("in", 0, 0, 60, 30).replace("position:fixed", "position:relative")}</div>`;
    expect(found()).toEqual([["div and div#in", "3px"]]);
  });

  it("skips the container gap on an axis a nearer scrolling ancestor overflows, since where it lands is the scroll position's, not the design's, but still finds one in a container that does not scroll", () => {
    render(`<div id="scroller" style="position:fixed;left:10px;top:10px;width:200px;height:106px;overflow-y:auto;box-sizing:border-box;background:#eee">
      <div style="height:120px"></div>
      <div id="row" style="height:40px;background:#cde"></div>
      <div style="height:200px"></div>
    </div>`);
    const scroller = host.querySelector("#scroller")!;
    scroller.scrollTop = 59;
    expect(found()).toEqual([]);
    host.innerHTML = `<div id="card" style="position:fixed;left:10px;top:10px;width:200px;height:106px;box-sizing:border-box;overflow:hidden;background:#eee"><div id="row" style="margin-top:71px;width:60px;height:30px;background:#cde"></div></div>`;
    expect(found()).toEqual([["div#card and div#row", "5px"]]);
  });

  it("passes the parts of one control group, and finds two groups, or a group and a surface outside it, that nearly touch", () => {
    const part = (id: string, left: number) => `<div id="${id}" style="position:absolute;left:${left}px;top:0;width:60px;height:30px;background:#cde"></div>`;
    const group = (attrs: string, top: number, ...parts: string[]) => `<div ${attrs} style="position:fixed;left:10px;top:${top}px;width:300px;height:30px">${parts.join("")}</div>`;
    const narrow = (attrs: string, left: number, top: number, content: string) => `<div ${attrs} style="position:fixed;left:${left}px;top:${top}px;width:60px;height:30px">${content}</div>`;
    render(`
      ${group('role="group"', 10, part("a", 0), part("b", 64))}
      ${group('role="radiogroup"', 60, part("c", 0), part("d", 64))}
      ${group('role="toolbar"', 110, part("e", 0), part("f", 64))}
      ${group('role="tablist"', 160, part("g", 0), part("h", 64))}
      ${group('data-ouro="toggle-group"', 210, part("i", 0), part("j", 64))}
      <div role="toolbar" style="position:fixed;left:10px;top:260px;width:200px;height:40px;box-sizing:border-box;padding:3px;background:#eee"><div id="k" style="width:60px;height:30px;background:#cde"></div></div>`);
    expect(found()).toEqual([]);
    host.innerHTML = `
      ${narrow('role="group"', 10, 10, part("a", 0))}${narrow('role="group"', 74, 10, part("b", 0))}
      ${narrow('role="group"', 10, 60, part("c", 0))}<div id="d" style="position:fixed;left:74px;top:60px;width:60px;height:30px;background:#cde"></div>`;
    expect(found()).toEqual([
      ["div#a and div#b", "4px"],
      ["div#c and div#d", "4px"],
    ]);
  });

  it("passes a small surface centred in a control's frame, and finds one that is off centre, in a frame with room, or in no control", () => {
    const field = (id: string, frame: string, kbd: string, control = '<input style="position:absolute;left:10px;top:10px;width:100px;height:10px;border:0;background:none">') =>
      `<div id="${id}" style="position:fixed;box-sizing:border-box;left:10px;width:240px;border:1px solid #888;${frame}">${control}<kbd style="position:absolute;right:20px;width:30px;background:#cde;${kbd}"></kbd></div>`;
    render(`
      ${field("a", "top:10px;height:32px", "top:5.5px;height:19px")}
      ${field("b", "top:60px;height:32px", "top:5.5px;height:19px", '<button style="position:absolute;left:0;top:0;width:5px;height:5px;padding:0;border:0"></button>')}
      ${field("c", "top:110px;height:36px", "top:7.5px;height:19px")}`);
    expect(found()).toEqual([]);
    host.innerHTML = `
      ${field("d", "top:10px;height:32px", "top:3px;height:19px")}
      ${field("e", "top:60px;height:32px", "top:5.5px;height:19px", "")}
      ${field("f", "top:110px;height:36px", "top:7.6px;height:18px")}`;
    expect(found()).toEqual([
      ["div#d and kbd", "3px"],
      ["div#e and kbd", "5.5px"],
      ["div#f and kbd", "7.6px"],
    ]);
  });

  it("measures a fill against the page behind it, and passes a nested surface with room, for pages with nothing filled", () => {
    const [root, body] = [document.documentElement, document.body];
    const [rootBackground, bodyBackground] = [root.style.background, body.style.background];
    root.style.background = body.style.background = "transparent";
    try {
      render(`${box("a", 10, 10, 60, 30)}${box("b", 74, 10, 60, 30)}`);
      expect(found()).toEqual([["div#a and div#b", "4px"]]);
    } finally {
      root.style.background = rootBackground;
      body.style.background = bodyBackground;
    }
    host.innerHTML = `<div style="position:fixed;left:0;top:0;width:200px;height:100px;background:#eee;padding:10px"><div style="width:60px;height:30px;background:#cde"></div></div>`;
    expect(found()).toEqual([]);
    host.innerHTML = `<div style="position:fixed;left:0;top:0;width:200px;height:100px;background:#eee"><div style="width:60px;height:30px;background:#eee"></div></div>`;
    expect(found()).toEqual([]);
  });
});
