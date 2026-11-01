// Tailwind writes each colour with an opacity (bg-primary/10, border-border/70) twice: a plain
// fallback, then the color-mix() version inside @supports (color:color-mix(in lab, red, red)). The
// site's own stylesheets use color-mix() without any fallback, so it already needs a browser that
// has it, and the fallbacks are bytes every page pays for nothing (about 500 gzip bytes of the
// voyage's first-load CSS). This build step keeps the color-mix() rules, without their @supports
// wrapper, and drops the fallback Tailwind put just before each one.
import type { Plugin } from "vite";

const SUPPORTS = "@supports (color:color-mix(in lab, red, red)){";

/** The index just after the "}" that closes the block whose body starts at `open`, skipping quoted strings; -1 if it never closes. */
function blockEnd(css: string, open: number): number {
  let depth = 1;
  for (let index = open; index < css.length; index++) {
    const char = css[index];
    if (char === '"' || char === "'") {
      const close = css.indexOf(char, index + 1);
      if (close === -1) return -1;
      index = close;
    } else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) return index + 1;
  }
  return -1;
}

/** The property names a declaration block sets. */
function properties(block: string): string[] {
  return block
    .split(";")
    .map((declaration) => declaration.slice(0, declaration.indexOf(":")).trim())
    .filter(Boolean);
}

/** Minified CSS with Tailwind's color-mix() rules unwrapped and their plain fallbacks gone. */
export function dropColorMixFallbacks(css: string): string {
  let out = "";
  let at = 0;
  for (let start = css.indexOf(SUPPORTS); start !== -1; start = css.indexOf(SUPPORTS, at)) {
    const end = blockEnd(css, start + SUPPORTS.length);
    if (end === -1) break;
    const inner = css.slice(start + SUPPORTS.length, end - 1);
    let before = css.slice(at, start);
    const rule = /^([^{}]+)\{([^{}]*)\}$/.exec(inner);
    const open = before.lastIndexOf("{");
    if (rule && before.endsWith("}") && open !== -1 && !before.slice(open + 1, -1).includes("}")) {
      // The rule just before: its selector starts after the previous rule's "}", an at-rule's "{" or a ";".
      const selectorStart = Math.max(before.lastIndexOf("}", open), before.lastIndexOf("{", open - 1), before.lastIndexOf(";", open)) + 1;
      const selector = before.slice(selectorStart, open);
      const wanted = new Set(properties(rule[2]!));
      if (selector === rule[1] && properties(before.slice(open + 1, -1)).every((name) => wanted.has(name))) before = before.slice(0, selectorStart);
    }
    out += before + inner;
    at = end;
  }
  return out + css.slice(at);
}

/** The build step: every CSS file the client build writes goes through dropColorMixFallbacks. */
export function colorMixFallbacks(): Plugin {
  return {
    name: "ouro-color-mix-fallbacks",
    apply: "build",
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type !== "asset" || !file.fileName.endsWith(".css")) continue;
        file.source = dropColorMixFallbacks(typeof file.source === "string" ? file.source : new TextDecoder().decode(file.source));
      }
    },
  };
}
