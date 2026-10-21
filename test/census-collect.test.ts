import axe from "axe-core";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { animationsSettled, censusExclusions, collectInPage, interactiveSelector, type InPageControl } from "@/registry/ouro/census/census-collect.mjs";

// The census kit's in-page side (ouro-census), in a real browser: the role, name, marker and
// context it reports for each control, and when animations count as settled.

let host: HTMLDivElement;
beforeAll(() => {
  (window as unknown as { axe: typeof axe }).axe = axe;
});
afterEach(() => {
  host?.remove();
  for (const animation of document.getAnimations()) animation.cancel();
});

function collect(html: string): InPageControl[] {
  host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  return collectInPage({ selector: interactiveSelector, exclusions: censusExclusions });
}

const pick = (controls: InPageControl[], name: string) => controls.find((control) => control.name === name);

describe("collectInPage", () => {
  it("reports each control's role, from the tag, the input type or an explicit role", () => {
    const controls = collect(`
      <main>
        <button>Save</button>
        <a href="/">Home</a>
        <a tabindex="0">No link</a>
        <textarea aria-label="Notes"></textarea>
        <select aria-label="One"><option>a</option></select>
        <select aria-label="Many" multiple><option>a</option></select>
        <select aria-label="Tall" size="3"><option>a</option></select>
        <input aria-label="Text" />
        <input aria-label="Email suggest" type="email" list="l" />
        <input aria-label="Search" type="search" />
        <input aria-label="Search suggest" type="search" list="l" />
        <input aria-label="Count" type="number" />
        <input aria-label="Volume" type="range" />
        <input aria-label="Done" type="checkbox" />
        <input aria-label="Photo" type="file" />
        <input aria-label="Date" type="date" />
        <input type="hidden" value="x" />
        <div aria-label="Editor" contenteditable="true"></div>
        <div aria-label="Card" tabindex="0"></div>
        <div aria-label="First tab" role="tab tablist" tabindex="0"></div>
        <datalist id="l"></datalist>
      </main>`);
    expect(Object.fromEntries(controls.map((control) => [control.name, control.role]))).toEqual({
      Save: "button",
      Home: "link",
      "No link": "generic",
      Notes: "textbox",
      One: "combobox",
      Many: "listbox",
      Tall: "listbox",
      Text: "textbox",
      "Email suggest": "combobox",
      Search: "searchbox",
      "Search suggest": "combobox",
      Count: "spinbutton",
      Volume: "slider",
      Done: "checkbox",
      Photo: "button",
      Date: "textbox",
      Editor: "textbox",
      Card: "generic",
      "First tab": "tab",
    });
  });

  it("names the area of a map as a link or not", () => {
    const controls = collect(`<map name="m"><area href="/a" alt="Area link" tabindex="0" /><area alt="Area plain" tabindex="0" /></map>`);
    expect(controls.map((control) => control.role)).toEqual(["link", "generic"]);
  });

  it("reads Ouro's markers, and leaves out Base UI's focus guards", () => {
    const controls = collect(`<button data-ouro-control="button" data-ouro-part="root">Go</button><span data-base-ui-focus-guard tabindex="0"></span>`);
    expect(controls).toEqual([{ visible: true, role: "button", name: "Go", control: "button", part: "root", landmark: null, testId: null }]);
  });

  it("gives each control the landmark, dialog or named group around it, named only by its author", () => {
    const controls = collect(`
      <header><button>Banner</button></header>
      <article><header><button>Article header</button></header><footer><button>Article footer</button></footer></article>
      <footer><button>Footer</button></footer>
      <nav aria-label="Site"><a href="/">Nav</a></nav>
      <aside><button>Aside</button></aside>
      <search><button>Find</button></search>
      <dialog open aria-labelledby="t missing"><h2 id="t">Rename note</h2><button>In dialog</button></dialog>
      <form><button>Unnamed form</button></form>
      <form aria-label="Sign in"><button>Named form</button></form>
      <section aria-labelledby="s"><h2 id="s">Settings</h2><button>In section</button></section>
      <fieldset><legend>Size</legend><button>In fieldset</button></fieldset>
      <fieldset><legend> </legend><button>Blank legend</button></fieldset>
      <div role="group" title="Tools"><button>In group</button></div>
      <div role="  "><div data-testid="row"><button>In testid</button></div></div>`);
    const context = (name: string) => pick(controls, name)!.landmark;
    expect(context("Banner")).toEqual({ role: "banner", name: "" });
    expect(context("Article header")).toBeNull();
    expect(context("Article footer")).toBeNull();
    expect(context("Footer")).toEqual({ role: "contentinfo", name: "" });
    expect(context("Nav")).toEqual({ role: "navigation", name: "Site" });
    expect(context("Aside")).toEqual({ role: "complementary", name: "" });
    expect(context("Find")).toEqual({ role: "search", name: "" });
    expect(context("In dialog")).toEqual({ role: "dialog", name: "Rename note" });
    expect(context("Unnamed form")).toBeNull();
    expect(context("Named form")).toEqual({ role: "form", name: "Sign in" });
    expect(context("In section")).toEqual({ role: "region", name: "Settings" });
    expect(context("In fieldset")).toEqual({ role: "group", name: "Size" });
    expect(context("Blank legend")).toBeNull();
    expect(context("In group")).toEqual({ role: "group", name: "Tools" });
    expect(pick(controls, "In testid")).toMatchObject({ landmark: null, testId: "row" });
    expect(pick(controls, "Article header")!.testId).toBeNull();
  });

  it("says whether each control is visible", () => {
    const controls = collect(`<main><button>Shown</button><button style="display: none">Gone</button><button style="visibility: hidden">Invisible</button></main>`);
    // axe names only what is rendered, so the hidden ones have no name either.
    expect(controls.map((control) => [control.name, control.visible])).toEqual([
      ["Shown", true],
      ["", false],
      ["", false],
    ]);
  });
});

describe("animationsSettled", () => {
  it("waits for a finite animation, and ignores an infinite or finished one", async () => {
    host = document.createElement("div");
    document.body.append(host);
    expect(animationsSettled()).toBe(true);
    const spinner = host.appendChild(document.createElement("i")).animate([{ opacity: 0 }, { opacity: 1 }], { duration: 1000, iterations: Infinity });
    expect(animationsSettled()).toBe(true);
    const fade = host.appendChild(document.createElement("i")).animate([{ opacity: 0 }, { opacity: 1 }], { duration: 10_000 });
    expect(animationsSettled()).toBe(false);
    fade.finish();
    await fade.finished;
    expect(animationsSettled()).toBe(true);
    const paused = host.appendChild(document.createElement("i")).animate([{ opacity: 0 }, { opacity: 1 }], { duration: 10_000 });
    paused.pause();
    await paused.ready;
    expect(animationsSettled()).toBe(true);
    spinner.cancel();
  });
});
