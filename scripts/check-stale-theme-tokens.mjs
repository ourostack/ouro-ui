// After an upgrade, no v0.1.0 `@theme inline` leftover (`--ouro-x: var(--ouro-x);`,
// `--color-ouro-backdrop-color: var(--ouro-backdrop-color);`) should still map one Ouro
// theme token through another at :root or .dark. ouro-base's own @keyframes (Composer's
// clip inset) sets one Ouro custom property from another's var() too, on purpose, so a
// plain textual grep for the shape cannot tell the leftover from the animation: parse the
// CSS and skip any declaration nested in a @keyframes block.
import postcss from "postcss";

const tokenProp = /^--(color-)?ouro-[a-z-]+$/;
const tokenValue = /^var\(--ouro-[a-z-]+\)$/;

function insideKeyframes(node) {
  for (let ancestor = node; ancestor; ancestor = ancestor.parent) {
    if (ancestor.type === "atrule" && /^(-\w+-)?keyframes$/i.test(ancestor.name)) return true;
  }
  return false;
}

/** The stale-mapping declarations in `css`, as "<line>: <prop>: <value>;" strings; empty when the file is clean. */
export function staleThemeTokenLines(css) {
  const root = postcss.parse(css);
  const stale = [];
  root.walkDecls(tokenProp, (decl) => {
    if (!tokenValue.test(decl.value.trim()) || insideKeyframes(decl)) return;
    stale.push(`${decl.source?.start?.line ?? "?"}: ${decl.prop}: ${decl.value};`);
  });
  return stale;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: check-stale-theme-tokens.mjs <css file>");
    process.exit(2);
  }
  const { readFileSync } = await import("node:fs");
  const stale = staleThemeTokenLines(readFileSync(file, "utf8"));
  if (stale.length > 0) {
    console.log(stale.join("\n"));
    console.log(`${file} still maps an Ouro token through @theme inline`);
    process.exit(1);
  }
}
