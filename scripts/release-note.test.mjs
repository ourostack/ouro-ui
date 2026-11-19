import assert from "node:assert/strict";
import { test } from "node:test";
import { noReleaseReason, releaseNoteProblems, shippedFile } from "./release-note.mjs";

const stretched = 'export const stretched = "link";\n';
const runtimeChange = (body) => ({ files: [{ path: "registry/ouro/lib/ouro/stretched-link.ts", before: stretched, after: 'export const stretched = "fixed";\n' }], body });
const fragmentLine = (text) => ({ path: "changes/stretched-link.md", before: null, after: `- ${text}\n` });

test("a shipped runtime file that changes with no changes/ line fails, naming the file and the fix", () => {
  const [problem, ...rest] = releaseNoteProblems(runtimeChange(""));
  assert.equal(rest.length, 0);
  assert.match(problem, /^registry\/ouro\/lib\/ouro\/stretched-link\.ts change what apps install, but changes\/ gains no line/);
  assert.match(problem, /Fix: add changes\/<name>\.md with a "- " line saying what apps see/);
});

test("a new \"- \" line in a changes/ fragment lets the same runtime change pass", () => {
  assert.deepEqual(releaseNoteProblems({ files: [...runtimeChange("").files, fragmentLine("Fixed: the stretched link opens its row.")], body: "" }), []);
});

test("a changes/ file that gains no new \"- \" line does not count as a release note", () => {
  const files = [...runtimeChange("").files, { path: "changes/old.md", before: "- Fixed: earlier.\n", after: "- Fixed: earlier.\nFixed: not a change line.\n" }];
  assert.equal(releaseNoteProblems({ files, body: "" }).length, 1);
});

test("no-release with a reason in the description lets the runtime change pass, and an empty or too-short reason does not", () => {
  assert.deepEqual(releaseNoteProblems(runtimeChange("Refactor only.\n\nno-release: tests-only refactor\n")), []);
  assert.equal(releaseNoteProblems(runtimeChange("no-release:\n")).length, 1);
  assert.equal(releaseNoteProblems(runtimeChange("no-release: ab\n")).length, 1);
});

test("noReleaseReason reads the reason from any line, case-insensitively, trimmed", () => {
  assert.equal(noReleaseReason("Fixes #12.\n  No-Release:   tests-only refactor  \r\n"), "tests-only refactor");
  assert.equal(noReleaseReason("Mentions no-release: in prose only, not at a line start"), null);
});

test("tests, stories, type tests, component.json, the testing kit, the site, scripts and docs change no shipped file", () => {
  const paths = [
    "registry/ouro/components/ouro/button/button.test.tsx",
    "registry/ouro/components/ouro/button/button.stories.tsx",
    "registry/ouro/components/ouro/button/button.test-d.ts",
    "registry/ouro/components/ouro/button/button.touch.test.tsx",
    "registry/ouro/components/ouro/button/component.json",
    "registry/ouro/lib/ouro/testing/announcements.ts",
    "registry/ouro/lib/ouro/dev.test.ts",
    "site/src/voyage/home.tsx",
    "scripts/release-note.mjs",
    "docs/button.md",
  ];
  for (const path of paths) assert.equal(shippedFile(path), false, path);
  assert.deepEqual(releaseNoteProblems({ files: paths.map((path) => ({ path, before: "a\n", after: "b\n" })), body: "" }), []);
});

test("the theme stylesheets and the component and lib code apps install are shipped, and the theme's tests are not", () => {
  assert.equal(shippedFile("registry/ouro/theme/ouro-base.css"), true);
  assert.equal(shippedFile("registry/ouro/theme/ouro-theme.css"), true);
  assert.equal(shippedFile("registry/ouro/theme/theme.test.tsx"), false);
  assert.equal(shippedFile("registry/ouro/components/ouro/button/button.tsx"), true);
  assert.equal(shippedFile("registry/ouro/components/ouro/button/button-styles.ts"), true);
});

test("a docs pin that moves only the version literal in dev.ts passes, and other text in the same file fails", () => {
  const dev = (tag) => `export const add = "npx shadcn@latest add ourostack/ouro-ui/ouro-base#${tag}";\n`;
  assert.deepEqual(releaseNoteProblems({ files: [{ path: "registry/ouro/lib/ouro/dev.ts", before: dev("v1.3.312"), after: dev("v1.3.313") }], body: "" }), []);
  const edited = { path: "registry/ouro/lib/ouro/dev.ts", before: dev("v1.3.312"), after: `${dev("v1.3.313")}// reworded\n` };
  assert.equal(releaseNoteProblems({ files: [edited], body: "" }).length, 1);
});
