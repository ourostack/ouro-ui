import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fragmentFocusScript } from "@/registry/ouro/lib/ouro/fragment-focus-script";

// The click half of fragmentFocusScript, in this page; site/e2e/fragment-focus.spec.ts loads pages with it in WebKit
// and Chromium, where Safari's jumps and the parser's wait can be seen.

const webkit = /AppleWebKit/.test(navigator.userAgent) && !/Chrome\/|Edg\//.test(navigator.userAgent);
const address = location.pathname + location.search;
new Function(fragmentFocusScript())();
// A second copy on the page installs nothing more.
new Function(fragmentFocusScript())();

const made: Element[] = [];

afterEach(() => {
  for (const element of made.splice(0)) element.remove();
  history.replaceState(null, "", address);
});

function link(href: string, attributes: Record<string, string> = {}): HTMLAnchorElement {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.textContent = "Go";
  for (const [name, value] of Object.entries(attributes)) anchor.setAttribute(name, value);
  document.body.append(anchor);
  made.push(anchor);
  return anchor;
}

/** A stylesheet that starts loading now; resolves once it has. */
function stylesheet(attributes: Record<string, string> = { href: "data:text/css,i{color:red}" }): Promise<void> {
  const sheet = document.createElement("link");
  sheet.rel = "stylesheet";
  for (const [name, value] of Object.entries(attributes)) sheet.setAttribute(name, value);
  const loaded = new Promise<void>((done) => sheet.addEventListener("load", () => done(), { once: true }));
  document.head.append(sheet);
  made.push(sheet);
  return loaded;
}

/** Clicks `anchor` and says whether the script held the click back; the page itself goes nowhere. */
function heldBack(anchor: Element, init: MouseEventInit = {}): boolean {
  let held = false;
  window.addEventListener(
    "click",
    (event) => {
      held = event.defaultPrevented;
      event.preventDefault();
    },
    { once: true },
  );
  anchor.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, composed: true, ...init }));
  return held;
}

/** A task after a stylesheet's load, when the script follows a link it held. */
const afterLoad = (loaded: Promise<void>) => loaded.then(() => new Promise((done) => setTimeout(done, 0)));

describe("fragmentFocusScript outside WebKit", () => {
  beforeEach((context) => {
    if (webkit) context.skip();
  });

  it("holds no link", () => {
    void stylesheet();
    expect(heldBack(link("#ff-elsewhere"))).toBe(false);
  });
});

describe("fragmentFocusScript in WebKit", () => {
  beforeEach((context) => {
    if (!webkit) context.skip();
  });

  it("leaves a link to a place on the page to the browser while no stylesheet is loading", () => {
    expect(heldBack(link("#ff-now"))).toBe(false);
  });

  it("holds a link to a place on the page while a stylesheet loads, and follows it once that has loaded", async () => {
    const loaded = stylesheet();
    expect(heldBack(link("#ff-later"))).toBe(true);
    expect(location.hash).toBe("");
    await afterLoad(loaded);
    expect(location.hash).toBe("#ff-later");
  });

  it("holds a link to the top of the page, whose address ends in a bare #", async () => {
    const loaded = stylesheet();
    expect(heldBack(link("#"))).toBe(true);
    await afterLoad(loaded);
    expect(location.href.endsWith("#")).toBe(true);
  });

  it("holds a link inside a shadow root too", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    made.push(host);
    const anchor = document.createElement("a");
    anchor.href = "#ff-shadow";
    host.attachShadow({ mode: "open" }).append(anchor);
    const loaded = stylesheet();
    expect(heldBack(anchor)).toBe(true);
    await afterLoad(loaded);
    expect(location.hash).toBe("#ff-shadow");
  });

  it("drops a held link once the page moves on, or another link is clicked", async () => {
    let loaded = stylesheet();
    expect(heldBack(link("#ff-left"))).toBe(true);
    history.pushState(null, "", "?ff-moved");
    await afterLoad(loaded);
    expect(location.search).toBe("?ff-moved");
    expect(location.hash).toBe("");
    history.replaceState(null, "", address);
    loaded = stylesheet();
    expect(heldBack(link("#ff-replaced"))).toBe(true);
    const routed = link("/ff-route");
    routed.addEventListener("click", (event) => event.preventDefault());
    heldBack(routed);
    await afterLoad(loaded);
    expect(location.hash).toBe("");
  });

  it("leaves alone, while a stylesheet loads, a click the page took, a modified or middle click, a link to another page, a new tab or a download", async () => {
    const loaded = stylesheet();
    const taken = link("#ff-taken");
    taken.addEventListener("click", (event) => event.preventDefault());
    heldBack(taken);
    expect(heldBack(link("#ff-modified"), { metaKey: true })).toBe(false);
    expect(heldBack(link("#ff-middle"), { button: 1 })).toBe(false);
    expect(heldBack(link("/elsewhere#ff-away"))).toBe(false);
    expect(heldBack(link("#ff-tab", { target: "_blank" }))).toBe(false);
    expect(heldBack(link("#ff-file", { download: "" }))).toBe(false);
    await afterLoad(loaded);
    expect(location.hash).toBe("");
  });

  it("counts no stylesheet as loading that has no address, is disabled or is an alternate", () => {
    void stylesheet({});
    void stylesheet({ href: "data:text/css,i{}", disabled: "" });
    void stylesheet({ href: "data:text/css,i{}", rel: "alternate stylesheet" });
    expect(heldBack(link("#ff-quiet"))).toBe(false);
  });
});
