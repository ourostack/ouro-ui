import { afterEach, describe, expect, it } from "vitest";
import { findPanelIssues, type PanelOptions } from "@/registry/ouro/check/panel-check";

// Ouro check's panel rules, empty-panel, wrapped-short-line, boxed-blurb, panel-off-screen and panel-clip, in a real
// browser: for each an open panel that fails it, the near misses that pass, and the opt-outs. Text is set in a monospace
// font at a width in ch, so its lines fall in the same places in every browser. scripts/check/check.test.mts runs the
// whole check on their fixture pages, opening the panels that a button opens.

const state = window as unknown as { __ouroCheckRef?: number };
let host: HTMLDivElement;

afterEach(() => {
  host?.remove();
  delete state.__ouroCheckRef;
});

function render(html: string): HTMLDivElement {
  host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  return host;
}

const mono = "font:16px/1.25 monospace;margin:0";
const of = (rule: string, options?: PanelOptions) => findPanelIssues(options).filter((issue) => issue.rule === rule);
const allow = (rule: string, why = "a demo of the mistake") => `data-ouro-allow="${rule}" data-ouro-allow-why="${why}"`;

describe("findPanelIssues: which panels", () => {
  it("judges an open menu, dialog, popover, placed popup and marked panel, and leaves hidden ones and a listbox no control opens", () => {
    const blurb = `<p style="${mono};border-radius:8px;background:rgb(238,242,247)">Every part of the kit, in one place.</p>`;
    render(`
      <div role="menu" aria-label="Menu">${blurb}</div>
      <div role="dialog" aria-label="Dialog">${blurb}</div>
      <div popover="manual" id="pop">${blurb}</div>
      <div data-side="bottom" data-open="">${blurb}</div>
      <section data-ouro-panel data-ouro="nav-panel" aria-label="Marked">${blurb}</section>
      <div role="menu" aria-label="Hidden" hidden>${blurb}</div>
      <div role="listbox" aria-label="Inline">${blurb}</div>
      <div role="dialog" aria-label="Outer"><div role="listbox" id="inner" aria-label="Inner">${blurb}</div><button aria-controls="inner">Open</button></div>`);
    host.querySelector<HTMLElement>("#pop")!.showPopover();
    expect(of("boxed-blurb").map((issue) => issue.element.split(":")[0])).toEqual([
      'div[role=menu] "Menu"',
      'div[role=dialog] "Dialog"',
      "div#pop",
      "div",
      'section[data-ouro=nav-panel] "Marked"',
      'div[role=dialog] "Outer"',
    ]);
  });
});

describe("findPanelIssues: empty-panel", () => {
  it("finds a wide panel with its links in one narrow column, with the share it fills", () => {
    render(`<nav data-ouro-panel aria-label="Sections" style="width:360px;height:240px;padding:16px;box-sizing:border-box"><ul style="${mono};width:8ch;list-style:none;padding:0"><li><a href="#a">Actions</a></li><li><a href="#b">Forms</a></li></ul><button hidden>More</button></nav>`);
    const [issue] = of("empty-panel");
    expect(issue).toMatchObject({ element: 'nav "Sections"', unit: "%", budget: 60 });
    expect(issue!.value).toBeLessThan(30);
    expect(issue!.detail).toContain("its 328×208px inside");
  });

  it("passes a panel its content fills, one under minHeight tall, menu items laid across it, the opted out, one that fills the screen, a modal dialog, and a side sheet to its last link", () => {
    const items = Array.from({ length: 12 }, (_, i) => `<div role="menuitem" style="height:24px">Item ${i}</div>`).join("");
    render(`
      <nav data-ouro-panel aria-label="Full" style="width:300px;height:200px;display:grid;grid-template-columns:1fr 1fr">${Array.from({ length: 16 }, (_, i) => `<a href="#${i}">Link ${i}</a>`).join("")}</nav>
      <nav data-ouro-panel aria-label="Short" style="width:600px;height:100px"><a href="#a">Actions</a></nav>
      <div role="menu" aria-label="Items" style="width:240px">${items}</div>
      <nav data-ouro-panel aria-label="Allowed" ${allow("empty-panel")} style="width:600px;height:240px"><a href="#a">Actions</a></nav>
      <div role="dialog" aria-label="Screen" style="position:fixed;inset:0"><a href="#a">Actions</a></div>
      <div role="dialog" aria-modal="true" aria-label="Modal" style="width:360px;height:240px"><p>Saved.</p></div>
      <div role="dialog" aria-label="Side" style="position:fixed;top:0;bottom:0;left:0;width:200px">${Array.from({ length: 4 }, (_, i) => `<a href="#${i}" style="display:block">Link ${i}</a>`).join("")}</div>`);
    expect(of("empty-panel")).toEqual([]);
  });
});

describe("findPanelIssues: wrapped-short-line", () => {
  it("finds short words that wrap, at a laptop's limit and a phone's, all in one finding a panel", () => {
    render(`<nav data-ouro-panel aria-label="Guides"><a href="#a" style="${mono};display:block;width:8ch">Install and theme</a><p style="${mono};width:6ch">Check it</p></nav>`);
    const [issue] = of("wrapped-short-line", { wideScreen: 0 });
    expect(issue!.element).toBe('nav "Guides": "Install and theme"');
    expect(issue!.detail).toMatch(/^2 lines of 60 characters or fewer wrap at \d+px \("Install and theme", "Check it"\)/);
    expect(of("wrapped-short-line", { wideScreen: 100000 })[0]!.detail).toMatch(/^2 lines of 24 characters/);
    host.remove();
    render(`<nav data-ouro-panel aria-label="One"><p style="${mono};width:6ch">Check it</p></nav>`);
    expect(of("wrapped-short-line")[0]!.detail).toMatch(/^1 line of \d+ characters or fewer wraps at \d+px \("Check it"\)$/);
    host.remove();
    render(`<nav data-ouro-panel aria-label="Four">${["Aa bb", "Cc dd", "Ee ff", "Gg hh"].map((words) => `<p style="${mono};width:3ch">${words}</p>`).join("")}</nav>`);
    expect(of("wrapped-short-line")[0]!.detail).toMatch(/^4 lines .*\("Aa bb", "Cc dd", "Ee ff", …\)$/);
  });

  it("passes words longer than the limit, words on one line, an element of parts, code and the opted out", () => {
    render(`<nav data-ouro-panel aria-label="Guides">
      <p style="${mono};width:20ch">A description that runs past the twenty-four characters a phone allows</p>
      <p style="${mono}">Install and theme</p>
      <p style="${mono}">Install <!-- a break in the source --> and theme</p>
      <p style="${mono};width:8ch">Install <strong>and</strong> theme</p>
      <code style="${mono};display:block;width:6ch">pnpm i x</code>
      <p style="${mono};width:8ch" ${allow("wrapped-short-line")}>Install and theme</p></nav>`);
    expect(of("wrapped-short-line", { wideScreen: 100000 })).toEqual([]);
  });
});

describe("findPanelIssues: boxed-blurb", () => {
  it("finds a filled box and a framed one of words with nothing to press, the outermost only, and one allowed with no reason", () => {
    render(`<nav data-ouro-panel aria-label="Kit" style="background:rgb(255,255,255)">
      <div style="border-radius:8px;background:rgb(238,242,247)"><p style="border-radius:8px;background:rgb(220,230,240)">Every part of the kit, in one place.</p></div>
      <aside style="border-radius:12px;border:1px solid rgb(200,200,200)">A note on what the kit is for.</aside>
      <div data-ouro-allow="boxed-blurb" style="border-radius:8px;background:rgb(238,242,247)">An allow with no reason, and words that run on past sixty characters.</div></nav>`);
    expect(of("boxed-blurb").map(({ element, detail }) => [element, detail.split(" holds")[0]])).toEqual([
      ['nav "Kit": "Every part of the kit, in one place."', "a rounded box with a fill"],
      ['nav "Kit": "A note on what the kit is for."', "a rounded box with a border"],
      ['nav "Kit": "An allow with no reason, and words that run on past sixty ch…"', "a rounded box with a fill"],
    ]);
  });

  it("passes a box with a link in it, a square box, the panel's own fill, a short badge, a message, code and the opted out", () => {
    render(`<nav data-ouro-panel aria-label="Kit" style="background:rgb(255,255,255)">
      <div style="border-radius:8px;background:rgb(238,242,247)">Every part of the kit, <a href="#a">in one place</a>.</div>
      <div style="background:rgb(238,242,247)">Every part of the kit, in one place.</div>
      <div style="border-radius:8px;background:rgb(255,255,255)">Every part of the kit, in one place.</div>
      <span style="border-radius:8px;background:rgb(238,242,247)">New</span>
      <div role="status" style="border-radius:8px;background:rgb(238,242,247)">Saved every change you made.</div>
      <pre style="border-radius:8px;background:rgb(238,242,247)">pnpm dlx shadcn add button</pre>
      <div style="border-radius:8px;border:1px solid red;border-left:0">Every part of the kit, in one place.</div>
      <div style="border-radius:8px;background:rgb(238,242,247)" ${allow("boxed-blurb")}>Every part of the kit, in one place.</div></nav>`);
    expect(of("boxed-blurb")).toEqual([]);
  });
});

describe("findPanelIssues: panel-off-screen", () => {
  it("finds a fixed panel whose content passes the screen's bottom, by how far", () => {
    render(`<nav data-ouro-panel aria-label="Sections" style="position:fixed;top:0;left:0;width:200px;height:calc(100vh + 150px);display:flex;flex-direction:column;justify-content:flex-end"><a href="#a" style="display:block;height:20px">Actions</a></nav>`);
    const [issue] = of("panel-off-screen");
    expect(issue).toMatchObject({ element: 'nav "Sections"', budget: 1, unit: "px" });
    expect(issue!.value).toBeGreaterThanOrEqual(150);
    expect(issue!.value).toBeLessThanOrEqual(152);
    expect(issue!.detail).toContain(`its content runs ${issue!.value}px past the bottom of the ${innerHeight}px screen`);
  });

  it("finds a panel whose scroll area itself runs past the bottom", () => {
    render(`<div style="position:fixed;top:0;left:0;height:calc(100vh + 80px);overflow-y:auto"><nav data-ouro-panel aria-label="Sections" style="height:200vh"><a href="#a">Actions</a></nav></div>`);
    expect(of("panel-off-screen")[0]).toMatchObject({ value: 80 });
  });

  it("passes a panel that scrolls inside the screen, one in the page that scrolls to it, a box that runs past with nothing in it, and the opted out", () => {
    render(`
      <div style="position:fixed;top:0;left:0;height:50vh;overflow-y:auto"><nav data-ouro-panel aria-label="Held" style="height:200vh"><a href="#a">Actions</a></nav></div>
      <div style="height:100vh"></div><nav data-ouro-panel aria-label="In the page" style="height:200px"><a href="#b">Forms</a></nav>
      <nav data-ouro-panel aria-label="Bleed" style="position:fixed;top:0;left:300px;height:calc(100vh + 150px)"><a href="#c">Lists</a></nav>
      <nav data-ouro-panel aria-label="Allowed" ${allow("panel-off-screen")} style="position:fixed;top:0;left:300px;height:calc(100vh + 150px);display:flex;flex-direction:column;justify-content:flex-end"><a href="#d">Tables</a></nav>`);
    expect(of("panel-off-screen")).toEqual([]);
  });
});

describe("findPanelIssues: panel-clip", () => {
  it("finds words cut off by a box that hides its overflow, by how much", () => {
    render(`<nav data-ouro-panel aria-label="Guides"><div style="${mono};width:12ch;height:20px;overflow:hidden">How to install the kit and theme it</div></nav>`);
    const [issue] = of("panel-clip");
    expect(issue!.element).toBe('nav "Guides": div "How to install the kit and theme it"');
    expect(issue!.detail).toMatch(/^cuts \d+px off its own words \(it shows \d+×20px of /);
  });

  it("reads a box that clips one axis on that axis only", () => {
    render(`<nav data-ouro-panel aria-label="Guides">
      <div style="${mono};width:6ch;overflow-x:clip;white-space:nowrap">Across the box</div>
      <div style="${mono};width:6ch;height:20px;overflow-y:clip">Down the box</div>
      <div style="${mono};width:8ch;overflow-x:clip">Fits by wrapping</div></nav>`);
    expect(of("panel-clip").map((issue) => issue.element)).toEqual(['nav "Guides": div "Across the box"', 'nav "Guides": div "Down the box"']);
  });

  it("passes a box that fits, one that scrolls, one folded to nothing, an ellipsis, visually hidden text, the opted out, and the page as it loads", () => {
    render(`<nav data-ouro-panel aria-label="Guides">
      <div style="${mono};width:12ch;overflow:hidden">How to install the kit and theme it</div>
      <div style="${mono};width:12ch;height:20px;overflow:auto">How to install the kit and theme it</div>
      <div style="${mono};width:12ch;height:0;overflow:hidden">How to install the kit and theme it</div>
      <div style="${mono};width:12ch;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">How to install the kit and theme it</div>
      <span style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Close the menu</span>
      <div style="${mono};width:12ch;height:20px;overflow:hidden" ${allow("panel-clip")}>How to install the kit and theme it</div></nav>`);
    expect(of("panel-clip")).toEqual([]);
    host.querySelector("div")!.setAttribute("style", `${mono};width:12ch;height:20px;overflow:hidden`);
    expect(of("panel-clip", { clip: false })).toEqual([]);
    expect(of("panel-clip")).toHaveLength(1);
  });
});
