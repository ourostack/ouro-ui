import { useState } from "react";
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
  // Covers itself the moment the scan's first unforced hover begins, and uncovers on the next pointer move (the
  // retry's nudge): a stand-in for a bar whose own idle timer runs out again while a later hover is still in
  // flight. The cover is set with pointerEvents on the trigger itself, as Toolbar's own fade does on its root
  // (toolbar.tsx's fadeClass), not a covering sibling: a sibling overlay leaves the browser's last-hovered target
  // stale once it is removed, so the trigger's own pointerenter never fires again and the tooltip never opens no
  // matter how long a wait allows (job 137188100324, ourostack/ouro-ui#2937) — this component instead lets the
  // real DOM mutation the fade performs produce a genuine pointerenter, so it stays bounded and does not depend on
  // a loaded runner. The cover is driven directly by the mock below, not by a timer racing the hover's own round
  // trip, since a timer tuned to outlast that round trip once raced the tooltip's own open delay too and lost on
  // one, kept covering the trigger again every beat, long after the hover it was written for had recovered from it.
  let recover: (() => void) | undefined;
  const Refades = () => {
    const [cover, setCover] = useState(false);
    recover = () => setCover(true);
    return (
      <div style={{ position: "relative", height: 60 }} onPointerMove={() => setCover(false)}>
        <Tooltip content="Liked by Ana">
          <button type="button" style={cover ? { pointerEvents: "none" } : undefined}>
            Like, 1
          </button>
        </Tooltip>
      </div>
    );
  };
  const originalHover = userEvent.hover;
  let coveredOnce = false;
  const hover = vi.spyOn(userEvent, "hover").mockImplementation(async (...args) => {
    const [, options] = args;
    if (!options?.force && !coveredOnce) {
      coveredOnce = true;
      recover?.();
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
