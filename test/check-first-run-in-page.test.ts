import { afterEach, describe, expect, it } from "vitest";
import { findFirstRunIssues, type FirstRunOptions } from "@/registry/ouro/check/first-run-check";

// Ouro check's first-run rules (blank-pane, dismissable-step and signed-out-empty) in a real browser: the pages a first
// run strands a person on, the near misses that pass, and the opt-outs. scripts/check/check.test.mts runs the whole
// check on their fixture pages.

const state = window as unknown as { __ouroCheckRef?: number };
let host: HTMLDivElement | undefined;

afterEach(() => {
  host?.remove();
  host = undefined;
  delete state.__ouroCheckRef;
});

function render(html: string): HTMLDivElement {
  host?.remove();
  host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  return host;
}

const issues = (options?: FirstRunOptions) => findFirstRunIssues(options).map(({ rule, element, detail }) => [rule, element, detail]);
const rules = (html: string, options?: FirstRunOptions) => {
  render(html);
  const found = findFirstRunIssues(options).map(({ rule }) => rule);
  host!.remove();
  host = undefined;
  return found;
};
const nothing = "draws nothing to read, nothing to press and no named progress";

describe("findFirstRunIssues: blank-pane", () => {
  it("finds a main landmark that draws nothing, though it collapses to no height, and names it the same at every size", () => {
    render(`<nav><a href="#a">Inbox</a></nav><main id="pane" class="a b c d"><span hidden>Loading</span><img alt=""><p style="display:none">Hi</p></main>`);
    expect(issues()).toEqual([["blank-pane", "main#pane.a.b.c", `the main landmark ${nothing}`]]);
    const ref = findFirstRunIssues()[0]!.ref;
    expect(host!.querySelector("main")!.getAttribute("data-ouro-check-ref")).toBe(`p1 ${ref}`);
  });

  it("judges the page when no main landmark is there to see, and the open modal dialog over everything else", () => {
    render(`<main hidden><p>Old</p></main><div role="main" style="visibility:hidden"><p>Old</p></div>`);
    expect(findFirstRunIssues().map(({ rule, detail }) => [rule, detail])).toEqual([["blank-pane", `the page ${nothing}`]]);
    host!.remove();
    render(`<main><p>Inbox</p></main><div role="dialog" aria-modal="true" aria-label="Welcome" style="width:200px;height:100px"><svg aria-label="" width="20" height="20"></svg></div>`);
    expect(issues()).toEqual([["blank-pane", 'div "Welcome"', `the open dialog ${nothing}`]]);
  });

  it("passes a pane with words, a picture, a control or named progress, however small", () => {
    const cases = [
      `<main>Hello <b></b></main>`,
      `<main><img alt="A map" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="40" height="40"></main>`,
      `<main><svg aria-label="Logo" width="20" height="20"></svg></main>`,
      `<main><canvas width="40" height="40"></canvas></main>`,
      `<main><button>Retry</button></main>`,
      `<main><button disabled aria-label="Bold" style="width:40px;height:40px"></button></main>`,
      `<main><span aria-hidden="true">Mara Lind</span></main>`,
      `<main><div role="progressbar" aria-label="Sync" style="width:40px;height:4px"></div></main>`,
      `<main><div aria-busy="true" aria-label="Messages" style="width:40px;height:40px"></div></main>`,
      `<main><div role="status" style="width:40px;height:40px">Saved</div></main>`,
      `<main><span style="width:40px;height:40px;display:inline-block">Signing you in</span></main>`,
    ];
    expect(cases.flatMap((html) => rules(html))).toEqual([]);
  });

  it("does not count what a person can't use or read: an unnamed control that is off, an unnamed busy region, an empty status, a hidden word", () => {
    const cases = [
      `<main><button disabled style="width:40px;height:40px"></button></main>`,
      `<main><div role="button" aria-disabled="true" style="width:40px;height:40px"></div></main>`,
      `<main><div aria-busy="true" style="width:40px;height:40px"></div></main>`,
      `<main><div role="status" style="width:40px;height:40px"></div></main>`,
      `<main><p style="opacity:0">Hello</p></main>`,
      `<main><p hidden>Hello</p></main>`,
      `<main><p style="width:1px;overflow:hidden">Hello</p></main>`,
      `<main><p style="height:1px;overflow:hidden">Hello</p></main>`,
    ];
    expect(cases.map((html) => rules(html))).toEqual(cases.map(() => ["blank-pane"]));
  });

  it("takes an allow only with its reason, on the pane or around it", () => {
    expect(rules(`<main data-ouro-allow="blank-pane"></main>`)).toEqual(["blank-pane"]);
    expect(rules(`<main data-ouro-allow="blank-pane" data-ouro-allow-why="a splash that paints itself"></main>`)).toEqual([]);
    expect(rules(`<div data-ouro-allow="all" data-ouro-allow-why="a canvas game"><main></main></div>`)).toEqual([]);
  });
});

describe("findFirstRunIssues: dismissable-step", () => {
  const dialog = (inner: string, attrs = "") => `<div role="dialog" aria-modal="true" aria-label="Welcome" ${attrs}><p>Getting your messages…</p>${inner}</div>`;

  it("finds a modal dialog that Escape or its close button puts away onto a blank page", () => {
    render(`<main aria-hidden="true" inert></main>${dialog("<button>Close</button>")}`);
    expect(issues()).toEqual([["dismissable-step", 'div "Welcome"', 'its "Close" button or Escape puts it away onto a blank page: nothing to read, press or wait for']]);
    expect(rules(`<main></main><div role="alertdialog" aria-modal="true" aria-label="Sign in?"><p>You were signed out.</p></div>`)).toEqual(["dismissable-step"]);
  });

  it("finds one that puts a signed-out person onto a page with no way to sign in, and passes one with a way in or progress", () => {
    render(`<main data-ouro-session="signed-out"><p>Your chats</p><button>Settings</button></main>${dialog("")}`);
    expect(issues()).toEqual([["dismissable-step", 'div "Welcome"', "Escape puts it away onto a signed-out page with no way to sign in"]]);
    host!.remove();
    expect(rules(`<main data-ouro-session="signed-out"><p>Your chats</p><a href="/login">Sign in</a></main>${dialog("")}`)).toEqual([]);
    expect(rules(`<main data-ouro-session="signed-out"><p>Signing you in…</p></main>${dialog("")}`)).toEqual([]);
    expect(rules(`<main><p>Your chats</p></main>${dialog("")}`, { signedOut: true })).toEqual(["dismissable-step"]);
    expect(rules(`<main><p>Your chats</p></main>${dialog("")}`)).toEqual([]);
  });

  it("passes a dialog over a page that holds something, one that holds the main landmark, a non-modal dialog and an allowed one", () => {
    const cases = [
      `<main><p>Inbox</p></main>${dialog("<button>Close</button>")}`,
      `<div role="dialog" aria-modal="true" aria-label="Setup"><main><p>Step 1</p></main></div>`,
      `<main></main><div role="dialog" aria-label="Tips"><p>Drag to sort</p></div>`,
      `<main></main><div role="dialog" aria-modal="true" aria-label="Gone" style="display:none"><p>Hi</p></div>`,
      `<main></main>${dialog("", 'data-ouro-allow="dismissable-step" data-ouro-allow-why="Escape does nothing here"')}`,
    ];
    expect(cases.map((html) => rules(html).filter((rule) => rule === "dismissable-step"))).toEqual(cases.map(() => []));
  });

  it("reads a close control by its name, not a disabled one or one that goes forward", () => {
    render(`<main></main>${dialog('<button disabled>Close</button><button aria-label="Dismiss">×</button>')}`);
    expect(issues()[0]![2]).toMatch(/^its "Dismiss" button or Escape/);
    host!.remove();
    render(`<main></main>${dialog("<button>Skip</button>")}`);
    expect(issues()[0]![2]).toMatch(/^Escape puts it away/);
  });
});

describe("findFirstRunIssues: signed-out-empty", () => {
  it("finds an Ouro Empty or words that say there is nothing, on a signed-out page, once per empty state", () => {
    render(`<main data-ouro-session="signed-out"><h1>Inbox</h1><div data-ouro="empty"><h2>All caught up</h2><p>Nothing new since you last looked.</p></div><p role="status" id="feed">No messages yet</p></main>`);
    expect(issues()).toEqual([
      ["signed-out-empty", 'div "All caught up Nothing new since you last…"', 'signed out, it says "All caught up Nothing new since you last looked.", what a signed-in person with nothing new reads'],
      ["signed-out-empty", 'p#feed "No messages yet"', 'signed out, it says "No messages yet", what a signed-in person with nothing new reads'],
    ]);
  });

  it("judges each empty state by the session around it, else the option, else the page's one marker", () => {
    const empty = `<h2>All caught up</h2>`;
    expect(rules(`<main>${empty}</main>`)).toEqual([]);
    expect(rules(`<main>${empty}</main>`, { signedOut: true })).toEqual(["signed-out-empty"]);
    expect(rules(`<main data-ouro-session="signed-out">${empty}</main>`, { signedOut: false })).toEqual(["signed-out-empty"]);
    expect(rules(`<header data-ouro-session="signed-out"><p>Signed out</p></header><main>${empty}</main>`)).toEqual(["signed-out-empty"]);
    expect(rules(`<header data-ouro-session="signed-out"><p>Signed out</p></header><main>${empty}</main>`, { signedOut: false })).toEqual([]);
    expect(rules(`<header data-ouro-session="signed-out"><p>Signed out</p></header><main data-ouro-session="signed-in">${empty}</main>`)).toEqual([]);
    expect(rules(`<p data-ouro-session="signed-out">Signed out</p><aside data-ouro-session="signed-in"></aside><main>${empty}</main>`)).toEqual([]);
  });

  it("passes the way in, an empty state no one sees, words that only mention nothing, and an allowed one; takes the app's own words", () => {
    const out = (body: string) => `<main data-ouro-session="signed-out"><button>Sign in</button>${body}</main>`;
    const cases = [
      out(`<h2>You are signed out</h2>`),
      out(`<div data-ouro="empty" hidden><h2>All caught up</h2></div>`),
      out(`<p>There are no messages here until you sign in</p>`),
      out(`<div data-ouro="empty" data-ouro-allow="signed-out-empty" data-ouro-allow-why="a public page's own empty search"><h2>No results</h2></div>`),
    ];
    expect(cases.flatMap((html) => rules(html))).toEqual([]);
    expect(rules(out(`<p>Zilch to show</p>`), { empty: "^zilch\\b" })).toEqual(["signed-out-empty"]);
  });
});

describe("findFirstRunIssues: the app's own words", () => {
  it("takes the app's words for a way in and for progress", () => {
    const step = (main: string) => `<main data-ouro-session="signed-out">${main}</main><div role="dialog" aria-modal="true" aria-label="Hi"><p>Hello</p></div>`;
    expect(rules(step(`<button>Join</button>`))).toEqual(["dismissable-step"]);
    expect(rules(step(`<button>Join</button>`), { signIn: "^join$" })).toEqual([]);
    expect(rules(`<main><span style="display:inline-block;width:40px;height:20px">Brewing</span></main>`, { progress: "^brewing$" })).toEqual([]);
  });
});
