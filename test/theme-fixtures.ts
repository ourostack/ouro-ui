import baseCss from "@/registry/ouro/theme/ouro-base.css?raw";
import ouroThemeCss from "@/registry/ouro/theme/ouro-theme.css?raw";

// Third-party shadcn themes for the tests: test/theme-fixtures/<name>.css, each holding only the
// `:root`, `.dark` and `@theme inline` blocks an app's stylesheet has (nova and vega from
// `shadcn init`, cookbook from Spoonjoy). The page compiled app.css once, with the Ouro look, so
// a fixture is applied the way the browser would see the app's stylesheet: the Ouro look's
// variables are unset, ouro-base's `:root` and `.dark` values come back (every app adds
// ouro-base), then the fixture's blocks follow, its `@theme inline` declarations as runtime
// variables (`--font-heading`, `--font-sans`). Only what Tailwind inlines at compile time is
// lost (a fixture's own radius scale), which neither color nor font checks read.

const sources = import.meta.glob<string>("./theme-fixtures/*.css", { query: "?raw", import: "default", eager: true });

/** Each fixture's stylesheet, by name (`nova`, `vega`, `cookbook`). */
export const themeFixtures: Record<string, string> = Object.fromEntries(
  Object.entries(sources).map(([path, css]) => [path.replace(/^.*\/([\w-]+)\.css$/, "$1"), css]),
);

const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** A stylesheet's top-level blocks: each prelude (selector or at-rule, whitespace collapsed) and body. */
export function topLevelBlocks(css: string): Array<{ prelude: string; body: string }> {
  const text = withoutComments(css);
  const blocks: Array<{ prelude: string; body: string }> = [];
  let depth = 0;
  let start = 0;
  let open = 0;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === "{") {
      if (depth === 0) open = index;
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0) {
        blocks.push({ prelude: text.slice(start, open).trim().replace(/\s+/g, " "), body: text.slice(open + 1, index) });
        start = index + 1;
      }
    }
  }
  return blocks;
}

/** Every custom property a stylesheet declares. */
const declared = (css: string) => [...new Set([...withoutComments(css).matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]!))];

/** The CSS that puts a fixture in place of the Ouro look. */
export function fixtureCss(name: string): string {
  const fixture = themeFixtures[name];
  if (fixture === undefined) throw new Error(`no theme fixture ${name}`);
  const unset = `:root, .dark { ${declared(ouroThemeCss).map((property) => `${property}: initial;`).join(" ")} }`;
  const base = topLevelBlocks(baseCss)
    .filter(({ prelude }) => prelude === ":root" || prelude === ".dark")
    .map(({ prelude, body }) => `${prelude} {${body}}`);
  const own = topLevelBlocks(fixture).map(({ prelude, body }) => `${prelude === "@theme inline" ? ":root" : prelude} {${body}}`);
  return [unset, ...base, ...own].join("\n");
}

/** Applies a fixture to the page until the returned function removes it. */
export function applyThemeFixture(name: string): () => void {
  const style = document.createElement("style");
  style.dataset["themeFixture"] = name;
  style.textContent = fixtureCss(name);
  document.head.append(style);
  return () => style.remove();
}
