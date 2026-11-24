import { afterEach, describe, expect, it } from "vitest";
import { beginTrace, findTransitionFaults, stepTrace, type TransitionTrace } from "@/registry/ouro/check/transition-check";

// The transition rules' page side, in a real browser (Chromium and WebKit). scripts/check/check.test.mts runs them
// through the whole check, on fixtures made up to show each fault.

let host: HTMLDivElement;
afterEach(() => host?.remove());

/** Draws `html`, runs `press` between beginTrace and stepTrace, and returns the faults the trace holds. */
async function trace(html: string, press: () => void, attrs = "") {
  host = document.createElement("div");
  host.innerHTML = `<style>#t-box{position:absolute;top:0;left:0;width:40px;height:40px;background:#cde}#t-next{position:absolute;top:80px}#t-text{width:200px}</style><div ${attrs}>${html}</div>`;
  document.body.append(host);
  beginTrace();
  press();
  const result = await stepTrace();
  return { result, faults: findTransitionFaults(result) };
}

const slide = () => `<div id="t-box"></div><p id="t-next">Below</p>`;
const go = (keyframes: string, options: string) => () => void document.getElementById("t-box")!.animate(JSON.parse(keyframes), JSON.parse(options));

describe("transition rules", () => {
  it("judge nothing when nothing animates", async () => {
    const { result, faults } = await trace(slide(), () => {});
    expect(result.frames).toEqual([]);
    expect(faults).toEqual([]);
  });

  it("finds a box that crosses its move in one frame, and passes one that eases", async () => {
    const jump = await trace(slide(), go('[{"transform":"translateX(0)"},{"transform":"translateX(200px)"}]', '{ "duration": 480, "easing": "steps(1, end)", "fill": "forwards" }'));
    expect(jump.faults.map((f) => f.rule)).toContain("jump");
    expect(jump.faults[0]!.element).toBe("div#t-box");
    const eased = await trace(slide(), go('[{"transform":"translateX(0)"},{"transform":"translateX(200px)"}]', '{ "duration": 480, "easing": "ease-in-out", "fill": "forwards" }'));
    expect(eased.faults).toEqual([]);
  });

  it("finds an edge that goes back before it arrives", async () => {
    const { faults } = await trace(slide(), go('[{"transform":"translateX(0)"},{"transform":"translateX(100px)","offset":0.25},{"transform":"translateX(50px)","offset":0.5},{"transform":"translateX(200px)"}]', '{ "duration": 480, "fill": "forwards" }'));
    expect(faults.map((f) => f.rule)).toContain("backtrack");
  });

  it("finds a neighbour that moves while a box animates, and one that stays", async () => {
    const press = () => void document.getElementById("t-box")!.animate([{ height: "40px" }, { height: "120px" }], { duration: 300, fill: "forwards" });
    const { faults } = await trace(`<div id="t-box" style="position:static"></div><p id="t-next" style="position:static">Below</p>`, press);
    expect(faults.map((f) => `${f.rule} ${f.element} ${f.detail}`)).toEqual(["sibling-reflow p#t-next"]);
  });

  it("finds text that changes its number of lines, and a box that appears in one frame", async () => {
    const press = () => {
      document.getElementById("t-text")!.animate([{ width: "200px" }, { width: "40px" }], { duration: 300, fill: "forwards" });
      document.getElementById("t-box")!.animate([{ opacity: 0, offset: 0 }, { opacity: 1, offset: 0.5 }], { duration: 300, easing: "steps(1, start)", fill: "forwards" });
    };
    const { faults } = await trace(`<div id="t-box"></div><p id="t-text">Words that wrap as it narrows</p>`, press);
    expect(faults.map((f) => `${f.rule} ${f.element} ${f.detail}`).sort()).toEqual(["pop-in div#t-box", "text-rewrap p#t-text"]);
  });

  it("skips an element that says why it may, and reads the rest of the page as it was", async () => {
    const press = go('[{"transform":"none"},{"transform":"translateX(200px)"}]', '{ "duration": 480, "easing": "steps(1, end)", "fill": "forwards" }');
    const { faults } = await trace(slide(), press, 'data-ouro-allow="transition" data-ouro-allow-why="a step is the design"');
    expect(faults.map((f) => `${f.rule} ${f.element} ${f.detail}`)).toEqual([]);
  });

  it("reports an outer element's fault once, and leaves a bare trace's ids alone", () => {
    const reading = (x: number): TransitionTrace["frames"][number] => ({ a: [x, 0, x + 40, 40, 0, 1], b: [x, 0, x + 40, 40, 0, 1] });
    const frames = [reading(0), ...[0, 100, 200].map(reading)];
    const base = { frames, roles: { a: "motion", b: "motion" }, names: { a: "a", b: "b" }, parents: { a: undefined, b: "a" }, texts: [], allowed: [] } as TransitionTrace;
    expect(findTransitionFaults(base).map((f) => f.element)).toEqual(["a"]);
  });
});
