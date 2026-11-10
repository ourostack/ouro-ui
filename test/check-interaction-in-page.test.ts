import { afterEach, describe, expect, it } from "vitest";
import { findInteractionIssues } from "@/registry/ouro/check/interaction-check";

// Ouro check's interaction rule, disabled-no-reason, in a real browser: a page that fails it, the near misses that
// pass, and the opt-outs. scripts/check/check.test.mts runs the whole check on its fixture pages.

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

const issues = () => findInteractionIssues().map(({ element, detail }) => [element, detail]);
// Each case on a page of its own, so a field in one case can't excuse a control in another.
const each = (cases: string[]) =>
  cases.flatMap((html) => {
    render(html);
    const found = issues();
    host.remove();
    return found;
  });
const why = "disabled, and nothing on the page says why: give it a title, or tie the words that say why to it with aria-describedby";

describe("findInteractionIssues: disabled-no-reason", () => {
  it("finds a disabled control the page gives no reason for, however it is turned off, named by its words", () => {
    render(`
      <button id="launch" disabled>Launch</button>
      <div role="button" aria-disabled="true" tabindex="-1" class="a b c d">A control whose words run on well past forty letters</div>
      <fieldset disabled><legend>Payment</legend><button>Pay now</button></fieldset>
      <input type="submit" value="Book the table" disabled>
      <button disabled aria-labelledby="named">⚙</button><span id="named">Settings</span>
      <button disabled aria-describedby="nowhere">Missing hint</button>
      <button disabled aria-labelledby="gone" style="width:24px;height:24px"></button>`);
    expect(issues()).toEqual([
      ['button#launch "Launch"', why],
      ['div.a.b.c "A control whose words run on well past f…"', why],
      ['button "Pay now"', why],
      ['input "Book the table"', why],
      ['button "Settings"', why],
      ['button "Missing hint"', why],
      ["button", why],
    ]);
    const ref = findInteractionIssues()[0]!.ref;
    expect(host.querySelector("#launch")!.getAttribute("data-ouro-check-ref")).toBe(`i1 ${ref}`);
  });

  it("passes a reason tied to it or its fieldset, a control moving one way at its end, one waiting for an empty field, enabled, hidden and allowed controls", () => {
    expect(
      each([
        `<button disabled title="Add a dish first">Order</button>`,
        `<button disabled aria-description="Opens at noon">Book</button>`,
        `<p id="hint">Finish the three jobs first.</p><button disabled aria-describedby="hint">Launch</button>`,
        `<fieldset disabled aria-describedby="closed"><button>Pay now</button></fieldset><p id="closed">Payments open on Monday.</p>`,
        `<button disabled aria-label="Previous slide">‹</button><button disabled>No later week</button><button disabled>Zoom out</button><button disabled>Undo</button>`,
        `<form><input aria-label="Dish" value=" "><button type="submit" disabled>Add</button></form>`,
        `<div><textarea aria-label="Message"></textarea><div><button disabled>Send</button></div></div>`,
        `<div><div contenteditable="true" aria-label="Note"></div><button disabled>Save the note</button></div>`,
        `<button>Enabled</button><div role="button" aria-disabled="false" tabindex="0">Not off</div>`,
        `<button disabled hidden>Hidden</button><div style="display:none"><button disabled>Not shown</button></div><div style="opacity:0"><button disabled>Faded out</button></div><button disabled style="position:absolute;width:1px;height:1px;padding:0;border:0;overflow:hidden">Visually hidden</button>`,
        `<button disabled data-ouro-allow="disabled-no-reason" data-ouro-allow-why="a demo of the disabled look">Demo</button>`,
        `<div data-ouro-allow="all" data-ouro-allow-why="a vendor's widget"><button disabled>Vendor</button></div>`,
      ]),
    ).toEqual([]);
  });

  it("counts a field only in the control's own form or a box up to three out, short of the page, and an allow only with its reason", () => {
    expect(
      each([
        `<form id="f"><input aria-label="Name"></form><div><div><div><div><button form="f" disabled>Submit from afar</button></div></div></div></div>`,
        `<div><input aria-label="Far"><div><div><div><button disabled>Too far from the field</button></div></div></div></div>`,
        `<form><input aria-label="Full" value="Ribs"><input type="checkbox" aria-label="A box"><button disabled>Full form</button></form>`,
        `<button disabled data-ouro-allow="disabled-no-reason">No reason given</button>`,
      ]).map(([element]) => element),
    ).toEqual(['button "Too far from the field"', 'button "Full form"', 'button "No reason given"']);
    // A field on the page itself excuses nothing.
    const search = document.createElement("input");
    search.setAttribute("aria-label", "Search");
    document.body.prepend(search);
    try {
      expect(each([`<button disabled>Beside the page's search</button>`]).map(([element]) => element)).toEqual(['button "Beside the page\'s search"']);
    } finally {
      search.remove();
    }
  });
});
