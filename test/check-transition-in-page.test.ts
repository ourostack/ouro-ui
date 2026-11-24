import { afterEach, describe, expect, it } from "vitest";
import { beginTrace, findTransitionFaults, stepTrace, type TransitionTrace } from "@/registry/ouro/check/transition-check";

// The transition rules' page side, in a real browser (Chromium and WebKit). scripts/check/check.test.mts runs them
// through the whole check, on fixtures made up to show each fault.

let host: HTMLDivElement;
afterEach(() => {
  for (const a of document.getAnimations()) a.cancel();
  document.body.replaceChildren();
});

/** Draws `html`, runs `press` between beginTrace and stepTrace, and returns the faults the trace holds. */
async function trace(html: string, press: () => void, attrs = "") {
  host = document.createElement("div");
  host.style.cssText = "position:fixed;top:0;left:0;width:400px;overflow:hidden";
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
    expect(faults.map((f) => `${f.rule} ${f.element}`)).toEqual(["sibling-reflow p#t-next"]);
  });

  it("finds text that changes its number of lines, and a box that appears in one frame", async () => {
    const press = () => {
      document.getElementById("t-text")!.animate([{ width: "200px" }, { width: "40px" }], { duration: 300, fill: "forwards" });
      document.getElementById("t-box")!.animate([{ opacity: 0, offset: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1, offset: 0.505 }], { duration: 300, fill: "forwards" });
    };
    const { faults } = await trace(`<div id="t-box"></div><p id="t-text">Words that wrap as it narrows</p>`, press);
    expect(faults.map((f) => `${f.rule} ${f.element}`).sort()).toEqual(["pop-in div#t-box", "text-rewrap p#t-text"]);
  });

  it("finds an edge that passes where it ends, one off its own easing, a fade off its own curve, and a label cut off mid-move", async () => {
    const slideTo = '[{"transform":"translateX(0)"},{"transform":"translateX(200px)"}]';
    const over = await trace(slide(), go(slideTo, '{ "duration": 480, "easing": "cubic-bezier(.3,1.7,.6,1)", "fill": "forwards" }'));
    expect(over.faults.map((f) => f.rule)).toEqual(["overshoot"]);
    const press = () => {
      const box = document.getElementById("t-box")!;
      box.animate(JSON.parse(slideTo), { duration: 300, easing: "ease-in-out", fill: "forwards" });
      box.animate([{ marginLeft: "0px" }, { marginLeft: "20px" }], { duration: 600, easing: "linear", fill: "forwards" });
    };
    const lag = await trace(slide(), press);
    expect(lag.faults.map((f) => f.rule)).toEqual(["off-curve"]);
    const fade = () => {
      const box = document.getElementById("t-box")!;
      box.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 600, easing: "linear", fill: "both" });
      box.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 100, easing: "linear", fill: "both" });
    };
    expect((await trace(slide(), fade)).faults.map((f) => f.rule)).toEqual(["opacity-step"]);
    const clip = (width: string[]) => () => void document.getElementById("t-label")!.animate([{ width: width[0]! }, { width: width[1]! }], { duration: 300, fill: "forwards" });
    const label = '<p id="t-label" style="display:block;overflow:hidden;white-space:nowrap;margin:0;width:20px">Garden room</p>';
    const cut = await trace(label, clip(["20px", "200px"]));
    expect(cut.faults.map((f) => f.rule)).toEqual(["label-clip"]);
    const fits = await trace(label.replace("width:20px", "width:200px"), clip(["200px", "200px"]));
    expect(fits.faults).toEqual([]);
  });

  it("skips an element that says why it may, and reads the rest of the page as it was", async () => {
    const press = go('[{"transform":"none"},{"transform":"translateX(200px)"}]', '{ "duration": 480, "easing": "steps(1, end)", "fill": "forwards" }');
    const { faults } = await trace(slide(), press, 'data-ouro-allow="transition" data-ouro-allow-why="a step is the design"');
    expect(faults.map((f) => `${f.rule} ${f.element}`)).toEqual([]);
  });

  it("still reports an element that says it may with no reason, reads a hidden sibling's opacity as zero, and names a class", async () => {
    const host2 = document.createElement("div");
    host2.style.cssText = "position:fixed;top:0;left:0;width:400px;overflow:hidden";
    host2.innerHTML = '<div><div id="t-box" class="cls"></div><div id="t-skip" data-ouro-allow="transition"></div><p id="t-hidden" style="visibility:hidden">Hidden</p></div>';
    document.body.append(host2);
    beginTrace();
    const jump = '[{"transform":"none"},{"transform":"translateX(200px)"}]';
    const options = '{ "duration": 480, "easing": "steps(1, end)", "fill": "forwards" }';
    document.getElementById("t-box")!.animate(JSON.parse(jump), JSON.parse(options));
    document.getElementById("t-skip")!.animate(JSON.parse(jump), JSON.parse(options));
    const result = await stepTrace();
    const faults = findTransitionFaults(result);
    expect(faults.map((f) => `${f.rule} ${f.element}`).sort()).toEqual(["jump div#t-box.cls", "jump div#t-skip"]);
    host2.remove();
  });

  it("ignores an animation that finished before the trace steps it, even though its fill still holds its end state", async () => {
    host = document.createElement("div");
    host.style.cssText = "position:fixed;top:0;left:0;width:400px;overflow:hidden";
    host.innerHTML = '<style>#t-box{position:absolute;top:0;left:0;width:40px;height:40px;background:#cde}</style><div id="t-box"></div>';
    document.body.append(host);
    beginTrace();
    const anim = document.getElementById("t-box")!.animate([{ transform: "translateX(0)" }, { transform: "translateX(200px)" }], { duration: 480, easing: "steps(1, end)", fill: "forwards" });
    anim.finish();
    const result = await stepTrace();
    expect(result.frames).toEqual([]);
    expect(findTransitionFaults(result)).toEqual([]);
  });

  it("reports an outer element's fault once, leaves a bare trace's ids alone, and reads a frame missing an id as absent", () => {
    const reading = (x: number): TransitionTrace["frames"][number] => ({ a: [x, 0, x + 40, 40, 0, 1, 0], b: [x, 0, x + 40, 40, 0, 1, 0] });
    const frames = [reading(0), ...[0, 100, 200].map(reading)];
    const base = { frames, roles: { a: "motion", b: "motion" }, names: { a: "a", b: "b" }, parents: { a: undefined, b: "a" }, texts: [], progress: {}, allowed: [] } as TransitionTrace;
    expect(findTransitionFaults(base).map((f) => f.element)).toEqual(["a"]);

    // A frame that drops an id partway through (as when an element briefly has no box) reads as absent there, with no
    // crash, and an opacity that swings from shown to hidden across that gap still pops.
    const sparse: TransitionTrace = {
      frames: [{ c: [0, 0, 50, 50, 0, 1, 0] }, { c: [0, 0, 50, 50, 0, 1, 0] }, {}, { c: [0, 0, 50, 50, 0, 1, 0] }],
      roles: { c: "motion" },
      names: { c: "div#c" },
      parents: { c: undefined },
      texts: [],
      progress: {},
      allowed: [],
    };
    expect(findTransitionFaults(sparse)).toEqual([{ rule: "pop-in", element: "div#c", detail: "it went from shown to hidden within one frame of a 3-frame transition" }]);

    // A frame missing an id before any frame that still has it reads its area as 0 rather than skipping the read:
    // `series.some` must call area() on that absent reading, not short-circuit past it on an earlier truthy one.
    const missingFirst: TransitionTrace = {
      frames: [{}, {}, { d: [0, 0, 50, 50, 0, 1, 0] }],
      roles: { d: "motion" },
      names: { d: "div#d" },
      parents: { d: undefined },
      texts: [],
      progress: {},
      allowed: [],
    };
    expect(findTransitionFaults(missingFirst)).toEqual([]);
  });
});
