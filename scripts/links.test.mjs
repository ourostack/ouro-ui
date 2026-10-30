import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { anchor, anchors, builtProblems, coverageProblems, existsExactly, links, publishedPaths, siteUrlProblem, sourceProblems } from "./links.mjs";
import { scratchDir } from "./scratch.mjs";

// The first app to adopt the forms followed links that opened on a Mac and were 404s on the
// site: docs/OuroProvider.md is a file, and the site had no page for it under any name.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function tree(files) {
  const dir = scratchDir("ouro-links-");
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

const repoFiles = (extra) =>
  tree({
    "site/src/docs/catalog.json": JSON.stringify([{ name: "text-field", title: "TextField" }]),
    "site/src/docs/pages.json": JSON.stringify([{ name: "ouro-provider", title: "OuroProvider", kind: "export", markdown: "docs/OuroProvider.md" }]),
    "registry.json": JSON.stringify({ items: [{ name: "text-field", type: "registry:ui", docs: "Docs: https://ui.ouro.bot/docs/text-field.md" }] }),
    "docs/TextField.md": "# TextField\n\n## Props\n",
    "docs/OuroProvider.md": "# OuroProvider\n",
    "README.md": "# Ouro UI\n",
    ...extra,
  });

test("a name matches only in its exact letter case, on any file system", () => {
  const dir = tree({ "docs/OuroProvider.md": "x" });
  assert.equal(existsExactly(dir, "docs/OuroProvider.md"), true);
  assert.equal(existsExactly(dir, "docs/ouroprovider.md"), false);
  assert.equal(existsExactly(dir, "Docs/OuroProvider.md"), false);
});

test("anchors follow GitHub's heading ids and skip code blocks", () => {
  assert.equal(anchor("Vite and React Router apps: the \"use client\" notice"), "vite-and-react-router-apps-the-use-client-notice");
  assert.deepEqual([...anchors("# A b\n```sh\n# not a heading\n```\n## Finding fields in tests\n")], ["a-b", "finding-fields-in-tests"]);
});

test("links finds Markdown targets and bare site URLs, and leaves code alone", () => {
  const text = "See [Form](../Form.md#props) and https://ui.ouro.bot/docs/form.md.\n`[x](y.md)`\n```\n[z](z.md)\n```\n";
  assert.deepEqual(links(text), [
    { target: "../Form.md#props", line: 1 },
    { target: "https://ui.ouro.bot/docs/form.md", line: 1 },
  ]);
});

test("a site URL must name a published page, in its exact letter case", () => {
  const published = publishedPaths(repoFiles({}));
  assert.equal(siteUrlProblem("https://ui.ouro.bot/docs/ouro-provider/", published), null);
  assert.equal(siteUrlProblem("https://ui.ouro.bot/docs/text-field.md#props", published), null);
  assert.equal(siteUrlProblem("https://ui.ouro.bot/docs/<item>.md", published), null);
  assert.match(siteUrlProblem("https://ui.ouro.bot/docs/OuroProvider.md", published), /is not a page the site publishes/);
  assert.match(siteUrlProblem("https://ui.ouro.bot/docs/Text-Field.md", published), /differs in letter case from the published .*docs\/text-field\.md/);
});

test("the source check fails on a dead relative link, a wrong letter case, a missing heading and a dead site URL", () => {
  const dir = repoFiles({
    "README.md": [
      "[ok](docs/TextField.md#props)",
      "[case](docs/textfield.md)",
      "[gone](docs/Gone.md)",
      "[heading](docs/TextField.md#nope)",
      "https://ui.ouro.bot/docs/radio.md",
    ].join("\n"),
  });
  const problems = sourceProblems(dir);
  assert.equal(problems.length, 4, problems.join("\n"));
  assert.match(problems[0], /^README\.md:2: docs\/textfield\.md names no file/);
  assert.match(problems[1], /^README\.md:3: docs\/Gone\.md names no file/);
  assert.match(problems[2], /^README\.md:4: .* names no heading of docs\/TextField\.md/);
  assert.match(problems[3], /^README\.md:5: .*docs\/radio\.md is not a page the site publishes/);
});

test("the source check reads every item's install message", () => {
  const dir = repoFiles({
    "registry.json": JSON.stringify({ items: [{ name: "radio-group", type: "registry:ui", docs: "Docs: https://ui.ouro.bot/docs/radio-group.md" }] }),
  });
  assert.match(sourceProblems(dir).join("\n"), /registry\.json: radio-group's install message: .*is not a page the site publishes/);
  assert.match(coverageProblems(dir).join("\n"), /The radio-group item has no docs page/);
});

test("a docs file that no page publishes fails", () => {
  const dir = repoFiles({ "docs/Radio.md": "# Radio\n" });
  assert.deepEqual(coverageProblems(dir), ["docs/Radio.md has no page on the site: no registry item, guide or export page publishes it."]);
});

test("the built-site check fails on a link to a missing file or another letter case", () => {
  const dist = tree({
    "index.html": '<a href="/docs/button/">ok</a> <a href="/docs/Button/">case</a> <a href="/docs/gone/">gone</a> <a href="https://example.com/">out</a> <a href="/storybook/">storybook</a>',
    "docs/button/index.html": '<a href="/docs/button.md">md</a><pre><a href="/nope">in code</a></pre>',
    "docs/button.md": "[Form](form.md) [Button](button.md)",
  });
  const problems = builtProblems(dist);
  assert.equal(problems.length, 3, problems.join("\n"));
  assert.match(problems.join("\n"), /index\.html: \/docs\/Button\/ names no file in the built site/);
  assert.match(problems.join("\n"), /index\.html: \/docs\/gone\/ names no file/);
  assert.match(problems.join("\n"), /docs\/button\.md: form\.md names no file/);
});

test("every link in this repository's docs and install messages names a page that exists", () => {
  assert.deepEqual(sourceProblems(), []);
});

test("every registry item has a docs page, and every docs file is published", () => {
  assert.deepEqual(coverageProblems(), []);
});

test("the README's item list names every item an app can add, from the registry", () => {
  const readme = readFileSync(join(root, "README.md"), "utf8");
  const list = /<!-- items:start -->([\s\S]*)<!-- items:end -->/.exec(readme)?.[1] ?? "";
  const named = new Set([...list.matchAll(/`([a-z0-9-]+)`/g)].map((match) => match[1]));
  const registry = JSON.parse(readFileSync(join(root, "registry.json"), "utf8"));
  // Tests items are named by their rule (`<name>-tests`), everything else by name.
  const missing = registry.items.map((item) => item.name).filter((name) => !named.has(name) && !(name.endsWith("-tests") && named.has(name.slice(0, -6))));
  assert.deepEqual(missing, [], "Run pnpm run docs.");
});
