import type { ComponentType } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { sliced } from "./slice.ts";
import { cleanupStories, renderStoryFirstCommit, selectedStories, settle, stories } from "./stories.tsx";

// The first frame. Content that is ready when it mounts is drawn at full opacity from its first frame: an arrival or an
// entrance fades only what comes in after mount (Moment's art, #1985). Each story's first commit is read before any
// frame has run; an element drawn at opacity 0 or hidden there that is shown once the page settles faded in after its
// first frame. Ouro check's first-paint rules read controls only, and the conformance matrix reads the page at rest, so
// this is the check that sees content fade in.
//
// Every story is held to it. A story that still fades something in is pinned in `firstFrameFindings` with the elements
// and the reason; a new entrance fails, and a pinned entry that no longer fires fails too, so the list only shrinks.

const describe_ = (element: Element) => {
  const part = element.getAttribute("data-ouro-part");
  const item = element.closest("[data-ouro]")?.getAttribute("data-ouro");
  return `${element.localName}${item ? `[data-ouro=${item}]` : ""}${part ? `[data-ouro-part=${part}]` : ""}`;
};

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
    .map(describe_);
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

/** A story that still fades content in on its first frame: the elements, exactly, and why the entrance stays. */
interface FirstFrameFinding {
  elements: string[];
  reason: string;
  /** The finding shows on some runs and not others with nothing changed (a delay against how long the page takes to settle). */
  sometimes?: true;
}

const pin = (ids: string[], elements: string[], reason: string, sometimes?: true): Record<string, FirstFrameFinding> =>
  Object.fromEntries(ids.map((id) => [id, { elements, reason, ...(sometimes && { sometimes }) }]));

/**
 * Findings by story id, each with its reason. A story listed here must fade in exactly these elements, no more and no
 * fewer, so a new entrance fails and an entry goes with the fix that draws its content at full opacity (#1999).
 */
export const firstFrameFindings: Record<string, FirstFrameFinding> = {
  ...pin(
    ["Hero/Column", "Hero/Decorative", "Hero/FullWidth", "Hero/InContext", "Hero/LiveMedia", "Hero/LongLede", "Hero/Playground", "Hero/SmallPicture", "Hero/Stage", "Hero/TrailAndStatus"],
    ["div[data-ouro=hero][data-ouro-part=media]"],
    "Designed motion: the picture's page-load rise is documented and claim-tested, and the picture is not text a person needs at once. motion=\"none\" opts out.",
  ),
  ...pin(["Celebrate/Playground"], ["span[data-ouro=celebrate][data-ouro-part=message]"], "Designed motion: the burst and its message are the moment itself, and they play only when the moment starts."),
  ...pin(["Emoji/Placeholder"], ["img[data-ouro=emoji]"], "Designed motion: the picture is not ready at mount, since it decodes first, and fades in over its placeholder once it has."),
  ...pin(
    ["RouteProgress/Playground"],
    ["div[data-ouro=route-progress][data-ouro-part=bar]"],
    "RouteProgress waits 150ms after `active` before it shows, so a fast navigation shows nothing: the delay is its design, and whether the page has settled past it varies.",
    true,
  ),
};

describe("first frame, every story", () => {
  it("finds the stories to hold to it", () => {
    expect(stories.length).toBeGreaterThan(0);
  });

  it.each(sliced(selectedStories, "first frame"))("$id draws its content at full opacity from its first frame, except what it pins", async ({ id, Story }) => {
    const found = [...new Set(await fadedInAfterFirstFrame(Story))].sort();
    const pinned = firstFrameFindings[id];
    // a finding that shows only sometimes may be missing from a run, but never differ from its pin
    const expected = pinned?.sometimes && found.every((name) => pinned.elements.includes(name)) ? found : (pinned?.elements.toSorted() ?? []);
    expect(found.join(" ; "), `${id} fades in: ${found.join(" ; ")}`).toBe(expected.join(" ; "));
  });

  it("pins only stories that exist, each with a reason", () => {
    const ids = new Set(stories.map((entry) => entry.id));
    for (const [id, finding] of Object.entries(firstFrameFindings)) {
      expect(ids.has(id), `${id} is no story`).toBe(true);
      expect(finding.reason.trim(), `${id} has no reason`).not.toBe("");
    }
  });
});
