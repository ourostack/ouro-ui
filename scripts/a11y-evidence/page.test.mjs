import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { evidenceRows, renderEvidencePage, specFacts, srStoryIds, storyNames } from "./page.mjs";

test("storyNames counts a stories file's exports and leaves out the meta", () => {
  assert.deepEqual(storyNames("const meta = {};\nexport default meta;\nexport const Playground: Story = {};\nexport const States = () => null;\nexport const meta2 = 1;\n"), ["Playground", "States", "meta2"]);
});

test("specFacts reads a spec's test titles and the story ids it opens through storyIds", () => {
  const ids = srStoryIds('export const storyIds = {\n  button: "actions-button--loading",\n  dialog: "overlays-dialog--playground",\n} as const;\n');
  assert.deepEqual(ids, { button: "actions-button--loading", dialog: "overlays-dialog--playground" });
  assert.deepEqual(specFacts('test.use({ storyId: storyIds.button });\ntest("Button is read", async () => {});\n', ids), { titles: ["Button is read"], stories: ["actions-button--loading"] });
});

test("every screen-reader spec file is on the page, under its component or as a pattern", () => {
  const { rows, others } = evidenceRows();
  const onPage = [...rows.filter((row) => row.spec).map((row) => row.spec.file), ...others.map((spec) => spec.file)].sort();
  const files = fs.readdirSync("registry/ouro/e2e/screen-reader").filter((file) => file.endsWith(".sr.spec.ts")).map((file) => `registry/ouro/e2e/screen-reader/${file}`).sort();
  assert.deepEqual(onPage, files);
});

test("the committed page is what the repository's files render", () => {
  assert.equal(fs.readFileSync("docs/guides/accessibility-evidence.md", "utf8"), renderEvidencePage(evidenceRows()));
});
