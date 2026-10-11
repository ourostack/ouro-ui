import axe from "axe-core";
import { afterEach, expect, it } from "vitest";
import { axeExclude } from "@/registry/ouro/lib/ouro/testing/axe";
import { cleanupStories, renderStory, storyFiles } from "./stories.tsx";

// Runs in the `touch` project: Chromium as a 390x844 phone with a coarse pointer, where
// each Button renders its 44px touch target. axe must be able to check every label's
// contrast, so nothing may paint over the label (axe reports that as "incomplete").

afterEach(async () => {
  await cleanupStories();
});

it("leaves no Button label's contrast unchecked on a coarse pointer", async () => {
  expect(matchMedia("(pointer: coarse)").matches).toBe(true);
  await renderStory(storyFiles.Button.TonesAndVariants);
  const result = await axe.run(
    { include: [document.documentElement], exclude: axeExclude.map((selector) => [selector]) },
    { resultTypes: ["incomplete"], runOnly: ["color-contrast"] },
  );
  const unchecked = result.incomplete.flatMap((rule) => rule.nodes.map((node) => `${node.target.join(" ")}: ${node.any.map((check) => check.message).join("; ")}`));
  expect(unchecked).toEqual([]);
});
