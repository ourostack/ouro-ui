import { afterEach, describe, expect, it, vi } from "vitest";
import { commands } from "vitest/browser";
import { nearest, project, rubberband, spring, springAt } from "@/registry/ouro/lib/ouro/spring";

afterEach(async () => {
  vi.restoreAllMocks();
  await commands.emulateMedia({ reducedMotion: "no-preference" });
});

/** Samples a spring every 4ms for `ms`. */
function sample(from: number, to: number, velocity: number, config: { response?: number; damping?: number } = {}, ms = 1500) {
  const values: number[] = [];
  for (let elapsed = 0; elapsed <= ms; elapsed += 4) values.push(springAt(from, to, velocity, elapsed, config).value);
  return values;
}

const frames = (count: number) =>
  new Promise<void>((resolve) => {
    const next = (left: number) => (left === 0 ? resolve() : requestAnimationFrame(() => next(left - 1)));
    next(count);
  });

describe("spring", () => {
  it("starts at the live value with the velocity it was handed, in px per millisecond", () => {
    for (const damping of [1, 0.8]) {
      const start = springAt(40, 200, 0.9, 0, { damping });
      expect(start.value).toBe(40);
      expect(start.velocity).toBeCloseTo(0.9, 9);
      // A moment later it has moved the way the velocity points, at that speed.
      expect(springAt(40, 200, 0.9, 0.1, { damping }).value).toBeCloseTo(40.09, 2);
      expect(springAt(40, 200, -0.9, 0.1, { damping }).value).toBeCloseTo(39.91, 2);
    }
  });

  it("settles on its target without passing it when critically damped, the default", () => {
    const values = sample(0, 100, 0);
    expect(Math.max(...values)).toBeLessThanOrEqual(100);
    // It only ever moves toward the target.
    for (let index = 1; index < values.length; index++) expect(values[index]!).toBeGreaterThanOrEqual(values[index - 1]!);
    expect(values.at(-1)).toBeCloseTo(100, 3);
    expect(springAt(0, 100, 0, 1500).velocity).toBeCloseTo(0, 5);
    // A damping ratio above 1 is treated as 1: this helper has no slower-than-critical spring.
    expect(springAt(0, 100, 0, 100, { damping: 3 })).toEqual(springAt(0, 100, 0, 100));
  });

  it("passes its target a little and comes back when under-damped", () => {
    const values = sample(0, 100, 0, { damping: 0.8 });
    const peak = Math.max(...values);
    expect(peak).toBeGreaterThan(100.5);
    expect(peak).toBeLessThan(105);
    expect(values.at(-1)).toBeCloseTo(100, 2);
  });

  it("reaches its target sooner with a shorter response", () => {
    expect(springAt(0, 100, 0, 100, { response: 0.2 }).value).toBeGreaterThan(springAt(0, 100, 0, 100, { response: 0.5 }).value);
  });

  it("agrees with a step-by-step simulation of the same spring", () => {
    for (const damping of [1, 0.8, 0.5]) {
      const response = 0.3;
      const omega = (2 * Math.PI) / response;
      let value = 30;
      let speed = -400;
      const step = 1 / 100_000;
      for (let time = 0; time < 0.2; time += step) {
        speed += (-omega * omega * (value - 120) - 2 * damping * omega * speed) * step;
        value += speed * step;
      }
      const exact = springAt(30, 120, -0.4, 200, { response, damping });
      expect(exact.value).toBeCloseTo(value, 1);
      expect(exact.velocity * 1000).toBeCloseTo(speed, 0);
    }
  });

  it("projects where a flick would come to rest", () => {
    // Apple's function: position + velocity * d / (1 - d), with d 0.998.
    expect(project(100, 1)).toBeCloseTo(599, 6);
    expect(project(100, -0.5)).toBeCloseTo(-149.5, 6);
    expect(project(40, 0)).toBe(40);
    expect(project(0, 1, 0.99)).toBeCloseTo(99, 6);
  });

  it("resists more the further past a boundary, and never stops dead", () => {
    expect(rubberband(0, 300)).toBe(0);
    expect(rubberband(100, 300)).toBeCloseTo((100 * 300 * 0.55) / (300 + 55), 9);
    expect(rubberband(-100, 300)).toBeCloseTo(-rubberband(100, 300), 9);
    // Each further 100px moves it less, and it stays short of the dimension.
    const steps = [100, 200, 300, 400].map((over) => rubberband(over, 300));
    for (let index = 1; index < steps.length; index++) {
      expect(steps[index]!).toBeGreaterThan(steps[index - 1]!);
      if (index > 1) expect(steps[index]! - steps[index - 1]!).toBeLessThan(steps[index - 1]! - steps[index - 2]!);
    }
    expect(rubberband(1_000_000, 300)).toBeLessThan(300);
    expect(rubberband(100, 300, 0.2)).toBeLessThan(rubberband(100, 300));
  });

  it("finds the snap point nearest a value", () => {
    expect(nearest([0, 120, 360], 70)).toBe(120);
    expect(nearest([0, 120, 360], 50)).toBe(0);
    expect(nearest([0, 120, 360], 900)).toBe(360);
    // The first of two equally near, and the value itself with nowhere to snap.
    expect(nearest([0, 100], 50)).toBe(0);
    expect(nearest([], 42)).toBe(42);
    // With project: a flick from 40 at 0.3px/ms lands near 190, so it snaps to 120, not 0.
    expect(nearest([0, 120, 360], project(40, 0.3))).toBe(120);
  });

  describe("on animation frames", () => {
    it("moves from the live value to the target, ends exactly on it and says when it rests", async () => {
      const seen: [number, number][] = [];
      const onRest = vi.fn();
      const handle = spring({ from: 0, to: 100, onUpdate: (value, velocity) => seen.push([value, velocity]), onRest });
      expect(handle.running).toBe(true);
      await expect.poll(() => onRest.mock.calls.length, { timeout: 3000 }).toBe(1);
      expect(seen.at(-1)).toEqual([100, 0]);
      expect(Math.max(...seen.map(([value]) => value))).toBeLessThanOrEqual(100);
      expect(seen.length).toBeGreaterThan(3);
      // On the way it reports a velocity toward the target, in px/ms.
      expect(seen[1]![1]).toBeGreaterThan(0);
      expect(seen[1]![1]).toBeLessThan(5);
      expect(handle.running).toBe(false);
      expect(handle.stop()).toEqual({ value: 100, velocity: 0 });
    });

    it("carries the release velocity, and bounces only when asked to", async () => {
      const flicked: number[] = [];
      const placed: number[] = [];
      const rest = vi.fn();
      // After a flick the caller passes 0.8; the default stays critically damped.
      spring({ from: 0, to: 100, velocity: 0.3, damping: 0.8, onUpdate: (value) => flicked.push(value), onRest: rest });
      spring({ from: 0, to: 100, velocity: 0.3, onUpdate: (value) => placed.push(value), onRest: rest });
      await expect.poll(() => rest.mock.calls.length, { timeout: 3000 }).toBe(2);
      expect(Math.max(...flicked)).toBeGreaterThan(100.5);
      expect(Math.max(...placed)).toBeLessThanOrEqual(100);
      expect(flicked.at(-1)).toBe(100);
      // A velocity away from the target carries the value that way first.
      const away: number[] = [];
      spring({ from: 0, to: 100, velocity: -2, response: 0.2, onUpdate: (value) => away.push(value), onRest: rest });
      await expect.poll(() => rest.mock.calls.length, { timeout: 3000 }).toBe(3);
      expect(Math.min(...away)).toBeLessThan(-5);
      expect(away.at(-1)).toBe(100);
    });

    it("can be stopped mid-flight, and says where it was and how fast", async () => {
      const seen: number[] = [];
      const onRest = vi.fn();
      const handle = spring({ from: 0, to: 300, onUpdate: (value) => seen.push(value), onRest });
      await expect.poll(() => seen.length).toBeGreaterThan(2);
      const held = handle.stop();
      expect(handle.running).toBe(false);
      expect(held.value).toBeGreaterThanOrEqual(seen.at(-1)!);
      expect(held.value).toBeLessThan(300);
      expect(held.velocity).toBeGreaterThan(0);
      const count = seen.length;
      await frames(2);
      // Stopped: no more updates, no rest, and a second stop says the same.
      expect(seen.length).toBe(count);
      expect(onRest).not.toHaveBeenCalled();
      expect(handle.stop()).toEqual(held);
    });

    it("moves to a new target from where it is, keeping its velocity", async () => {
      const seen: number[] = [];
      const onRest = vi.fn();
      const handle = spring({ from: 0, to: 300, onUpdate: (value) => seen.push(value), onRest });
      await expect.poll(() => seen.at(-1) ?? 0).toBeGreaterThan(60);
      const before = seen.at(-1)!;
      handle.retarget(0);
      expect(handle.running).toBe(true);
      await expect.poll(() => onRest.mock.calls.length, { timeout: 3000 }).toBe(1);
      expect(seen.at(-1)).toBe(0);
      // No jump at the turn: the next frame is near the last one, and it kept going up a little before it turned.
      const turn = seen.indexOf(before);
      expect(Math.abs(seen[turn + 1]! - before)).toBeLessThan(60);
      expect(Math.max(...seen.slice(turn))).toBeGreaterThanOrEqual(before);
      // At rest it can be sent off again.
      handle.retarget(50);
      expect(handle.running).toBe(true);
      await expect.poll(() => onRest.mock.calls.length, { timeout: 3000 }).toBe(2);
      expect(seen.at(-1)).toBe(50);
    });

    it("rests at once when it starts on its target with no velocity", async () => {
      const onUpdate = vi.fn();
      const onRest = vi.fn();
      spring({ from: 80, to: 80, onUpdate, onRest });
      await expect.poll(() => onRest.mock.calls.length).toBe(1);
      expect(onUpdate.mock.calls).toEqual([[80, 0]]);
    });

    it("needs no onRest", async () => {
      const seen: number[] = [];
      const handle = spring({ from: 0, to: 10, onUpdate: (value) => seen.push(value) });
      await expect.poll(() => handle.running, { timeout: 3000 }).toBe(false);
      expect(seen.at(-1)).toBe(10);
    });

    it("jumps to the target and rests, before it returns, with reduced motion", async () => {
      await commands.emulateMedia({ reducedMotion: "reduce" });
      const onUpdate = vi.fn();
      const onRest = vi.fn();
      const asked = vi.spyOn(window, "requestAnimationFrame");
      const handle = spring({ from: 0, to: 100, velocity: 2, damping: 0.8, onUpdate, onRest });
      expect(onUpdate.mock.calls).toEqual([[100, 0]]);
      expect(onRest).toHaveBeenCalledTimes(1);
      expect(handle.running).toBe(false);
      expect(asked).not.toHaveBeenCalled();
      expect(handle.stop()).toEqual({ value: 100, velocity: 0 });
      // A new target is a jump too.
      handle.retarget(20);
      expect(onUpdate.mock.calls.at(-1)).toEqual([20, 0]);
      expect(onRest).toHaveBeenCalledTimes(2);
      expect(asked).not.toHaveBeenCalled();
    });
  });
});
