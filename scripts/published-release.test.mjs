import assert from "node:assert/strict";
import { test } from "node:test";
import { publishedProblems, sources } from "./published-release.mjs";

const llms = (tag) => `# Ouro UI\n\n\`\`\`sh\nnpx shadcn@latest add ourostack/ouro-ui/dialog#${tag}\n\`\`\`\n`;

test("the published llms.txt passes when every install address names the release", () => {
  assert.deepEqual(publishedProblems({ "llms.txt": llms("v0.7.0") }, "v0.7.0"), []);
});

test("a published llms.txt that names another release fails, with the page and the line", () => {
  const problems = publishedProblems({ "llms.txt": llms("v0.6.0") }, "v0.7.0");
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^llms\.txt names another release than v0\.7\.0 \(line 4: #v0\.6\.0\)/);
});

test("a page that names no release at all fails: it is not the page we publish", () => {
  const problems = publishedProblems({ "llms.txt": "Not found" }, "v0.7.0");
  assert.match(problems.join("\n"), /^llms\.txt names no release/);
});

test("it reads the site's llms.txt only: main's README no longer names the newest release", () => {
  assert.deepEqual(sources(), { "llms.txt": "https://ui.ouroboros.bot/llms.txt" });
});
