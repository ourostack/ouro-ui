import { posix } from "node:path";

/**
 * Since #3426 (v1.3.513) one thing draws squircle corners in an engine without `corner-shape` (WebKit): the
 * `squircleCorners()` PostCSS plugin in the app's build (`lib-squircle-corners`). An update that leaves it out turns
 * every rounded surface into a plain round one in Safari (#3488). An Ouro HX update installs the plugin and wires it
 * into the app's build, or, when it cannot tell where the build takes its PostCSS plugins, holds the update back and
 * names the lines to add.
 */
export const SQUIRCLE_ITEM = "lib-squircle-corners";

/** A Vite, Vitest, Astro or PostCSS config, at the package's root or in `.storybook/`. */
const CONFIG = /^(?:\.storybook\/)?(?:vite|vitest|astro|postcss)(?:\.[\w-]+)?\.config\.[cm]?[jt]s$/;
const MAIN = /^(?:vite|astro)\.config\.[cm]?[jt]s$/;
const POSTCSS = /^postcss\.config\.[cm]?[jt]s$/;
const CALL = "squircleCorners()";
const POSTCSS_OPTION = `postcss: { plugins: [${CALL}] }`;

/** The build configs of the package in `dir` ("" for the root): the files that decide which PostCSS plugins run. */
export function buildConfigs(paths, dir) {
  return paths.filter((path) => path.startsWith(dir) && CONFIG.test(path.slice(dir.length)));
}

/** Whether a build config names the plugin, however the app wired it. */
export const namesSquircles = (text) => text.includes("squircleCorners");

/**
 * Wires `squircleCorners()` into the app's build: the one `vite.config` or `astro.config` beside `components.json`
 * gets the import and `css.postcss.plugins` (under `vite` in Astro). A PostCSS config file, or PostCSS options the
 * config sets itself, are the app's own: an inline `css.postcss` would replace them, so the update is held instead.
 *
 * @param {{ dir: string, files: Map<string, Buffer | string>, plugin: string }} input the package folder, its build
 *   configs (`buildConfigs`) and where the plugin's file is installed.
 * @returns {{ files: Record<string, string>, notes: string[], held: string | null }}
 */
export function wireSquircles({ dir, files, plugin }) {
  const texts = new Map([...files].map(([path, bytes]) => [path, String(bytes)]));
  if ([...texts.values()].some(namesSquircles)) return { files: {}, notes: [], held: null };
  const local = (path) => path.slice(dir.length);
  const hold = (why) => ({ files: {}, notes: [], held: `Held back: Ouro UI draws squircle corners in WebKit only through the \`${CALL}\` PostCSS plugin now, and Ouro Current cannot add it to this app's build, because ${why}. Install \`${SQUIRCLE_ITEM}\` and add \`${CALL}\` to the PostCSS plugins the build runs; the next run updates once the build names it.` });
  const postcss = [...texts.keys()].filter((path) => POSTCSS.test(local(path)));
  if (postcss.length) return hold(`${names(postcss)} ${postcss.length === 1 ? "holds" : "hold"} its PostCSS plugins, which an inline \`css.postcss\` would replace`);
  const mains = [...texts.keys()].filter((path) => MAIN.test(local(path))).sort();
  if (mains.length === 0) return hold(`it has no \`vite.config\` or \`astro.config\` beside \`components.json\``);
  if (mains.length > 1) return hold(`both ${names(mains)} build it`);
  const [path] = mains;
  const text = texts.get(path);
  const edited = !/postcss/i.test(text) && wire(text, posix.basename(path).startsWith("astro."), specifier(path, plugin));
  if (!edited) return hold(`\`${path}\` sets its options in a way Ouro Current does not edit`);
  const stem = posix.basename(path).replace(/\.[cm]?[jt]s$/, "");
  const apart = [...texts.keys()].filter((other) => other !== path && !POSTCSS.test(local(other)) && !texts.get(other).includes(`/${stem}`)).sort();
  const notes = [`Adds \`${CALL}\` to the PostCSS plugins in \`${path}\`, which draws squircle corners in WebKit now that nothing at run time does.`];
  if (apart.length) notes.push(`To do: ${names(apart)} ${apart.length === 1 ? "builds" : "build"} CSS with ${apart.length === 1 ? "its" : "their"} own options; add \`${CALL}\` to ${apart.length === 1 ? "its" : "their"} \`css.postcss.plugins\` too where ${apart.length === 1 ? "it renders" : "they render"} Ouro UI in WebKit.`);
  return { files: { [path]: edited }, notes, held: null };
}

const names = (paths) => (paths.length > 1 ? `${paths.slice(0, -1).map((p) => `\`${p}\``).join(", ")} and \`${paths.at(-1)}\`` : `\`${paths[0]}\``);

/** The import specifier from the config to the plugin, without an extension, as the bundler resolves it. */
function specifier(config, plugin) {
  const to = posix.relative(posix.dirname(config), plugin.replace(/\.[cm]?[jt]sx?$/, ""));
  return to.startsWith(".") ? to : `./${to}`;
}

/** The config with the import and the PostCSS option added, or null when its options are not an object literal it can read. */
function wire(text, astro, from) {
  const head = /export\s+default\s+(?:defineConfig\s*\(\s*)?(?:(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*=>\s*\(?\s*)?\{/.exec(text);
  if (!head) return null;
  const root = head.index + head[0].length - 1;
  let out;
  if (astro) {
    const vite = keyAt(text, root, "vite");
    if (vite === undefined) return null;
    if (vite === null) out = insertKey(text, root, `vite: { css: { ${POSTCSS_OPTION} } }`);
    else out = addCss(text, vite);
  } else {
    out = addCss(text, root);
  }
  return out && addImport(out, from);
}

/** Adds `postcss` to the object's `css` option, or a `css` option with it. */
function addCss(text, open) {
  const css = keyAt(text, open, "css");
  if (css === undefined) return null;
  return css === null ? insertKey(text, open, `css: { ${POSTCSS_OPTION} }`) : insertKey(text, css, POSTCSS_OPTION);
}

/** Puts `entry` first in the object that opens at `open`, on its own line when the object's entries are. */
function insertKey(text, open, entry) {
  const after = text.slice(open + 1);
  const line = /^[ \t]*\n([ \t]*)\S/.exec(after);
  if (line) return `${text.slice(0, open + 1)}\n${line[1]}${entry},${text.slice(open + 1)}`;
  const empty = /^\s*\}/.test(after);
  return `${text.slice(0, open + 1)} ${entry}${empty ? " " : ","}${empty ? after.replace(/^\s*/, "") : after.startsWith(" ") ? after : ` ${after}`}`;
}

/**
 * Where the value of `key` opens, among the entries of the object that opens at `open` (its own, not a nested
 * object's): its `{`, null when the object has no such key, undefined when its value is not an object literal or the
 * object cannot be read to its end.
 */
function keyAt(text, open, key) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    const char = text[i];
    const skip = skipLiteral(text, i);
    if (skip !== i) {
      i = skip - 1;
      continue;
    }
    if (char === "{" || char === "(" || char === "[") depth += 1;
    else if (char === "}" || char === ")" || char === "]") {
      depth -= 1;
      if (depth === 0) return null;
    } else if (depth === 1 && /[\w$"']/.test(char) && /[{,\s]/.test(text[i - 1])) {
      const match = new RegExp(String.raw`^(["']?)${key}\1\s*:\s*`).exec(text.slice(i));
      if (match) return text[i + match[0].length] === "{" ? i + match[0].length : undefined;
    }
  }
  return undefined;
}

/** The index just past a string, template literal or comment that starts at `i`, or `i` when none does. */
function skipLiteral(text, i) {
  const char = text[i];
  if (char === "/" && text[i + 1] === "/") {
    const end = text.indexOf("\n", i);
    return end < 0 ? text.length : end;
  }
  if (char === "/" && text[i + 1] === "*") {
    const end = text.indexOf("*/", i + 2);
    return end < 0 ? text.length : end + 2;
  }
  if (char !== '"' && char !== "'" && char !== "`") return i;
  for (let j = i + 1; j < text.length; j += 1) {
    if (text[j] === "\\") j += 1;
    else if (text[j] === char) return j + 1;
    else if (char === "`" && text[j] === "$" && text[j + 1] === "{") {
      // A template's placeholder is code, whose own strings and braces are read the same way.
      let depth = 0;
      for (j += 1; j < text.length; j += 1) {
        const skip = skipLiteral(text, j);
        if (skip !== j) {
          j = skip - 1;
          continue;
        }
        if (text[j] === "{") depth += 1;
        else if (text[j] === "}" && --depth === 0) break;
      }
    }
  }
  return text.length;
}

/** Adds the plugin's import after the config's last import, in the quotes and semicolons the config writes. */
function addImport(text, from) {
  const imports = [...text.matchAll(/^import\b[\s\S]*?(["'])[^"'\n]*\1(;?)[ \t]*$/gm)];
  const last = imports.at(-1);
  const quote = last?.[1] ?? '"';
  const semi = last ? last[2] : ";";
  const line = `import { squircleCorners } from ${quote}${from}${quote}${semi}`;
  if (last) {
    const end = last.index + last[0].length;
    return `${text.slice(0, end)}\n${line}${text.slice(end)}`;
  }
  const lead = /^(?:\s*\/\/[^\n]*\n)*/.exec(text)[0];
  return `${lead}${line}\n${text.slice(lead.length)}`;
}
