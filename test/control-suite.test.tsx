import { afterEach, describe, expect, it } from "vitest";
import { reopener } from "./control-suite.tsx";
import { cleanupStories, renderStory } from "./stories.tsx";

// Regression for #2948: a MessageList moves its one shared action bar to whichever row is
// current, so the trigger a first overlayOpeners() query found can be briefly gone from the page
// (while the bar is mid-move to another row) before it lands on its row again. reopener() must
// wait for the named opener to come back instead of grabbing whatever a fresh query returns at
// the same index, which can be a different opener or none at all.

afterEach(async () => {
  await cleanupStories();
});

describe("reopener", () => {
  it("waits for a named opener that briefly leaves the page to come back", async () => {
    const host = await renderStory(() => (
      <button type="button" aria-haspopup="menu">
        Moving opener
      </button>
    ));
    // The bar leaves this row (as it does while the pointer or focus moves to another one) and
    // comes back a moment later: the opener is gone from the DOM, then present again.
    const button = host.querySelector("button")!;
    button.remove();
    setTimeout(() => host.append(button), 50);
    const opener = await reopener("control-suite-reopener-spec", host, "Moving opener", {});
    expect(opener.name).toBe("Moving opener");
  });

  it("names the opener it never finds again", async () => {
    const host = await renderStory(() => <div />);
    await expect(reopener("control-suite-reopener-spec", host, "Gone for good", {})).rejects.toThrow('"Gone for good" is no longer there to open');
  }, 15_000);
});
