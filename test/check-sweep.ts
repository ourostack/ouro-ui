import type { ComponentType } from "react";
import { inject } from "vitest";
import { page, server } from "vitest/browser";
import { checkStory } from "./check-story.ts";
import { judgedOn, sweepVerdict, type KnownFinding } from "./check-known.ts";
import { parkPointer } from "./story-axe.ts";
import { cleanupStories, setScheme, type ComposedStory } from "./stories.tsx";

// Ouro check's rules (registry/ouro/check) at rest over one story, at each size and scheme, in the browser Ouro check runs
// in. test/stories.test.tsx sweeps every story under the Ouro theme, and test/themes/nova-check.test.tsx sweeps every story
// under nova. A finding the story is known to show (`known`, the entries for this run) is waived with its reason; any other
// finding fails, and so does a known one that no longer shows, so the list only shrinks. The text-wrap rules are judged on
// Linux only (judgedOn). A failure prints every finding it names as JSON, so the log is the whole record.

/** One finding the sweep found: the story, the rule, the size and scheme it showed at, and the page's focus and hover then. */
export interface SweepFinding {
  story: string;
  rule: string;
  size: string;
  scheme: "light" | "dark";
  element: string;
  detail: string;
  hovered: string;
  focused: string;
}

export interface SweepOptions {
  /** The story's id, as Storybook names it (`Button/Disabled`). */
  id: string;
  Story: ComponentType;
  /** The viewports to check, each as width and height in CSS pixels. */
  sizes: readonly (readonly [number, number])[];
  schemes: readonly ("light" | "dark")[];
  /** The known findings for this story in this run (check-known.ts's `knownFor`). */
  known: readonly KnownFinding[];
  /** Another run's entries for this story, which waive a finding but needn't show (check-known.ts's `sweepVerdict`). */
  inherited?: readonly KnownFinding[];
  /** The viewport the page is left at, as width and height. */
  restore: readonly [number, number];
}

/**
 * What the page held as hovered and focused when a finding showed, for a finding that comes and goes with where the
 * pointer or focus was left (#1957): each element by its tag, id and data-ouro attributes.
 */
function pageState(): { hovered: string; focused: string } {
  const name = (el: Element) => `${el.tagName.toLowerCase()}${[...el.attributes].filter((a) => a.name === "id" || a.name.startsWith("data-ouro")).map((a) => `[${a.name}=${a.value}]`).join("")}`;
  return { hovered: [...document.querySelectorAll(":hover")].map(name).join(" > "), focused: document.activeElement ? name(document.activeElement) : "" };
}

/** Sweeps one story and fails on any finding its known list does not waive, or a waived one that no longer shows. */
export async function sweepStoryCheck({ id, Story, sizes, schemes, known, inherited = [], restore }: SweepOptions): Promise<void> {
  // Chromium only, the browser Ouro check runs in: the other projects have no page to check here.
  if (server.browser !== "chromium") return;
  const platform = inject("hostPlatform");
  const found: SweepFinding[] = [];
  try {
    for (const [width, height] of sizes) {
      await page.viewport(width, height);
      for (const scheme of schemes) {
        setScheme(scheme);
        const layout = (Story as ComposedStory).parameters?.layout;
        for (const { rule, element, detail } of await checkStory(Story, layout)) {
          if (judgedOn(rule, platform)) found.push({ story: id, rule, size: `${width}x${height}`, scheme, element, detail, ...pageState() });
        }
        await cleanupStories();
        await parkPointer();
      }
    }
  } finally {
    await page.viewport(restore[0], restore[1]);
  }
  const judged = (entries: readonly KnownFinding[]) => entries.filter((entry) => judgedOn(entry.rule, platform));
  const { unknown, stale } = sweepVerdict(found, judged(known), judged(inherited));
  if (unknown.length > 0) throw new Error(`findings not in check-known.ts, as JSON:\n${JSON.stringify(unknown, null, 2)}`);
  if (stale.length > 0) throw new Error(`known findings that no longer show: remove them from check-known.ts, as JSON:\n${JSON.stringify(stale, null, 2)}`);
}
