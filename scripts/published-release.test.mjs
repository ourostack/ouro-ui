import assert from "node:assert/strict";
import { test } from "node:test";
import { publishedProblems, sources } from "./published-release.mjs";

const llms = (tag) => `# Ouro UI\n\n\`\`\`sh\nnpx shadcn@latest add ourostack/ouro-ui/dialog#${tag}\n\`\`\`\n`;

test("the published llms.txt and README pass when every install address names the release", () => {
  assert.deepEqual(publishedProblems({ "llms.txt": llms("v0.7.0"), "README.md": llms("v0.7.0") }, "v0.7.0"), []);
});

test("a published llms.txt that names another release fails, with the page and the line", () => {
  const problems = publishedProblems({ "llms.txt": llms("v0.6.0"), "README.md": llms("v0.7.0") }, "v0.7.0");
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^llms\.txt names another release than v0\.7\.0 \(line 4: #v0\.6\.0\)/);
});

test("a published README that names another release fails", () => {
  const problems = publishedProblems({ "llms.txt": llms("v0.7.0"), "README.md": llms("v0.6.0") }, "v0.7.0");
  assert.match(problems.join("\n"), /^README\.md names another release than v0\.7\.0/);
});

test("a page that names no release at all fails: it is not the page we publish", () => {
  const problems = publishedProblems({ "llms.txt": "Not found", "README.md": llms("v0.7.0") }, "v0.7.0");
  assert.match(problems.join("\n"), /^llms\.txt names no release/);
});

test("it reads the site's llms.txt and main's README", () => {
  assert.deepEqual(Object.keys(sources("ourostack/ouro-ui")), ["llms.txt", "README.md"]);
  assert.equal(sources("ourostack/ouro-ui")["llms.txt"], "https://ourostack.github.io/ouro-ui/llms.txt");
  assert.match(sources("ourostack/ouro-ui")["README.md"], /^https:\/\/api\.github\.com\/repos\/ourostack\/ouro-ui\/contents\/README\.md\?ref=main$/);
});
