import type { ComponentType } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanupStories, renderStoryFirstCommit, selectedStories, settle, stories } from "./stories.tsx";

// The first frame. Content that is ready when it mounts is drawn at full opacity from its first frame: an arrival or an
// entrance fades only what comes in after mount (Moment's art, #1985). Each story's first commit is read before any
// frame has run; an element drawn at opacity 0 or hidden there that is shown once the page settles faded in after its
// first frame. Ouro check's first-paint rules read controls only, and the conformance matrix reads the page at rest, so
// this is the check that sees content fade in.
//
// Only Moment's stories are held to it for now. Seven other components fade content in on mount, most through a CSS
// `starting:` entrance, and 18 of their stories fail this check in Chromium: Hero (10), Composer (2), Porthole (2),
// Celebrate, Button's loading state, Emoji and MessageList (1 each). Each needs a fix or a declared reason before it joins.

/** The elements a story draws at opacity 0 or hidden on its first commit that are shown once the page settles. */
async function fadedInAfterFirstFrame(Story: ComponentType): Promise<string[]> {
  const host = renderStoryFirstCommit(Story);
  const hidden = [...host.querySelectorAll("*")].filter((element) => Number(getComputedStyle(element).opacity) === 0 || getComputedStyle(element).visibility === "hidden");
  await settle();
  return hidden
    .filter((element) => {
      const box = element.getBoundingClientRect();
      return element.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && box.width > 1 && box.height > 1;
    })
    .map((element) => element.outerHTML.slice(0, 160));
}

afterEach(async () => {
  await cleanupStories();
});

describe("first frame guard", () => {
  it("finds content that fades in after its first frame", async () => {
    const FadesIn = () => <p ref={(element) => void element?.animate([{ opacity: 0 }, { opacity: 1 }], 300)}>Late</p>;
    expect(await fadedInAfterFirstFrame(FadesIn)).toHaveLength(1);
  });

  it("finds nothing in content that is ready at mount", async () => {
    expect(await fadedInAfterFirstFrame(() => <p>Ready</p>)).toEqual([]);
  });
});

// Every Moment story exists in every run; a pull request's reduced run renders only the selected folders' stories
// (selectedStories), which may leave Moment out (#2021).
const isMoment = (entry: { id: string }) => entry.id.startsWith("Moment/");
const momentStories = selectedStories.filter(isMoment);

describe("first frame, Moment's stories", () => {
  it("finds Moment's stories to hold to it", () => {
    expect(stories.filter(isMoment).length).toBeGreaterThan(0);
  });

  it.each(momentStories)("$id draws its content at full opacity from its first frame", async ({ Story }) => {
    expect(await fadedInAfterFirstFrame(Story)).toEqual([]);
  });
});
