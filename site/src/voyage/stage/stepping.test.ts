import { afterEach, describe, expect, it, vi } from "vitest";
import type { SceneState } from "./scene";
import { markStep } from "./stepping";

/** A whole SceneState, with only the fields a case cares about given explicitly. */
const state = (overrides: Partial<SceneState> = {}): SceneState => ({
  depth: 0,
  band: "sunlit",
  tanks: 0,
  dived: false,
  lights: false,
  speed: "half",
  dives: 0,
  rings: 0,
  ...overrides,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("markStep", () => {
  it(
    "reads the before state the caller hands it, not a history of its own: a small step is stepping only once an " +
      "earlier jump's or field change's fade has had time to finish, and neither suppressing nor finishing the " +
      "fade changes its end time",
    () => {
      const root = document.createElement("div");
      const now = vi.spyOn(performance, "now");

      // A jump (depth 0 to 200) is never a step, whatever the clock reads, and it starts a fresh fade window.
      now.mockReturnValue(0);
      markStep(root, state({ depth: 0 }), state({ depth: 200 }));
      expect(root.hasAttribute("data-stepping")).toBe(false);

      // A small step (10 fathoms, under the 30-fathom threshold) that lands while the jump is still fading
      // is not marked stepping, and it does not cut that fade short or push its end further out.
      now.mockReturnValue(300);
      markStep(root, state({ depth: 200 }), state({ depth: 210 }));
      expect(root.hasAttribute("data-stepping")).toBe(false);

      // The same size of step, once the jump's 700 ms fade window has passed, is marked stepping.
      now.mockReturnValue(800);
      markStep(root, state({ depth: 210 }), state({ depth: 220 }));
      expect(root.hasAttribute("data-stepping")).toBe(true);

      // A small depth change that also changes another field (not just the lever) is not a step, and, because
      // it is not a step, it starts its own fresh fade window from this moment.
      now.mockReturnValue(900);
      markStep(root, state({ depth: 220 }), state({ depth: 225, band: "twilight" }));
      expect(root.hasAttribute("data-stepping")).toBe(false);

      // Right after that field change, even a small depth-only step is still inside its fade window.
      now.mockReturnValue(1200);
      markStep(root, state({ depth: 225, band: "twilight" }), state({ depth: 230, band: "twilight" }));
      expect(root.hasAttribute("data-stepping")).toBe(false);

      // Once that window has passed too, the small step is marked stepping again.
      now.mockReturnValue(1650);
      markStep(root, state({ depth: 230, band: "twilight" }), state({ depth: 235, band: "twilight" }));
      expect(root.hasAttribute("data-stepping")).toBe(true);
    },
  );

  it("takes the before state from its caller rather than keeping one of its own, so a call with no history (undefined) reads as a jump", () => {
    // scene.tsx tracks the history itself (synchronously, on every render) and hands it in, rather than markStep
    // inferring it from whichever call happened to run last: a call with an explicit undefined before, as a fresh
    // root's first press gets, is never mistaken for a step just because some other root's history looks small.
    const root = document.createElement("div");
    const now = vi.spyOn(performance, "now");
    now.mockReturnValue(800);
    markStep(root, undefined, state({ depth: 10 }));
    expect(root.hasAttribute("data-stepping")).toBe(false);
  });
});
