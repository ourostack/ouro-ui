import { afterEach, describe, expect, it } from "vitest";
import { findDecisionIssues, type Decision } from "@/registry/ouro/check/decision-check";

// A decision in ouro-check.json, in a real browser: what it finds and what it leaves out. scripts/check.test.mjs runs it
// through the whole check on fixture pages.

let host: HTMLDivElement;

afterEach(() => {
  host?.remove();
  delete (window as unknown as { __ouroCheckRef?: number }).__ouroCheckRef;
});

function render(html: string) {
  host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
}

const details = (decisions: Decision[]) => findDecisionIssues(decisions).map((issue) => issue.detail);

describe("findDecisionIssues", () => {
  it("compares computed style by text, by number within half a pixel, and by a range, a difference or a pattern", () => {
    render(`<b class="chip" style="width:40px;height:20px;border-radius:4px;display:block">x</b>`);
    const hold = (expect: NonNullable<Decision["expect"]>) => details([{ name: "chip", selector: ".chip", expect }]);
    expect(hold({ "border-radius": "4px", height: 20.3, display: "block" })).toEqual([]);
    expect(hold({ "border-radius": "8px" })).toEqual([`"chip": border-radius is 4px, not 8px`]);
    expect(hold({ height: 22 })).toEqual([`"chip": height is 20px, not 22`]);
    expect(hold({ width: { min: 10, max: 50, not: "41px", match: "^40" } })).toEqual([]);
    expect(hold({ width: { min: 41 } })).toEqual([`"chip": width is 40px, under 41`]);
    expect(hold({ width: { max: 39 } })).toEqual([`"chip": width is 40px, over 39`]);
    expect(hold({ width: { not: 40 } })).toEqual([`"chip": width is 40px, which it must not be`]);
    expect(hold({ width: 1, height: 1 })).toEqual([`"chip": width is 40px, not 1`, `"chip": height is 20px, not 1`]);
    expect(document.querySelector(".chip")!.getAttribute("data-ouro-check-ref")!.split(" ").length).toBeGreaterThan(1);
    expect(hold({ width: { match: "^5" } })).toEqual([`"chip": width is 40px, which does not match ^5`]);
  });

  it("reads a box by @width, @height, @x, @y, @right and @bottom", () => {
    render(`<i class="box" style="display:block;position:absolute;left:10px;top:20px;width:30px;height:40px"></i>`);
    const box = document.querySelector(".box")!.getBoundingClientRect();
    const keys = { "@width": 30, "@height": 40, "@x": box.left + scrollX, "@y": box.top + scrollY, "@right": box.right + scrollX, "@bottom": box.bottom + scrollY };
    expect(details([{ name: "box", selector: ".box", expect: keys }])).toEqual([]);
    expect(details([{ name: "box", selector: ".box", expect: { "@width": 31 } }])).toEqual([`"box": @width is 30, not 31`]);
  });

  it("counts drawn matches over the page, as a number or a range, and names the count wanted", () => {
    render(`<u class="one"></u><u class="one" hidden></u><u class="one" style="display:none"></u><u class="two">x</u><u class="two">y</u><template><u class="two">z</u></template>`);
    const count = (selector: string, c: NonNullable<Decision["count"]>) => details([{ name: "n", selector, count: c }]);
    expect(count(".one", 1)).toEqual([]);
    expect(count(".two", 2)).toEqual([]);
    expect(count(".two", { min: 1, max: 3 })).toEqual([]);
    expect(count(".two", 1)).toEqual([`"n": 2 found, 1 of .two wanted`]);
    expect(count(".two", { min: 3 })).toEqual([`"n": 2 found, at least 3 of .two wanted`]);
    expect(count(".two", { max: 1 })).toEqual([`"n": 2 found, 0 to 1 of .two wanted`]);
  });

  it("counts within each box one at a time, and reports a box that has none on the box", () => {
    render(`<section class="p"><em class="m"></em></section><section class="p"></section><section class="p"><em class="m"></em><em class="m"></em></section>`);
    const found = findDecisionIssues([{ name: "one label", selector: ".m", within: ".p", count: 1 }]);
    expect(found.map((issue) => issue.detail)).toEqual([`"one label": in section.p 0 found, 1 of .m wanted`, `"one label": in section.p 2 found, 1 of .m wanted`]);
    expect(found.map((issue) => issue.element)).toEqual(["section.p", "2 × em.m"]);
  });

  it("holds the matches to an only selector, naming each that is something else", () => {
    render(`<nav id="bar"><button class="a">a</button><a class="a" id="odd">b</a></nav>`);
    expect(details([{ name: "buttons only", selector: ".a", only: "button" }])).toEqual([`"buttons only": a#odd.a is not button`]);
    expect(details([{ name: "all", selector: ".a", only: ".a" }])).toEqual([]);
  });

  it("leaves out what a veil, hidden or a template covers, and says a selector that is not CSS is not", () => {
    render(`<div data-ouro-veil><p class="v">x</p></div><p class="v" style="color:red">y</p>`);
    expect(details([{ name: "red", selector: ".v", expect: { color: "rgb(255, 0, 0)" } }])).toEqual([]);
    expect(details([{ name: "bad", selector: "p[", count: 1 }])).toEqual([`"bad": p[ is not a CSS selector`]);
    expect(details([{ name: "bad box", selector: ".v", within: "p[", count: 1 }])).toEqual([`"bad box": p[ is not a CSS selector`]);
  });

  it("marks each finding's elements so the check can draw them, and needs no count to skip the boxes", () => {
    render(`<p class="m" style="color:red">y</p>`);
    const [issue] = findDecisionIssues([{ name: "blue", selector: ".m", expect: { color: "rgb(0, 0, 255)" } }]);
    expect(issue?.rule).toBe("decision");
    expect(document.querySelector(".m")!.getAttribute("data-ouro-check-ref")).toBe(issue?.ref);
  });
});
