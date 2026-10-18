import { afterEach, describe, expect, it, onTestFinished } from "vitest";
import { commands } from "vitest/browser";
import { cleanupStories, renderStory, settle, stories } from "./stories.tsx";
import { expectGestureSettle, expectMotion, expectNoMotion, expectTransition, motionRows, parseDuration, takeMotionRecords, type MotionRecord } from "./motion.ts";

// The motion helpers each component test calls after a state change (the test kit's
// testing/motion.ts). They read what runs on one part (`data-ouro-part`), fail on anything but the
// expected set, and record what they proved in the test's meta, where scripts/motion-reporter.mts
// collects it for pnpm motion:coverage. These tests take their own records back
// (`takeMotionRecords`), so fixtures never reach the evidence.

let mounted: HTMLElement[] = [];
afterEach(async () => {
  for (const element of mounted) element.remove();
  mounted = [];
  await commands.emulateMedia({ reducedMotion: "no-preference" });
});

/** A part that starts at `from`, styled with `transition`, ready to change. */
function part(name: string, transition: string, from: Partial<CSSStyleDeclaration> = { opacity: "0" }): HTMLElement {
  const element = document.createElement("div");
  element.dataset["ouroPart"] = name;
  element.style.cssText = `width: 20px; height: 20px; transition: ${transition}`;
  Object.assign(element.style, from);
  document.body.append(element);
  mounted.push(element);
  flushStyle(element);
  return element;
}

/** Makes the browser compute the element's style now, so a later change transitions from it. */
const flushStyle = (element: Element) => void getComputedStyle(element).opacity;

/** The records this test made so far, taken out of its meta. */
const taken = (): MotionRecord[] => takeMotionRecords();

describe("parseDuration", () => {
  it("reads milliseconds, seconds and a custom property's computed value", () => {
    expect(parseDuration("240ms")).toBe(240);
    expect(parseDuration(" 0.24s ")).toBe(240);
    expect(parseDuration("0s")).toBe(0);
    expect(parseDuration(getComputedStyle(document.documentElement).getPropertyValue("--ouro-duration-fast"))).toBe(150);
    const element = part("probe", "none");
    element.style.setProperty("--probe-duration", "0.3s");
    expect(parseDuration(getComputedStyle(element).getPropertyValue("--probe-duration"))).toBe(300);
  });

  it("rejects anything that is not one duration", () => {
    for (const value of ["", "240", "fast", "1s 2s", "-1ms"]) expect(() => parseDuration(value), value).toThrow(/is not a duration/);
  });
});

describe("expectMotion", () => {
  it("passes when exactly the declared properties run, waits for them and records them on the part", async () => {
    const tick = part("tick", "opacity 120ms linear, scale 120ms linear", { opacity: "0", scale: "0.5" });
    Object.assign(tick.style, { opacity: "1", scale: "1" });
    await expectMotion(tick, { stem: "checkbox", state: "data-checked", properties: ["scale", "opacity"], reduced: false });
    expect(tick.getAnimations()).toEqual([]);
    expect(taken()).toEqual([{ kind: "state", stem: "checkbox", part: "tick", state: "data-checked", properties: ["opacity", "scale"], reduced: false, dir: "ltr" }]);
  });

  it("checks each property's duration in milliseconds when given them, and records the direction", async () => {
    const box = part("box", "background-color 150ms linear, border-color 150ms linear", { backgroundColor: "white", border: "1px solid white" });
    box.style.direction = "rtl";
    Object.assign(box.style, { backgroundColor: "black", borderColor: "black" });
    await expectMotion(box, { stem: "checkbox", state: "data-checked", properties: { "background-color": 150, "border-color": 150 }, reduced: false });
    expect(taken()).toEqual([{ kind: "state", stem: "checkbox", part: "box", state: "data-checked", properties: ["background-color", "border-color"], reduced: false, dir: "rtl" }]);
  });

  it("fails, and records nothing, when a declared property does not run", async () => {
    const tick = part("tick", "opacity 400ms linear");
    tick.style.opacity = "1";
    await expect(expectMotion(tick, { stem: "checkbox", state: "data-checked", properties: ["opacity", "scale"], reduced: false })).rejects.toThrow(/checkbox data-checked tick: .*missing scale/);
    expect(taken()).toEqual([]);
  });

  it("fails when a property runs that was not declared", async () => {
    const tick = part("tick", "opacity 400ms linear, scale 400ms linear", { opacity: "0", scale: "0.5" });
    Object.assign(tick.style, { opacity: "1", scale: "1" });
    await expect(expectMotion(tick, { stem: "checkbox", state: "data-checked", properties: ["opacity"], reduced: false })).rejects.toThrow(/checkbox data-checked tick: .*extra scale/);
    expect(taken()).toEqual([]);
  });

  it("fails when a duration differs", async () => {
    const tick = part("tick", "opacity 400ms linear");
    tick.style.opacity = "1";
    await expect(expectMotion(tick, { stem: "checkbox", state: "data-checked", properties: { opacity: 240 }, reduced: false })).rejects.toThrow(/opacity runs for 400ms, not 240ms/);
  });

  it("waits for a transition the browser restarts mid-way, and fails on another property that starts meanwhile", async () => {
    // A restyle mid-way (WebKit does it under load) cancels the transition and starts an equal one.
    const restarted = part("tick", "opacity 120ms linear");
    restarted.style.opacity = "1";
    const proof = expectMotion(restarted, { stem: "checkbox", state: "data-checked", properties: ["opacity"], reduced: false });
    restarted.style.opacity = "0.9";
    flushStyle(restarted);
    await proof;
    expect(restarted.getAnimations()).toEqual([]);
    expect(taken()).toHaveLength(1);
    const strayed = part("tick", "opacity 80ms linear, scale 400ms linear");
    strayed.style.opacity = "1";
    const failing = expectMotion(strayed, { stem: "checkbox", state: "data-checked", properties: ["opacity"], reduced: false });
    strayed.style.scale = "0.5";
    await expect(failing).rejects.toThrow(/checkbox data-checked tick: scale started while the expected motion ran/);
    expect(taken()).toEqual([]);
  });

  it("fails when nothing runs on the part", async () => {
    const tick = part("tick", "none");
    tick.style.opacity = "1";
    await expect(expectMotion(tick, { stem: "checkbox", state: "data-checked", properties: ["opacity"], reduced: false })).rejects.toThrow(/checkbox data-checked tick: nothing is running/);
  });

  it("reads a keyframe animation's properties", async () => {
    const tick = part("tick", "none");
    tick.animate([{ opacity: 0 }, { opacity: 1 }], 50);
    // Script animations are not CSS motion: only CSS transitions and animations count.
    await expect(expectMotion(tick, { stem: "checkbox", state: "data-checked", properties: ["opacity"], reduced: false })).rejects.toThrow(/nothing is running/);
    const style = document.createElement("style");
    style.textContent = "@keyframes ouro-motion-probe { from { opacity: 0 } to { opacity: 1 } }";
    document.head.append(style);
    mounted.push(style);
    tick.style.animation = "ouro-motion-probe 80ms linear";
    await expectMotion(tick, { stem: "checkbox", state: "data-checked", properties: { opacity: 80 }, reduced: false });
    expect(taken().map((record) => record.kind === "state" && record.properties)).toEqual([["opacity"]]);
  });

  it("reads the four sides of a shorthand as the shorthand", async () => {
    const box = part("box", "border-color 80ms linear", { border: "1px solid white" });
    box.style.borderColor = "black";
    await expectMotion(box, { stem: "checkbox", state: "data-checked", properties: ["border-color"], reduced: false });
    expect(taken()).toHaveLength(1);
  });

  it("fails when the page's reduced-motion setting is not the one the call names", async () => {
    const tick = part("tick", "opacity 400ms linear");
    tick.style.opacity = "1";
    await expect(expectMotion(tick, { stem: "checkbox", state: "data-checked", properties: ["opacity"], reduced: true })).rejects.toThrow(/reduced: true, but the page does not prefer reduced motion/);
    await commands.emulateMedia({ reducedMotion: "reduce" });
    const second = part("tick", "opacity 80ms linear");
    second.style.opacity = "1";
    await expectMotion(second, { stem: "checkbox", state: "data-checked", properties: ["opacity"], reduced: true });
    expect(taken()).toEqual([{ kind: "state", stem: "checkbox", part: "tick", state: "data-checked", properties: ["opacity"], reduced: true, dir: "ltr" }]);
  });

  it("fails on an element with no part", async () => {
    const bare = part("tick", "opacity 400ms linear");
    delete bare.dataset["ouroPart"];
    bare.style.opacity = "1";
    await expect(expectMotion(bare, { stem: "checkbox", state: "data-checked", properties: ["opacity"], reduced: false })).rejects.toThrow(/checkbox data-checked: the element has no data-ouro-part/);
    await expect(expectNoMotion(bare, { stem: "checkbox", state: "data-checked", reduced: false })).rejects.toThrow(/has no data-ouro-part/);
    expect(taken()).toEqual([]);
  });
});

describe("expectNoMotion", () => {
  it("records an explicit empty set when nothing runs a frame after the change", async () => {
    const box = part("box", "none");
    box.style.opacity = "1";
    await expectNoMotion(box, { stem: "checkbox", state: "data-disabled", reduced: false });
    expect(taken()).toEqual([{ kind: "state", stem: "checkbox", part: "box", state: "data-disabled", properties: [], reduced: false, dir: "ltr" }]);
  });

  it("fails when anything runs on the part", async () => {
    const box = part("box", "opacity 400ms linear");
    box.style.opacity = "1";
    await expect(expectNoMotion(box, { stem: "checkbox", state: "data-disabled", reduced: false })).rejects.toThrow(/checkbox data-disabled box: expected no motion, but opacity is running/);
    expect(taken()).toEqual([]);
  });
});

describe("expectTransition and expectGestureSettle", () => {
  it("record a transition between states and a settled gesture", async () => {
    expectTransition({ stem: "checkbox", from: "data-checked", to: "data-unchecked", interrupt: true });
    const thumb = part("thumb", "none");
    thumb.setAttribute("data-ouro-settling", "");
    requestAnimationFrame(() => thumb.removeAttribute("data-ouro-settling"));
    await expectGestureSettle(thumb, { stem: "checkbox", gesture: "swipe" });
    expect(taken()).toEqual([
      { kind: "transition", stem: "checkbox", from: "data-checked", to: "data-unchecked", interrupt: true },
      { kind: "gesture", stem: "checkbox", gesture: "swipe" },
    ]);
  });

  it("expectGestureSettle fails when no settle is running", async () => {
    await expect(expectGestureSettle(part("thumb", "none"), { stem: "checkbox", gesture: "swipe" })).rejects.toThrow(/checkbox gesture swipe: no settle is running/);
  });
});

describe("motion records", () => {
  it("move into the test's meta when it finishes", async () => {
    // Registered before the helper's own hook, so it runs after it (hooks run as a stack).
    onTestFinished(({ task }) => {
      const meta = task.meta as { motion?: MotionRecord[] };
      expect(meta.motion).toEqual([{ kind: "transition", stem: "checkbox", from: "data-checked", to: "data-unchecked", interrupt: false }]);
      meta.motion = [];
    });
    expectTransition({ stem: "checkbox", from: "data-checked", to: "data-unchecked", interrupt: false });
  });
});

describe("the motion matrix", () => {
  afterEach(cleanupStories);

  // pnpm controls:matrix reads each component.json "motion"; the Node reader checks a part's
  // marker in the source, and this checks it in the rendered stories.
  it.each(motionRows.filter((row) => row.part !== null))("$stem renders its animated part $part", async ({ stem, part }) => {
    const title = stem.replace(/(^|-)([a-z])/g, (_, _dash: string, letter: string) => letter.toUpperCase());
    const own = stories.filter((entry) => entry.id.startsWith(`${title}/`));
    expect(own.length).toBeGreaterThan(0);
    const host = await renderStory(own[0]!.Story);
    await settle();
    expect(host.querySelector(`[data-ouro-part="${part}"]`), `${own[0]!.id} renders no data-ouro-part="${part}"`).not.toBeNull();
  });
});
