import { afterEach, describe, expect, it, onTestFinished } from "vitest";
import { commands } from "vitest/browser";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { cleanupStories, isVisible, renderStory, settle, stories } from "./stories.tsx";
import { expectGestureSettle, expectMotion, expectNoMotion, expectTransition, motionRows, parseDuration, STATE_ATTRIBUTES, takeMotionRecords, type MotionRecord } from "./motion.ts";

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

/**
 * A part that starts at `from`, styled with `transition`, ready to change, inside an element in the
 * component root (`data-ouro="fixture"`) in the states the fixtures claim (`data-checked`,
 * `data-disabled`).
 */
function part(name: string, transition: string, from: Partial<CSSStyleDeclaration> = { opacity: "0" }, states: string[] = ["data-checked", "data-disabled"]): HTMLElement {
  const root = document.createElement("div");
  root.dataset["ouro"] = "fixture";
  for (const state of states) root.setAttribute(state, "");
  const element = document.createElement("div");
  element.dataset["ouroPart"] = name;
  element.style.cssText = `width: 20px; height: 20px; transition: ${transition}`;
  Object.assign(element.style, from);
  root.append(element);
  document.body.append(root);
  mounted.push(root);
  flushStyle(element);
  return element;
}

/** Waits for the next frame. */
const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

/** Makes the browser compute the element's style now, so a later change transitions from it. */
const flushStyle = (element: Element) => void getComputedStyle(element).opacity;

/**
 * The element's animations that have not finished. Not `getAnimations()` alone: WebKit lists a
 * finished transition there until its next animation update, and for a composited one (opacity,
 * scale) that update is set by a timer that can trail the frame in which it finished.
 */
const unfinished = (element: Element) => element.getAnimations().filter((animation) => animation.playState !== "finished");

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
    const started = tick.getAnimations();
    await expectMotion(tick, { stem: "checkbox", state: "data-checked", properties: ["scale", "opacity"], reduced: false });
    expect(started.map((animation) => animation.playState)).toEqual(["finished", "finished"]);
    expect(unfinished(tick)).toEqual([]);
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

  it("fails when the part is not in the state it claims, and finds a state with a value on an element around it", async () => {
    const outside = part("tick", "opacity 400ms linear", { opacity: "0" }, []);
    outside.style.opacity = "1";
    await expect(expectMotion(outside, { stem: "checkbox", state: "data-checked", properties: ["opacity"], reduced: false })).rejects.toThrow(/checkbox data-checked tick: the part is not in data-checked: neither it nor an element around it inside its \[data-ouro="fixture"\] root has \[data-checked\]/);
    await expect(expectNoMotion(outside, { stem: "checkbox", state: "data-disabled", reduced: false })).rejects.toThrow(/the part is not in data-disabled/);
    const swiped = part("thumb", "opacity 60ms linear", { opacity: "0" }, []);
    swiped.parentElement!.setAttribute("data-swiping", "right");
    swiped.style.opacity = "1";
    await expect(expectMotion(swiped, { stem: "checkbox", state: "data-swiping=left", properties: ["opacity"], reduced: false })).rejects.toThrow(/has \[data-swiping="left"\]/);
    await expectMotion(swiped, { stem: "checkbox", state: "data-swiping=right", properties: ["opacity"], reduced: false });
    expect(taken()).toEqual([{ kind: "state", stem: "checkbox", part: "thumb", state: "data-swiping=right", properties: ["opacity"], reduced: false, dir: "ltr" }]);
  });

  it("finds the state only inside the part's own component, not on a component or overlay around it", async () => {
    // A Checkbox in a checked Checklist row: the row's data-checked is not the Checkbox's.
    const tick = part("tick", "opacity 400ms linear", { opacity: "0" }, []);
    const row = document.createElement("div");
    row.dataset["ouro"] = "checklist";
    row.setAttribute("data-checked", "");
    row.setAttribute("data-open", "");
    tick.parentElement!.replaceWith(row);
    row.append(tick.parentElement!);
    mounted.push(row);
    tick.style.opacity = "1";
    await expect(expectMotion(tick, { stem: "checkbox", state: "data-checked", properties: ["opacity"], reduced: false })).rejects.toThrow(/inside its \[data-ouro="fixture"\] root has \[data-checked\]/);
    await expect(expectNoMotion(tick, { stem: "checkbox", state: "data-open", reduced: false })).rejects.toThrow(/the part is not in data-open/);
    const loose = document.createElement("div");
    loose.dataset["ouroPart"] = "tick";
    loose.setAttribute("data-checked", "");
    document.body.append(loose);
    mounted.push(loose);
    await expect(expectNoMotion(loose, { stem: "checkbox", state: "data-checked", reduced: false })).rejects.toThrow(/checkbox data-checked tick: the part is in no component root/);
    expect(taken()).toEqual([]);
  });

  it("waits for a transition the browser restarts mid-way, and fails on another property that starts meanwhile", async () => {
    // A restyle mid-way cancels the transition and starts an equal one in its place.
    const restarted = part("tick", "opacity 120ms linear");
    restarted.style.opacity = "1";
    const proof = expectMotion(restarted, { stem: "checkbox", state: "data-checked", properties: ["opacity"], reduced: false });
    restarted.style.opacity = "0.9";
    flushStyle(restarted);
    await proof;
    expect(unfinished(restarted)).toEqual([]);
    expect(taken()).toHaveLength(1);
    const strayed = part("tick", "opacity 80ms linear, scale 400ms linear");
    strayed.style.opacity = "1";
    const failing = expectMotion(strayed, { stem: "checkbox", state: "data-checked", properties: ["opacity"], reduced: false });
    strayed.style.scale = "0.5";
    await expect(failing).rejects.toThrow(/checkbox data-checked tick: scale started while the expected motion ran/);
    expect(taken()).toEqual([]);
  });

  it("fails when a transition is cancelled early with nothing in its place", async () => {
    const tick = part("tick", "opacity 400ms linear");
    tick.style.opacity = "1";
    const proof = expectMotion(tick, { stem: "checkbox", state: "data-checked", properties: ["opacity"], reduced: false });
    await frame();
    tick.style.transition = "none";
    flushStyle(tick);
    await expect(proof).rejects.toThrow(/checkbox data-checked tick: opacity was cancelled \d+% of the way through its duration with nothing in its place/);
    expect(taken()).toEqual([]);
  });

  /** What the browser reports beginning and ending on the element itself, as `"<event> <property or animation name>"`. */
  function heard(element: Element): string[] {
    const events: string[] = [];
    for (const type of ["transitionrun", "transitionend", "transitioncancel", "animationstart", "animationend", "animationcancel"]) {
      element.addEventListener(type, (event) => {
        if (event.target === element) events.push(`${type} ${event instanceof TransitionEvent ? event.propertyName : (event as AnimationEvent).animationName}`);
      });
    }
    return events;
  }

  // A restyle cancels a transition and starts one in its place; on a slow frame that one can run
  // its whole course before the helper reads again. Finishing it (`finish()`) stands for that frame.
  it("waits for a transition restarted and ended between two reads", async () => {
    const tick = part("tick", "opacity 400ms linear");
    const ran = heard(tick);
    tick.style.opacity = "1";
    const [cancelled] = tick.getAnimations();
    const proof = expectMotion(tick, { stem: "checkbox", state: "data-checked", properties: ["opacity"], reduced: false });
    tick.style.opacity = "0.5";
    flushStyle(tick);
    const [replacement] = tick.getAnimations();
    expect(replacement).not.toBe(cancelled);
    expect(cancelled!.playState).toBe("idle");
    replacement!.finish();
    await proof;
    expect(ran).toEqual(expect.arrayContaining(["transitionrun opacity", "transitionend opacity"]));
    expect(taken()).toHaveLength(1);
  });

  it("waits for a CSS animation restarted and ended between two reads", async () => {
    const style = document.createElement("style");
    style.textContent = "@keyframes ouro-motion-restart { from { opacity: 0 } to { opacity: 1 } }";
    document.head.append(style);
    mounted.push(style);
    const tick = part("tick", "none");
    const ran = heard(tick);
    tick.style.animation = "ouro-motion-restart 400ms linear";
    const [cancelled] = tick.getAnimations();
    const proof = expectMotion(tick, { stem: "checkbox", state: "data-checked", properties: ["opacity"], reduced: false });
    tick.style.animation = "none";
    flushStyle(tick);
    tick.style.animation = "ouro-motion-restart 400ms linear";
    flushStyle(tick);
    const [replacement] = tick.getAnimations();
    expect(replacement).not.toBe(cancelled);
    replacement!.finish();
    await proof;
    expect(ran).toEqual(expect.arrayContaining(["animationstart ouro-motion-restart", "animationend ouro-motion-restart"]));
    expect(taken()).toHaveLength(1);
  });

  it("fails when a transition is cancelled before the next read with nothing in its place", async () => {
    const tick = part("tick", "opacity 400ms linear");
    tick.style.opacity = "1";
    const proof = expectMotion(tick, { stem: "checkbox", state: "data-checked", properties: ["opacity"], reduced: false });
    tick.style.transition = "none";
    flushStyle(tick);
    await expect(proof).rejects.toThrow(/checkbox data-checked tick: opacity was cancelled 0% of the way through its duration with nothing in its place/);
    expect(taken()).toEqual([]);
  });

  it("fails when what ran and ended between two reads in a cancelled transition's place is another property", async () => {
    const tick = part("tick", "opacity 400ms linear, scale 400ms linear", { opacity: "0", scale: "0.5" });
    const ran = heard(tick);
    tick.style.opacity = "1";
    const proof = expectMotion(tick, { stem: "checkbox", state: "data-checked", properties: ["opacity"], reduced: false });
    tick.style.transition = "scale 400ms linear";
    tick.style.scale = "1";
    flushStyle(tick);
    const [scale] = tick.getAnimations();
    expect((scale as CSSTransition).transitionProperty).toBe("scale");
    scale!.finish();
    await expect(proof).rejects.toThrow(/checkbox data-checked tick: opacity was cancelled 0% of the way through its duration with nothing in its place/);
    expect(ran).toContain("transitionend scale");
    expect(taken()).toEqual([]);
  });

  it("fails when the transition that took a cancelled one's place is itself cancelled before the next read", async () => {
    const tick = part("tick", "opacity 400ms linear");
    const ran = heard(tick);
    tick.style.opacity = "1";
    // Runs in the next frame before the helper reads it: after the browser has started the
    // replacement (its transitionrun is sent first), it cancels it.
    requestAnimationFrame(() => {
      tick.style.transition = "none";
      flushStyle(tick);
    });
    const proof = expectMotion(tick, { stem: "checkbox", state: "data-checked", properties: ["opacity"], reduced: false });
    tick.style.opacity = "0.5";
    flushStyle(tick);
    await expect(proof).rejects.toThrow(/checkbox data-checked tick: opacity was cancelled 0% of the way through its duration with nothing in its place/);
    expect(ran).toContain("transitionrun opacity");
    await expect.poll(() => ran).toContain("transitioncancel opacity");
    expect(ran).not.toContain("transitionend opacity");
    expect(taken()).toEqual([]);
  });

  /**
   * Starts a 1s eased opacity transition, lets the helper see it with exactly `elapsed` of its time
   * run, then cancels it while it runs. The transition is held at that time for the frame the
   * helper reads it in: waiting for frames to carry it there lets one slow frame carry it past
   * the mark, or to its end before it can be cancelled.
   */
  async function cancelAt(elapsed: number) {
    const tick = part("tick", "opacity 1000ms var(--ouro-ease-out)");
    tick.style.opacity = "1";
    const [transition] = tick.getAnimations();
    const proof = expectMotion(tick, { stem: "checkbox", state: "data-checked", properties: ["opacity"], reduced: false });
    transition!.pause();
    transition!.currentTime = elapsed * 1000;
    await frame();
    transition!.play();
    expect(transition!.playState).toBe("running");
    expect(transition!.currentTime).toBe(elapsed * 1000);
    // --ouro-ease-out is past 90% of its progress well before half its time.
    if (elapsed < 0.9) expect(transition!.effect!.getComputedTiming().progress).toBeGreaterThan(0.9);
    tick.style.transition = "none";
    flushStyle(tick);
    expect(transition!.playState).toBe("idle");
    return proof;
  }

  it("measures a cancelled transition by the time it ran, not its eased progress", async () => {
    await expect(cancelAt(0.5)).rejects.toThrow(/checkbox data-checked tick: opacity was cancelled 50% of the way through its duration with nothing in its place/);
    expect(taken()).toEqual([]);
  });

  it("lets a transition end that the browser cancels once it has run 90% of its duration", async () => {
    await cancelAt(0.95);
    expect(taken()).toHaveLength(1);
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

  const pascal = (stem: string) => stem.replace(/(^|-)([a-z])/g, (_, _dash: string, letter: string) => letter.toUpperCase());

  // A state the component exposes on an animated part or its root must be in its map, or its
  // motion goes unproved: every story, as it renders and after each of its controls is clicked once.
  it.each([...new Set(motionRows.map((row) => row.stem))])("%s's stories expose no state its motion map leaves out", async (stem) => {
    const declared = new Set(motionRows.filter((row) => row.stem === stem).map((row) => row.state));
    const parts = new Set(motionRows.filter((row) => row.stem === stem && row.part !== null).map((row) => row.part!));
    const own = stories.filter((entry) => entry.id.startsWith(`${pascal(stem)}/`));
    expect(own.length).toBeGreaterThan(0);
    const undeclared = new Set<string>();
    const seen = new Set<string>();
    // The whole page, not only the story host: a component may keep its root in a portal (X-ray's layer).
    const collect = (where: string) => {
      const roots = [...document.querySelectorAll(`[data-ouro="${stem}"]`)];
      const animated = [...document.querySelectorAll("[data-ouro-part]")].filter((element) => parts.has(element.getAttribute("data-ouro-part")!) && element.closest("[data-ouro]")?.getAttribute("data-ouro") === stem);
      for (const element of [...roots, ...animated]) {
        for (const { name, value } of element.attributes) {
          if (!STATE_ATTRIBUTES.includes(name)) continue;
          const state = value ? `${name}=${value}` : name;
          seen.add(name);
          if (!declared.has(name) && !declared.has(state)) undeclared.add(`${state} on ${element.getAttribute("data-ouro-part") ?? "the root"} (${where})`);
        }
      }
    };
    for (const { id, Story } of own) {
      // As it changes too: a state may last only while the component enters (X-ray's data-starting-style).
      const changes = new MutationObserver(() => collect(`${id} as it changes`));
      changes.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: [...STATE_ATTRIBUTES] });
      await renderStory(Story);
      collect(`${id} as it mounts`);
      await settle();
      collect(`${id} as rendered`);
      const controls = [...document.querySelectorAll<HTMLElement>(`[data-ouro-control="${stem}"]`)].filter((element) => isVisible(element) && !element.closest('[aria-hidden="true"]') && element.tabIndex !== -1);
      for (const [index, control] of controls.entries()) {
        await act(() => control.click());
        await settle();
        collect(`${id} after clicking control ${index + 1}`);
      }
      changes.disconnect();
      await cleanupStories();
    }
    expect([...undeclared].sort(), `declare these states in ${stem}'s component.json "motion"`).toEqual([]);
    // The scan reads the states the stories reach, so it found some.
    expect(seen.size).toBeGreaterThan(0);
  }, 60_000);

  // pnpm controls:matrix reads each component.json "motion"; the Node reader checks a part's
  // marker in the source, and this checks it in the rendered stories.
  it.each(motionRows.filter((row) => row.part !== null))("$stem renders its animated part $part", async ({ stem, part }) => {
    const own = stories.filter((entry) => entry.id.startsWith(`${pascal(stem)}/`));
    expect(own.length).toBeGreaterThan(0);
    // Some story renders it (Checklist's Empty story renders no row).
    const found: string[] = [];
    for (const { id, Story } of own) {
      const host = await renderStory(Story);
      await settle();
      if (host.ownerDocument.querySelector(`[data-ouro-part="${part}"]`)) found.push(id);
      await cleanupStories();
    }
    expect(found, `no ${stem} story renders data-ouro-part="${part}"`).not.toEqual([]);
  });
});
