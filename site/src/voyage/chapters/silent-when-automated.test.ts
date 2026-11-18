import { afterEach, expect, it, vi } from "vitest";
import { playClicks } from "../../apple/haptics";
import { playTune } from "./chapter-three";

afterEach(() => {
  Object.defineProperty(navigator, "webdriver", { value: false, configurable: true });
  vi.unstubAllGlobals();
});

it("makes no audio context in an automated browser, so an agent's page never makes a sound", () => {
  Object.defineProperty(navigator, "webdriver", { value: true, configurable: true });
  const made: string[] = [];
  vi.stubGlobal(
    "AudioContext",
    class {
      constructor() {
        made.push("made");
      }
    },
  );
  playTune();
  playClicks([{ at: 0, sharpness: 0.5, strength: 0.5 }]);
  expect(made).toEqual([]);
});
