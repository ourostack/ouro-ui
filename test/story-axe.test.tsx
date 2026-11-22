import { useEffect, useRef, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Tooltip } from "@/registry/ouro/components/ouro/tooltip/tooltip";
import { Toolbar } from "@/registry/ouro/components/ouro/toolbar/toolbar";
import { scanStoryViolations } from "./story-axe";
import { cleanupStories } from "./stories.tsx";

// The story scan reaches what a person's pointer reaches. Runs in Chromium and WebKit.

// Without this, a later test's "closed" scan finds an earlier test's main still mounted beside
// its own (landmark-no-duplicate-main): #1856 and #1857 never assert the scan is violation-free,
// so neither caught it, but a test that does (below) would fail on leftover DOM, not its own bug.
afterEach(cleanupStories);

const Mic = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2v12" />
  </svg>
);

it("opens a tooltip in a toolbar that auto-hid before the scan reached it (#1856)", async () => {
  await page.viewport(390, 844);
  // Already faded when the scan gets to it, as a slow runner leaves the story's 3 s bar; a pointer move over its area brings it back.
  const Faded = () => {
    const [hidden, setHidden] = useState(true);
    return (
      <div style={{ position: "relative", height: 240 }}>
        <Toolbar label="Call controls" floating autoHide={3000} hidden={hidden} onHiddenChange={setHidden} items={[{ type: "toggle", label: "Mute", icon: Mic, hideLabel: true }]} />
      </div>
    );
  };
  const { phases, text } = await scanStoryViolations("Toolbar/AutoHide", Faded);
  expect(phases).toContain('with the tooltip of "Mute" open');
  expect(text).toBe("");
});

it("hovers a tooltip trigger below the fold once, as before #1857, since nothing covers it", async () => {
  await page.viewport(390, 844);
  // Below the fold, as a MessageList reaction is at 390 px: off screen, nothing is at its centre, though nothing covers it.
  const BelowFold = () => (
    <div style={{ paddingTop: 1600 }}>
      <Tooltip content="Liked by Ana">
        <button type="button">Like, 1</button>
      </Tooltip>
    </div>
  );
  const hover = vi.spyOn(userEvent, "hover");
  try {
    const { phases } = await scanStoryViolations("Tooltip/Playground", BelowFold);
    expect(phases).toContain('with the tooltip of "Like, 1" open');
    // Forced hovers other than parking the pointer off the page.
    expect(hover.mock.calls.filter(([target, options]) => options?.force && target !== document.documentElement).length, "the extra move over the corner").toBe(0);
  } finally {
    hover.mockRestore();
  }
});

it("recovers a trigger that covers itself again while a slow hover waits on it, as Toolbar/AutoHide's did on a loaded runner", async () => {
  await page.viewport(390, 844);
  // Covers itself a beat after any pointer move away from it, and uncovers for one (nudge or real) until the next
  // beat passes: a stand-in for a bar whose own idle timer runs out again while a later hover is still in flight.
  // The beat is long enough to outlast both the round trip to the real browser between the retry's nudge and its
  // next hover attempt, and the tooltip's own 600 ms open delay once the hover lands, as the real bar's own 3000 ms
  // grace period is; a shorter one would make the retry's own overhead, or the tooltip's delay, decide this test.
  const Refades = () => {
    const [cover, setCover] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const rearm = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCover(true), 900);
    };
    useEffect(() => {
      rearm();
      return () => clearTimeout(timer.current);
    }, []);
    return (
      <div
        style={{ position: "relative", height: 60 }}
        onPointerMove={() => {
          setCover(false);
          rearm();
        }}
      >
        <Tooltip content="Liked by Ana">
          <button type="button" style={cover ? { pointerEvents: "none" } : undefined}>
            Like, 1
          </button>
        </Tooltip>
        {cover && <div aria-hidden="true" style={{ position: "absolute", inset: 0 }} />}
      </div>
    );
  };
  const originalHover = userEvent.hover;
  let delayedOnce = false;
  const hover = vi.spyOn(userEvent, "hover").mockImplementation(async (...args) => {
    // Slower than a round trip would otherwise be, once, as a shared event loop can delay the real hover (job
    // 137149132362, 137140709588, ourostack/ouro-ui#2930): by the time it reaches the trigger, Refades has covered it again.
    const [, options] = args;
    if (!options?.force && !delayedOnce) {
      delayedOnce = true;
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    return originalHover.apply(userEvent, args);
  });
  try {
    const { phases, text } = await scanStoryViolations("Tooltip/Playground", Refades);
    expect(phases).toContain('with the tooltip of "Like, 1" open');
    expect(text).toBe("");
  } finally {
    hover.mockRestore();
  }
});
