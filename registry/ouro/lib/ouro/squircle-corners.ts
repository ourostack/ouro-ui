export { squircleCorners };
export default squircleCorners;

interface Node {
  type: string;
  name?: string;
  params?: string;
  selector?: string;
  selectors?: string[];
  prop?: string;
  value?: string;
  important?: boolean;
  parent?: Node;
  nodes?: Node[];
  walkDecls?: (cb: (decl: Node) => void) => void;
  append: (node: object) => unknown;
  after: (node: object) => unknown;
  prepend: (node: object) => unknown;
  walkRules: (cb: (rule: Node) => void) => void;
}

const CLIP = "(clip-path: shape(from 0 0, close))";
const MISSING = `(not (corner-shape: squircle)) and ${CLIP}`;
const ENCLOSING_CIRCLE = 0.543;
// Ouro's two-Bezier corner (within 0.03% of the n=4 superellipse) in units of the radius: start, then each curve's two
// controls and end, drawn from the corner's left edge to its top edge.
const CORNER = [[0, 1], [0, 0.613, -0.0092, 0.3274, 0.1591, 0.1591], [0.3274, -0.0092, 0.613, 0, 1, 0]] as const;
const KEYS = ["tl", "tr", "br", "bl"] as const;
const PHYSICAL = ["border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius"];
const LONGHANDS: Record<string, number> = {
  "border-top-left-radius": 0, "border-start-start-radius": 0,
  "border-top-right-radius": 1, "border-start-end-radius": 1,
  "border-bottom-right-radius": 2, "border-end-end-radius": 2,
  "border-bottom-left-radius": 3, "border-end-start-radius": 3,
};

/**
 * A PostCSS plugin that draws Ouro's squircle corners at build time, in engines without `corner-shape` (WebKit's WKWebView).
 * Where `corner-shape` exists it sets `corner-shape: squircle` instead.
 *
 * @example
 * // vite.config.ts: css: { postcss: { plugins: [squircleCorners()] } }
 *
 * It is the one way Ouro UI draws squircles where the engine lacks `corner-shape`: it needs no code in the page.
 */
function squircleCorners(): { postcssPlugin: string; OnceExit(root: unknown): void } {
  return {
    postcssPlugin: "ouro-squircle-corners",
    OnceExit(input: unknown) {
      const root = input as Node;
      const selectors = new Set<string>();
      root.walkRules((rule) => {
        if (skipped(rule)) return;
        const corners = cornersOf(rule);
        const round = (rule.nodes ?? []).some((d) => d.prop === "corner-shape" && d.value === "round");
        if (round || corners.every((c) => c === null)) return;
        const half = halfSize(rule);
        const nodes: object[] = [];
        const radii: string[] = [];
        corners.forEach((c, i) => {
          if (c === null) return;
          const capsule = isCapsule(c.value);
          const value = !capsule && px(c.value) > half ? `${half}px` : c.value;
          const radius = capsule ? "var(--sq-capsule-radius)" : `calc(${value} * ${ENCLOSING_CIRCLE})`;
          nodes.push({ prop: `--sq-${KEYS[i]}`, value: capsule ? "var(--sq-half)" : value, important: c.important });
          // One shorthand when the rule wrote one for every corner; longhands otherwise, so a later longhand still wins.
          if (corners.every((o) => o?.whole && o.important === c.important)) radii.push(radius);
          else nodes.push({ prop: c.prop, value: radius, important: c.important });
        });
        if (radii.length) nodes.push({ prop: "border-radius", value: radii.every((r) => r === radii[0]) ? radii[0] : radii.join(" "), important: corners[0]!.important });
        rule.after({ name: "supports", params: MISSING, nodes: [{ selector: rule.selector, nodes }] });
        for (const s of rule.selectors ?? []) selectors.add(s);
      });
      if (selectors.size === 0) return;
      const list = [...selectors].join(",\n");
      const layer = {
        name: "layer",
        params: "squircle-corners",
        nodes: [
          { name: "supports", params: "(corner-shape: squircle)", nodes: [{ selector: list, nodes: [{ prop: "corner-shape", value: "squircle" }] }] },
          { name: "supports", params: MISSING, nodes: [{ selector: list, nodes: [{ prop: "--sq-clip", value: clipPath() }, { prop: "clip-path", value: "var(--sq-clip)" }] }] },
        ],
      };
      root.append(layer);
      root.prepend({ name: "property", params: "--sq-capsule-radius", nodes: [{ prop: "syntax", value: '"<length>"' }, { prop: "inherits", value: "false" }, { prop: "initial-value", value: "9999px" }] });
      root.prepend({ name: "property", params: "--sq-half", nodes: [{ prop: "syntax", value: '"<length>"' }, { prop: "inherits", value: "false" }, { prop: "initial-value", value: "0px" }] });
      for (const k of KEYS) root.prepend({ name: "property", params: `--sq-${k}`, nodes: [{ prop: "syntax", value: '"<length-percentage>"' }, { prop: "inherits", value: "false" }, { prop: "initial-value", value: "0px" }] });
      root.prepend({ name: "property", params: "--sq-notch", nodes: [{ prop: "syntax", value: '"*"' }, { prop: "inherits", value: "false" }] });
      root.prepend({ name: "layer", params: "squircle-corners" });
    },
  };
}

function skipped(rule: Node): boolean {
  for (let p = rule.parent; p; p = p.parent) {
    if (p.type === "rule") return true;
    if (p.type === "atrule" && (/keyframes$/.test(p.name!) || p.name === "property" || p.name === "font-face" || /corner-shape|--corner-shape/.test(p.params ?? ""))) return true;
  }
  return false;
}

interface Corner { value: string; prop: string; important: boolean; whole: boolean }

// The four corners' radii as written (top-left, top-right, bottom-right, bottom-left), each with the property that set it, or
// null for a corner the rule leaves alone. A later declaration overrides an earlier one, as in the cascade.
function cornersOf(rule: Node): (Corner | null)[] {
  const out: (Corner | null)[] = [null, null, null, null];
  // An important declaration is not overridden by a later one that is not.
  const set = (i: number, c: Corner) => void (out[i]?.important && !c.important ? null : (out[i] = c));
  for (const decl of rule.nodes ?? []) {
    if (decl.type !== "decl") continue;
    const value = decl.value!.trim();
    const important = decl.important === true;
    if (decl.prop === "border-radius" && !value.includes("/")) {
      const [a, b = a, c = a, d = b] = splitTop(value);
      [a!, b!, c!, d!].forEach((v, i) => set(i, { value: v, prop: PHYSICAL[i]!, important, whole: true }));
    } else if (decl.prop! in LONGHANDS) {
      set(LONGHANDS[decl.prop!]!, { value: splitTop(value)[0]!, prop: decl.prop!, important, whole: false });
    }
  }
  return out;
}

function splitTop(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i <= value.length; i++) {
    const ch = value[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if ((ch === " " || ch === undefined) && depth === 0) {
      if (i > start) parts.push(value.slice(start, i));
      start = i + 1;
    }
  }
  return parts;
}

const px = (v: string) => (/px$/.test(v) ? parseFloat(v) : /rem$/.test(v) ? parseFloat(v) * 16 : NaN);

// A capsule: a radius that clamps to half the shorter side. A clip path can't read the height on its horizontal axis, so
// squircle-capsules (lib/ouro) measures it and sets --sq-half; until it has, the capsule stays round.
function isCapsule(value: string): boolean {
  return /infinity/.test(value) || (/%$/.test(value) && parseFloat(value) >= 50) || px(value) >= 999;
}

// The most a px radius can be: half the smallest height or width the same rule fixes.
function halfSize(rule: Node): number {
  const sizes = (rule.nodes ?? []).filter((d) => d.prop === "height" || d.prop === "width").map((d) => px(d.value!)).filter((n) => n > 0);
  return Math.min(Infinity, ...sizes.map((n) => n / 2));
}

// One path: a rectangle far outside, minus the box, plus the squircle. Under the nonzero rule the slivers a plain circular corner
// leaves are the only part cut, so a shadow, an outline and overflow outside the corners survive. --sq-notch is one more subpath an
// element may set (a circle wound like the box cuts a hole, as an avatar's presence dot does); unset, it is an empty one. The caller
// reads this shape() back through --sq-clip rather than writing it straight into clip-path: Chromium 149 to 157 drops every later
// rule in the stylesheet when a shape() segment is a bare var(), and --sq-notch's fallback here is exactly that (ourostack/ouro-ui#3491).
function clipPath(): string {
  const n = (x: number, k: string) => `calc(var(--sq-${k}) * ${Number(x.toFixed(4))})`;
  const curves = KEYS.map((k, i) => {
    const pts: [number, number][] = [[CORNER[0]![0]!, CORNER[0]![1]!]];
    for (const c of [CORNER[1], CORNER[2]]) for (let j = 0; j < 6; j += 2) pts.push([c![j]!, c![j + 1]!]);
    const placed = pts.map(([u, v]) => [i === 1 || i === 2 ? -u : u, i >= 2 ? -v : v] as [number, number]);
    if (i === 1 || i === 3) placed.reverse();
    const rel = (p: [number, number], from: [number, number]) => `${n(p[0] - from[0], k)} ${n(p[1] - from[1], k)}`;
    return [0, 3].map((s) => `curve by ${rel(placed[s + 3]!, placed[s]!)} with ${rel(placed[s + 1]!, placed[s]!)} / ${rel(placed[s + 2]!, placed[s]!)}`).join(", ");
  });
  return [
    "shape(nonzero from -9999px -9999px", "hline to calc(100% + 9999px)", "vline to calc(100% + 9999px)", "hline to -9999px", "close",
    "move to 0 0", "vline to 100%", "hline to 100%", "vline to 0", "close",
    "move to 0 var(--sq-tl)", curves[0], "hline by calc(100% - var(--sq-tl) - var(--sq-tr))", curves[1],
    "vline by calc(100% - var(--sq-tr) - var(--sq-br))", curves[2], "hline by calc(var(--sq-br) + var(--sq-bl) - 100%)", curves[3],
    "vline by calc(var(--sq-bl) + var(--sq-tl) - 100%)", "close", "var(--sq-notch, move to 0 0, close))",
  ].join(", ");
}
