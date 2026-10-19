import { afterEach, beforeEach } from "vitest";
import { commands } from "vitest/browser";
import { describeRows, describeStories, rows } from "./control-suite.tsx";
import { cleanupStories } from "./stories.tsx";

// The control marker checks (test/control-suite.tsx) on a touch phone, where a coarse pointer
// reaches controls a mouse never sees (Combobox's sheet, with its trigger and Done button).

beforeEach(async () => {
  await commands.emulateMedia({ reducedMotion: "no-preference" });
});
afterEach(async () => {
  await cleanupStories();
});

describeRows(
  "every declared part is marked on a touch phone",
  rows.filter((row) => row.touch),
  [undefined],
);
describeStories(() => "no control is left unmarked on a touch phone", [undefined]);
