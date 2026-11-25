import type { ComponentType } from "react";
import { findDesignIssues } from "@/registry/ouro/check/design-check";
import { findFirstRunIssues } from "@/registry/ouro/check/first-run-check";
import { findImageFades } from "@/registry/ouro/check/fade-check";
import { findInteractionIssues } from "@/registry/ouro/check/interaction-check";
import { findLayoutIssues } from "@/registry/ouro/check/layout-check";
import { findOverlaps } from "@/registry/ouro/check/overlap-check";
import { findPanelIssues } from "@/registry/ouro/check/panel-check";
import { decodeImages } from "@/registry/ouro/check/in-page";
import { findSizeIssues, type PageIssue } from "@/registry/ouro/check/size-check";
import { findTextIssues } from "@/registry/ouro/check/text-check";
import { findThemeIssues } from "@/registry/ouro/check/theme-check";
import { findOffThemeIssues } from "@/registry/ouro/check/token-check";
import { findWrapIssues } from "@/registry/ouro/check/wrap-check";
import { renderStoryPage, settle } from "./stories.tsx";

// Ouro check's rules, run in the browser over one story at rest: the same in-page finders `ouro-check` runs on each
// page of an app (registry/ouro/check/run.ts, `checkPage`), so a component Ouro check would fail fails here first.
// The story sits in a page's <main> with the frame Storybook gives it: 1rem of padding, unless its layout is
// fullscreen. Every finding is returned; a story's known findings are waived by the caller, not here.
export async function checkStory(Story: ComponentType, layout: string = "centered"): Promise<PageIssue[]> {
  const host = await renderStoryPage(Story);
  const frame = host.parentElement!;
  if (layout !== "fullscreen") frame.style.padding = "1rem";
  await settle();
  await decodeImages();
  return [
    ...(await findOverlaps({})),
    ...(await findSizeIssues({ measures: [] })),
    ...(await findImageFades()),
    ...(await findDesignIssues({})),
    ...(await findTextIssues()),
    ...(await findLayoutIssues({})),
    ...(await findThemeIssues({})),
    ...(await findOffThemeIssues({ maxIssues: 100000 })),
    ...(await findInteractionIssues()),
    ...(await findWrapIssues({})),
    ...(await findPanelIssues({ clip: false })),
    ...(await findFirstRunIssues()),
  ];
}

/** One line a failing story names: the rule, the element and what the check measured. */
export const describeIssue = ({ rule, element, detail }: PageIssue): string => `${rule} ${element}: ${detail}`;
