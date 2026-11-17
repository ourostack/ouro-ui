// What a theme item (`ouro-base`, `ouro-theme`) adds to an app's stylesheet, applied the way `shadcn add` applies it:
// its `cssVars` go to `:root`, `.dark` and `@theme inline`, and its `css` to the rules, at-rules, utilities and
// keyframes it names. Only what the stylesheet lacks is added. A variable or declaration the app already has keeps its
// value, and every other byte of the file stays as the app wrote it. No dependency: Ouro Current runs on plain Node.

/** The theme items Ouro Current keeps in an app's stylesheet. */
export const THEME_ITEMS = ["ouro-base", "ouro-theme"];

/** The text with its comments blanked out, same length, so indexes still line up. */
function blankComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
}

/**
 * The stylesheet's blocks as a tree: each with its prelude (`:root`, `@layer base`), where its braces are, its
 * declarations and its child blocks. Null when the braces don't balance, so a file this can't read is never written.
 */
export function parseCss(text) {
  const src = blankComments(text);
  const root = { prelude: null, open: -1, close: text.length, decls: [], children: [], parent: null };
  let node = root;
  let segment = 0;
  let quote = null;
  let parens = 0;
  const declaration = (from, to) => {
    const raw = src.slice(from, to);
    const match = /^\s*(-{0,2}[A-Za-z_][\w-]*)\s*:([\s\S]*)$/.exec(raw);
    if (match && node !== root) node.decls.push({ prop: match[1], value: match[2].trim(), start: from + raw.length - raw.trimStart().length });
  };
  for (let index = 0; index < src.length; index += 1) {
    const char = src[index];
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === "(") parens += 1;
    else if (char === ")") parens = Math.max(0, parens - 1);
    else if (parens > 0) continue;
    else if (char === ";") {
      declaration(segment, index);
      segment = index + 1;
    } else if (char === "{") {
      const child = { prelude: src.slice(segment, index).trim().replace(/\s+/g, " "), open: index, close: -1, decls: [], children: [], parent: node };
      node.children.push(child);
      node = child;
      segment = index + 1;
    } else if (char === "}") {
      if (node === root) return null;
      declaration(segment, index);
      node.close = index;
      node = node.parent;
      segment = index + 1;
    }
  }
  return node === root && !quote ? root : null;
}

/** A selector list split at its top-level commas, each part with its whitespace collapsed. */
function selectors(prelude) {
  const out = [];
  let depth = 0;
  let from = 0;
  for (let index = 0; index < prelude.length; index += 1) {
    const char = prelude[index];
    if (char === "(" || char === "[") depth += 1;
    else if (char === ")" || char === "]") depth -= 1;
    else if (char === "," && depth === 0) {
      out.push(prelude.slice(from, index));
      from = index + 1;
    }
  }
  out.push(prelude.slice(from));
  return out.map((part) => part.trim().replace(/\s+/g, " ")).filter(Boolean);
}

const collapse = (prelude) => prelude.trim().replace(/\s+/g, " ");
const isTheme = (prelude) => /^@theme\b/.test(prelude);
/** At-rules a theme item may wrap rules in. Anything else is unrecognised, and named rather than written. */
const WRAPPERS = /^@(layer|supports|media|container)\b/;
const atName = (prelude) => /^@[\w-]+/.exec(prelude)?.[0] ?? null;

/** Every block in the tree, with the at-rules around it (`@layer base` left out: a rule outside it counts too). */
function* walk(node, wrappers = []) {
  for (const child of node.children) {
    yield { node: child, wrappers };
    const inner = child.prelude.startsWith("@") && child.prelude !== "@layer base" ? [...wrappers, collapse(child.prelude)] : wrappers;
    yield* walk(child, inner);
  }
}

/**
 * What the item asks for, as targets: a rule (its wrappers, its selector, its declarations) or a whole at-rule block
 * (`@keyframes`), with what this cannot read named in `unknown`.
 */
export function itemTargets(item) {
  const rules = [];
  const blocks = [];
  const unknown = [];
  const vars = item.cssVars ?? {};
  for (const [key, selector] of [["light", ":root"], ["dark", ".dark"], ["theme", "@theme inline"]]) {
    const entries = Object.entries(vars[key] ?? {});
    if (entries.length) rules.push({ wrappers: [], prelude: selector, decls: entries.map(([name, value]) => [`--${name}`, String(value)]) });
  }
  for (const key of Object.keys(vars)) if (!["light", "dark", "theme"].includes(key)) unknown.push(`cssVars.${key}`);
  const visit = (object, wrappers) => {
    for (const [key, value] of Object.entries(object)) {
      const at = atName(key);
      if (at === "@keyframes") {
        if (value && typeof value === "object") blocks.push({ wrappers, prelude: collapse(key), body: value });
        else unknown.push(key);
        continue;
      }
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        unknown.push(key);
        continue;
      }
      const values = Object.values(value);
      if (values.every((entry) => typeof entry === "string")) {
        if (at && at !== "@utility" && !isTheme(key)) unknown.push(key);
        else rules.push({ wrappers, prelude: key, decls: Object.entries(value) });
      } else if (values.every((entry) => entry && typeof entry === "object" && !Array.isArray(entry)) && at && WRAPPERS.test(key)) {
        visit(value, [...wrappers, key]);
      } else {
        unknown.push(key);
      }
    }
  };
  visit(item.css ?? {}, []);
  return { rules, blocks, unknown };
}

/** The wrappers a target is matched under: `@layer base` is left out, as a rule outside it counts too. */
const matchWrappers = (wrappers) => wrappers.filter((wrapper) => collapse(wrapper) !== "@layer base").map(collapse);
const sameWrappers = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);

/** The blocks that hold a rule's selector (or one of them), under the same wrappers. */
function holders(tree, target) {
  const wanted = matchWrappers(target.wrappers);
  const out = [];
  for (const { node, wrappers } of walk(tree)) {
    if (!sameWrappers(wrappers, wanted)) continue;
    if (target.prelude.startsWith("@")) {
      if (isTheme(target.prelude) ? isTheme(node.prelude) : collapse(node.prelude) === collapse(target.prelude)) out.push(node);
    } else if (!node.prelude.startsWith("@")) out.push(node);
  }
  return out;
}

/** Whether every selector of the rule has the property in a block that names that selector. */
function hasDecl(blocks, target, prop) {
  if (target.prelude.startsWith("@")) return blocks.some((node) => node.decls.some((decl) => decl.prop === prop));
  return selectors(target.prelude).every((selector) => blocks.some((node) => selectors(node.prelude).includes(selector) && node.decls.some((decl) => decl.prop === prop)));
}

/** The block a new declaration of the rule goes in: one written for exactly that rule, the first such. */
function home(tree, target) {
  const wanted = matchWrappers(target.wrappers);
  const exact = target.prelude.startsWith("@") ? null : selectors(target.prelude).join(",");
  for (const { node, wrappers } of walk(tree)) {
    if (!sameWrappers(wrappers, wanted)) continue;
    if (target.prelude === "@theme inline" ? collapse(node.prelude) === "@theme inline" : target.prelude.startsWith("@") ? collapse(node.prelude) === collapse(target.prelude) : selectors(node.prelude).join(",") === exact) return node;
  }
  return null;
}

/** The wrapper block a new rule goes in, the deepest that exists: `@layer base`, or `@supports …` at the top level. */
function wrapperBlock(tree, wrappers) {
  let node = tree;
  let depth = 0;
  for (const wrapper of wrappers) {
    const next = node.children.find((child) => collapse(child.prelude) === collapse(wrapper));
    if (!next) break;
    node = next;
    depth += 1;
  }
  return { node, depth };
}

/** The indent the file uses for one level: what its first indented declaration starts with, else two spaces. */
function indentUnit(text) {
  return /\{[^\S\n]*\n([ \t]+)\S/.exec(text)?.[1] ?? "  ";
}

/** A block written out, its declarations and nested blocks one level in. */
function render(prelude, body, indent, unit) {
  const inner = indent + unit;
  const lines = [`${indent}${prelude.replace(/\s*\n\s*/g, `\n${indent}`)} {`];
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === "string") lines.push(`${inner}${key}: ${value};`);
    else lines.push(render(key, value, inner, unit));
  }
  lines.push(`${indent}}`);
  return lines.join("\n");
}

/** A var that names itself (`--x: var(--x)`), which the install check fails on and a browser reads as unset. */
const selfReferential = (prop, value) => prop.startsWith("--") && new RegExp(`^var\\(\\s*${prop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[,)]`).test(value.trim());

/** A theme variable: what `cssVars` and the item's own `:root` and `.dark` tokens declare, outside any at-rule. */
const isVariables = (target) => target.wrappers.length === 0 && (target.prelude === ":root" || target.prelude === ".dark" || isTheme(target.prelude)) && target.decls.every(([prop]) => prop.startsWith("--"));
const ruleKey = (target, prop) => `${target.wrappers.map(collapse).join(" ")}|${selectors(target.prelude).join(",")}|${prop}`;

/**
 * The stylesheet with what the item adds and it lacks, and what was added and left out. A theme variable the
 * stylesheet lacks is added whenever the item has it: a variable does nothing until something reads it, so a missing
 * one is never a choice the app made, and an update that skipped the stylesheet left it out. A named block, a
 * `@keyframes` or `@utility`, is added whole whenever the stylesheet has no block of that name, as a component that
 * names it draws nothing without it; one of that name the app has is never replaced. A plain rule is added only when
 * it is new since `previous` (the item at the tag the app updates from): one the app lacks that `previous` already had
 * was left out or rewritten on purpose, as a site that keeps its own corner shapes does. A stylesheet with no `.dark`
 * rule switches dark mode another way, so the item's `.dark` values are left out.
 */
export function applyItem(text, item, previous = null) {
  const tree = parseCss(text);
  if (!tree) return { text, added: [], skipped: [`the stylesheet's braces do not balance, so it is not read`] };
  const { rules: wanted, blocks, unknown } = itemTargets(item);
  const before = previous ? itemTargets(previous) : null;
  const had = new Set(before?.rules.flatMap((target) => target.decls.map(([prop]) => ruleKey(target, prop))) ?? []);
  const named = new Set([...walk(tree)].map(({ node }) => collapse(node.prelude)));
  const utility = (target) => atName(target.prelude) === "@utility";
  // A named block the app has is its own, kept as it wrote it; one it lacks comes whole, whatever the previous tag had.
  const rules = wanted
    .filter((target) => !utility(target) || !named.has(collapse(target.prelude)))
    .map((target) => (isVariables(target) || utility(target) ? target : { ...target, decls: target.decls.filter(([prop]) => !had.has(ruleKey(target, prop))) }))
    .filter((target) => target.decls.length);
  const darkClass = [...walk(tree)].some(({ node }) => !node.prelude.startsWith("@") && selectors(node.prelude).includes(".dark"));
  const unit = indentUnit(text);
  // Insertions are collected by position and applied from the end, so earlier indexes stay right.
  const inserts = [];
  const added = [];
  const skipped = unknown.map((key) => `\`${key}\`, which Ouro Current does not know how to write`);
  const appended = [];
  const levelOf = (node) => {
    let depth = 0;
    for (let at = node.parent; at && at.parent; at = at.parent) depth += 1;
    return depth;
  };
  const bare = blankComments(text);
  const addTo = (node, decls) => {
    const last = text.slice(node.open + 1, node.close).trimEnd();
    // New declarations line up with the block's last one, else with its last line, else one level in.
    const lastDecl = node.decls.at(-1);
    const lineStart = lastDecl ? text.lastIndexOf("\n", lastDecl.start - 1) : -1;
    const declIndent = lastDecl && lineStart > node.open && /^[ \t]*$/.test(text.slice(lineStart + 1, lastDecl.start)) ? text.slice(lineStart + 1, lastDecl.start) : null;
    const indent = declIndent ?? /\n([ \t]*)\S[^\n]*$/.exec(last)?.[1] ?? unit.repeat(levelOf(node) + 1);
    // A last declaration written without its semicolon (`shadcn add` leaves one so) gets it, after its value.
    const code = bare.slice(node.open + 1, node.close).trimEnd();
    // Applied from the end, an insert pushed later at the same place lands before one pushed earlier.
    inserts.push({ at: node.open + 1 + last.length, text: decls.map(([prop, value]) => `\n${indent}${prop}: ${value};`).join("") });
    if (code && !/[;{}]$/.test(code)) inserts.push({ at: node.open + 1 + code.length, text: ";" });
  };
  for (const target of rules) {
    if (target.prelude === ".dark" && !darkClass) {
      const declared = new Set([...walk(tree)].flatMap(({ node }) => node.decls.map((decl) => decl.prop)));
      if (target.decls.some(([prop]) => !declared.has(prop))) skipped.push("its `.dark` values, because the stylesheet has no `.dark` rule (it switches dark mode another way)");
      continue;
    }
    const found = holders(tree, target);
    const missing = target.decls.filter(([prop, value]) => {
      if (hasDecl(found, target, prop)) return false;
      if (selfReferential(prop, value)) {
        skipped.push(`\`${prop}: ${value}\`, which names itself`);
        return false;
      }
      return true;
    });
    if (!missing.length) continue;
    const where = target.wrappers.length ? `\`${target.prelude.replace(/\s+/g, " ")}\` in \`${target.wrappers.join(" ")}\`` : `\`${target.prelude}\``;
    added.push({ where, names: missing.map(([prop]) => prop) });
    const block = home(tree, target);
    if (block) {
      addTo(block, missing);
      continue;
    }
    const { node, depth } = wrapperBlock(tree, target.wrappers);
    const body = Object.fromEntries(missing);
    const nested = target.wrappers.slice(depth).reduceRight((inner, wrapper) => ({ [wrapper]: inner }), { [target.prelude]: body });
    if (node === tree) appended.push(nested);
    else {
      const [[prelude, inner]] = Object.entries(nested);
      inserts.push({ at: node.open + 1 + text.slice(node.open + 1, node.close).trimEnd().length, text: `\n${render(prelude, inner, unit.repeat(levelOf(node) + 1), unit)}` });
    }
  }
  for (const target of blocks) {
    if (named.has(target.prelude)) continue;
    added.push({ where: `\`${target.prelude}\``, names: [] });
    appended.push(target.wrappers.reduceRight((inner, wrapper) => ({ [wrapper]: inner }), { [target.prelude]: target.body }));
  }
  let out = text;
  for (const { at, text: insert } of inserts.sort((a, b) => b.at - a.at)) out = `${out.slice(0, at)}${insert}${out.slice(at)}`;
  if (appended.length) {
    // Blocks the file has no home for go at its end, together, as `shadcn add` appends them.
    const merged = {};
    for (const entry of appended) {
      const [[prelude, body]] = Object.entries(entry);
      merged[prelude] = typeof body === "object" && merged[prelude] ? { ...merged[prelude], ...body } : body;
    }
    const tail = Object.entries(merged).map(([prelude, body]) => render(prelude, body, "", unit)).join("\n\n");
    out = `${out.trimEnd()}\n\n${tail}\n`;
  }
  return { text: out, added, skipped };
}

/** Whether the stylesheet holds the item: ouro-base by `--ouro-layer`; a theme by its own colours in `:root`. */
export function hasItem(text, item) {
  const tree = parseCss(text);
  if (!tree) return false;
  const declared = (prop) => [...walk(tree)].flatMap(({ node }) => node.decls).filter((decl) => decl.prop === prop);
  if (item.name === "ouro-base") return declared("--ouro-layer").length > 0;
  const light = item.cssVars?.light ?? {};
  const marks = ["primary", "ring", "border"].filter((key) => key in light);
  return marks.length > 0 && marks.every((key) => declared(`--${key}`).some((decl) => decl.value.toLowerCase() === String(light[key]).toLowerCase()));
}
