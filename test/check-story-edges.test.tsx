import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands } from "vitest/browser";
import { knownFindings, knownFor } from "./check-known.ts";
import { checkStory } from "./check-story.ts";
import { sweepStoryCheck } from "./check-sweep.ts";
import { parkPointer, storyScanTimeout } from "./story-axe.ts";
import { cleanupStories, stories } from "./stories.tsx";
import { applyThemeFixture } from "./theme-fixtures.ts";

beforeEach(async () => {
  await commands.emulateMedia({ reducedMotion: "no-preference" });
});
afterEach(async () => {
  await cleanupStories();
  await parkPointer();
});

describe("stories pass Ouro check's rules", () => {
  it("checks a running progress bar after it appears without its trickle preventing a stable scan", async () => {
    const entry = stories.find(({ id }) => id === "RouteProgress/Playground")!;
    const findings = await checkStory(entry.Story, "padded");
    const bar = document.querySelector<HTMLElement>('[data-ouro="route-progress"] [data-ouro-part="bar"]')!;
    const indicator = bar.querySelector<HTMLElement>('[data-ouro-part="indicator"]')!;
    expect(bar.hasAttribute("data-open")).toBe(true);
    expect(indicator.style.getPropertyValue("--ouro-route-progress")).toBe("0.15");
    expect(findings.filter(({ rule }) => rule === "pane-edge" || rule === "cut-off-edge")).toEqual([]);
  }, storyScanTimeout);

  it("keeps pane and cut-off edges out of the known findings", () => {
    expect(knownFindings.filter(({ rule }) => rule === "pane-edge" || rule === "cut-off-edge")).toEqual([]);
  });

  it.each(["Message/Posts", "Message/Thread", "ThreadLayout/Default", "MessageList/WithFloatingComposer"])(
    "%s keeps its edges clear under a stock theme at desktop widths",
    async (id) => {
      const entry = stories.find((candidate) => candidate.id === id)!;
      const remove = applyThemeFixture("nova");
      try {
        await sweepStoryCheck({
          id,
          Story: entry.Story,
          sizes: [[1280, 800], [2560, 1440]],
          schemes: ["light", "dark"],
          known: knownFor(knownFindings, id, "nova"),
          inherited: knownFor(knownFindings, id),
          restore: [390, 844],
        });
      } finally {
        remove();
      }
    },
    2 * storyScanTimeout,
  );
});
