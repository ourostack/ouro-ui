import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { treeFiles } from "../../scripts/tree.mjs";

const src = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const base = readFileSync(join(src, "styles.css"), "utf8");
const prefixes = [...base.matchAll(/\[class\*="([^"]+)"\]/g)].map((m) => m[1]);

/** The selectors of every rule in `css` that sets a corner radius and no corner shape of its own. */
export function unshapedRadii(css) {
  const found = [];
  for (const [, selector, body] of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const radius = body.match(/(?:^|[;\s])border-radius\s*:\s*([^;]+)/);
    if (!radius || /corner-shape/.test(body) || /^(0|inherit)$/.test(radius[1].trim())) continue;
    const covered = selector.split(",").every((part) => !part.includes("::") && prefixes.some((prefix) => part.includes(prefix)));
    if (!covered) found.push(selector.trim());
  }
  return found;
}

test("the site's squircle rule names the class prefixes it covers", () => {
  assert.ok(prefixes.length > 0, "site/src/styles.css has no [class*=...] corner-shape rule");
});

test("a site stylesheet rounds only elements the squircle rule reaches, or sets corner-shape itself", () => {
  const files = treeFiles(src).filter((file) => file.endsWith(".css"));
  const problems = files.flatMap((file) =>
    unshapedRadii(readFileSync(join(src, file), "utf8")).map((selector) => `${file}: ${selector}`),
  );
  assert.deepEqual(
    problems,
    [],
    `These rules set border-radius on a class outside the squircle rule in site/src/styles.css (${prefixes.join(", ")}). Fix: name the class with one of those prefixes, or add corner-shape: var(--ouro-corner-shape) to the rule.`,
  );
});

test("unshapedRadii finds a rounded rule outside the prefixes and skips shaped, square and covered ones", () => {
  const css = `.docs-card{border-radius:8px}.site-a{border-radius:8px}.x{border-radius:8px;corner-shape:squircle}.y{border-radius:0}`;
  assert.deepEqual(unshapedRadii(css), [".docs-card"]);
});
