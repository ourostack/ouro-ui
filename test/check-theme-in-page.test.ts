import { afterEach, describe, expect, it } from "vitest";
import { findThemeIssues } from "@/registry/ouro/check/theme-check";

// Ouro check's theme rules, focus-ring and dark-miss, in a real browser: for each a page that fails it and the near
// misses that pass, and the opt-outs. scripts/check/check.test.mts runs the whole check on their fixture pages.

const state = window as unknown as { __ouroCheckRef?: number };
let host: HTMLDivElement;

afterEach(() => {
  host?.remove();
  delete state.__ouroCheckRef;
  document.body.style.background = "";
  document.body.style.color = "";
  document.documentElement.style.background = "";
});

function render(html: string): HTMLDivElement {
  host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  return host;
}

const of = (rule: string, options?: Parameters<typeof findThemeIssues>[0]) => findThemeIssues(options).filter((issue) => issue.rule === rule);

// Every control here takes off the browser's own ring, so each shows only the focus the page gives it.
const reset = "<style>.t :focus-visible { outline: none; }</style>";

describe("findThemeIssues: focus-ring", () => {
  it("finds a control whose keyboard focus changes nothing a person can see, a transparent or 0-wide ring too", () => {
    render(`${reset}<div class="t">
      <style>
        .clear:focus-visible { outline: 2px solid transparent !important; }
        .zero:focus-visible { outline: 0 solid red !important; }
        .unseen { position: relative; } .unseen::after { content: ""; position: absolute; inset: 0; opacity: 0; outline: 2px solid transparent; } .unseen:focus-visible::after { outline-color: #36f; }
        .ghost:focus-visible { box-shadow: 0 0 0 3px rgb(0 0 0 / 0); }
        .frame { border: 0 solid red; } .frame:focus-visible { border-color: blue; }
      </style>
      <button id="bare">Save</button>
      <a href="#x" class="clear">A link whose words run on well past forty letters</a>
      <button class="zero" title="Settings" style="width:24px;height:24px"></button>
      <span tabindex="0" class="ghost" style="display:inline-block;width:24px;height:24px"></span>
      <input class="frame" aria-label="Name">
      <button class="unseen">A ring that never shows</button>
    </div>`);
    const issues = of("focus-ring");
    expect(issues.map(({ element, detail }) => [element, detail])).toEqual([
      ['button#bare "Save"', "nothing a person can see changes when it gets keyboard focus"],
      ['a.clear "A link whose words run on well past fort…"', "nothing a person can see changes when it gets keyboard focus"],
      ['button.zero "Settings"', "nothing a person can see changes when it gets keyboard focus"],
      ["span.ghost", "nothing a person can see changes when it gets keyboard focus"],
      ['input.frame "Name"', "nothing a person can see changes when it gets keyboard focus"],
      ['button.unseen "A ring that never shows"', "nothing a person can see changes when it gets keyboard focus"],
    ]);
    expect(host.querySelector("#bare")!.getAttribute("data-ouro-check-ref")).toBe(issues[0]!.ref);
    // A second run marks the same control again, beside its first mark.
    expect(of("focus-ring")[0]!.ref).toBe("t7");
    expect(host.querySelector("#bare")!.getAttribute("data-ouro-check-ref")).toBe("t1 t7");
  });

  it("passes a ring, a shadow, a border, a fill, a colour or an underline, on it, its frame, what is in it or a pseudo-element", () => {
    render(`${reset}<div class="t">
      <style>
        .ring:focus-visible { outline: 2px solid #36f !important; }
        .shadow:focus-visible { box-shadow: 0 0 0 2px #36f; }
        .frame { border: 1px solid #ccc; } .frame:focus-visible { border-color: #36f; }
        .fill:focus-visible { background: #eef; }
        .ink:focus-visible { color: #36f; }
        .line { text-decoration: underline; text-decoration-color: #ccc; } .line:focus-visible { text-decoration-color: #36f; text-decoration-thickness: 2px; }
        .field:focus-within { box-shadow: 0 0 0 2px #36f; }
        .row:has(.row-link:focus-visible) { outline: 2px solid #36f; }
        .card:focus-visible .title { outline: 2px solid #36f; }
        .stretch { position: relative; } .stretch::after { content: ""; position: absolute; inset: 0; } .stretch:focus-visible::after { outline: 2px solid #36f; }
        .spin { animation: spin 1s linear infinite; } .spin:focus-visible { outline: 2px solid #36f !important; }
        .fade { transition: background-color 10s; } .fade:focus-visible { background-color: #eef; }
        .appear { position: relative; } .appear::after { content: ""; position: absolute; inset: -4px; outline: 2px solid #36f; opacity: 0; } .appear:focus-visible::after { opacity: 1; }
        .lift { opacity: 0.6; } .lift:focus-visible { opacity: 1; }
        .first:focus-visible { outline: 2px solid #36f !important; }
        @keyframes spin { to { rotate: 1turn; } }
      </style>
      <button class="ring">Ring</button><button class="shadow">Shadow</button><button class="frame">Border</button>
      <button class="fill">Fill</button><button class="ink">Colour</button><a href="#u" class="line">Underline</a>
      <label class="field"><input aria-label="In a frame"></label>
      <a href="#c" class="card"><span class="title">A card</span></a>
      <a href="#s" class="stretch">Stretched</a>
      <div class="row"><div><p><a href="#r" class="row-link">A row's link, three boxes in</a></p></div></div>
      <button class="spin">Spinning</button><button class="fade">Fading in</button>
      <button class="appear">A ring that appears</button><button class="lift">Lifts</button>
      <button class="first" autofocus>Already focused</button>
    </div>`);
    // Focused before the check, as autofocus leaves it: it is read unfocused first, then focused.
    host.querySelector<HTMLElement>(".first")!.focus();
    expect(of("focus-ring")).toEqual([]);
    expect(document.activeElement).toBe(host.querySelector(".first"));
  });

  it("judges one control of a kind, passes controls it can't focus or judge and allowed ones, and stops at maxControls, then gives focus back", () => {
    render(`${reset}<div class="t">
      <button class="same">Twin</button><button class="same">Twin</button>
      <button disabled>Disabled</button>
      <fieldset disabled><button>In a disabled set</button></fieldset>
      <button hidden>Hidden</button>
      <div style="opacity:0"><button>Faded out</button></div>
      <a href="#main" style="position:absolute;width:1px;height:1px;overflow:hidden">Skip to the content</a>
      <button data-ouro-allow="focus-ring" data-ouro-allow-why="a vendor's widget">Allowed</button>
      <div data-ouro-allow="all" data-ouro-allow-why="a vendor's widget"><button>Allowed by all</button></div>
      <span tabindex="0" id="hands-on">Hands focus on</span><input id="taker" aria-label="Taker">
      <input id="was" aria-label="Was focused" style="outline:2px solid #36f">
    </div>`);
    const was = host.querySelector<HTMLInputElement>("#was")!;
    host.querySelector("#hands-on")!.addEventListener("focus", () => host.querySelector<HTMLElement>("#taker")!.focus());
    was.focus();
    expect(of("focus-ring").map((issue) => issue.element)).toEqual(['button.same "Twin"', 'input#taker "Taker"', 'input#was "Was focused"']);
    expect(document.activeElement).toBe(was);
    was.blur();
    expect(of("focus-ring", { maxControls: 2 }).map((issue) => issue.element)).toEqual(['button.same "Twin"']);
    expect(document.activeElement).toBe(document.body);
    host.innerHTML = `${reset}<div class="t"><button data-ouro-allow="focus-ring">No reason</button></div>`;
    expect(of("focus-ring").map((issue) => issue.element)).toEqual(['button "No reason"']);
  });
});

describe("findThemeIssues: dark-miss", () => {
  const dark = () => {
    document.body.style.background = "#0a0a0a";
    document.body.style.color = "#f5f5f5";
  };

  it("finds a light neutral surface on a dark page, once for a nest, by its fill and the page's", () => {
    dark();
    render(`
      <div id="panel" style="background:#ffffff;width:200px;height:100px">A white panel <div style="background:#fff;width:100px;height:40px">Inside</div></div>
      <section style="background:#fbf6e8;width:300px;height:40px"><img alt="" style="width:20px;height:20px"></section>
      <textarea aria-label="Notes" style="background:#e0e0e0;width:200px;height:60px"></textarea>`);
    const issues = of("dark-miss");
    expect(issues.map(({ element, detail }) => [element, detail])).toEqual([
      ['div#panel "A white panel Inside"', "filled #ffffff on a dark page filled #0a0a0a"],
      ["section", "filled #fbf6e8 on a dark page filled #0a0a0a"],
      ['textarea "Notes"', "filled #e0e0e0 on a dark page filled #0a0a0a"],
    ]);
    expect(host.querySelector("#panel")!.getAttribute("data-ouro-check-ref")).toBe(issues[0]!.ref);
  });

  it("passes accents, controls, an inversion, translucent, dim, small, hidden, picture-filled and allowed surfaces, and surfaces on a picture", () => {
    dark();
    const box = "width:200px;height:100px";
    render(`
      <div style="background:#9af3f7;${box}">An accent</div>
      <button style="background:#ffffff;${box}">A light button</button>
      <span style="display:block;background:#f5f5f5;${box}">In the text colour</span>
      <div style="background:rgb(255 255 255 / 0.5);${box}">Translucent</div>
      <div style="background:#333;${box}">Dim</div>
      <div style="background:#fff;width:40px;height:100px">Narrow</div>
      <div style="background:#fff;width:200px;height:20px">Short</div>
      <div hidden style="background:#fff;${box}">Hidden</div>
      <div style="background:#fff url(data:image/gif;base64,R0lGODlhAQABAAAAACw=);${box}">A picture fill</div>
      <div data-ouro-allow="dark-miss" data-ouro-allow-why="a paper preview" style="background:#fff;${box}">Allowed</div>
      <svg width="200" height="100"><foreignObject width="200" height="100"><div style="background:#fff;${box}">In a picture</div></foreignObject></svg>
      <figure style="position:relative;margin:0"><img alt="" style="display:block;width:300px;height:200px"><figcaption style="position:absolute;top:10px;left:10px;background:#fff;width:200px;height:60px">A speech bubble</figcaption></figure>
      <figure style="margin:0"><img alt="" style="display:block;width:300px;height:20px"><div style="background:#fff;${box};margin-top:40px">Under a picture, not on it</div></figure>`);
    expect(of("dark-miss").map((issue) => issue.element)).toEqual(['div "Under a picture, not on it"']);
  });

  it("leaves a light page alone, whatever it fills, and a page with no fill of its own is white", () => {
    render(`<div style="background:#fff;width:200px;height:100px">A white panel</div>`);
    expect(of("dark-miss")).toEqual([]);
    document.body.style.background = "transparent";
    document.documentElement.style.background = "transparent";
    expect(of("dark-miss")).toEqual([]);
    document.body.style.background = "#fafafa";
    expect(of("dark-miss")).toEqual([]);
  });
});
