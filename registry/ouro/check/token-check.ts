export { findOffThemeIssues };

import type { PageIssue } from "./size-check.ts";

// Runs in the page (page.evaluate), so nothing in it may close over anything outside its function. A style an app wrote
// that bypasses its theme, read from the page's own style rules, whose specified values keep their var() references:
//
//   off-theme   a rule the app wrote sets a colour, a corner radius, a shadow or a font to a fixed value where the page
//               defines the theme token for it: a colour as hex, rgb(), oklch() or a name, or Tailwind's palette
//               (var(--color-red-500)) rather than the theme's colours; a radius in px or rem; a shadow of its own; a
//               font family by name. A theme change then never reaches it. The finding names the nearest token: the
//               closest theme colour, radius step or font, or the theme's shadows. A drawing's fills and strokes (in
//               an SVG) are its picture's own colours
//   off-scale   a rule the app wrote sets a padding, margin or gap to a fixed px or rem where Tailwind's --spacing step
//               is defined; the finding names the step. Spacing in em (it follows the text), fluid spacing (clamp(),
//               min(), max(), a viewport unit) and a hairline under half a step are left alone
//
// A property is judged only on a page that defines its token (a theme's --primary, --radius-md, --shadow-md or
// --font-sans, or Tailwind's --spacing), so a page with no theme has nothing to bypass.
//
// Ouro's components style themselves with Tailwind's utilities, in the utilities layer, and ship no stylesheet of their
// own. So a rule outside Tailwind's layers, or in its components layer, is the app's and is judged wherever it applies;
// a utility is judged only on an element outside every component root ([data-ouro]), where the app's own markup is.
// Tailwind's theme and base layers (its tokens and its reset) are left alone, and so are custom properties, which
// define tokens rather than use them; zero, auto, percentages and a pill's 9999px; and the system colours forced
// colours use. A rule is judged once, by its selector and property, on the first element it styles.
//
// An element opts out with data-ouro-allow="off-theme" (or "off-scale") and a reason in data-ouro-allow-why, as the other rules do.

interface OffThemeOptions {
  maxIssues?: number;
}

function findOffThemeIssues({ maxIssues = 40 }: OffThemeOptions = {}): PageIssue[] {
  const issues: PageIssue[] = [];
  const counter = window as unknown as { __ouroCheckRef?: number };
  const ref = (el: Element) => {
    counter.__ouroCheckRef = (counter.__ouroCheckRef ?? 0) + 1;
    const id = `o${counter.__ouroCheckRef}`;
    el.setAttribute("data-ouro-check-ref", `${el.getAttribute("data-ouro-check-ref") ?? ""} ${id}`.trim());
    return id;
  };
  const optedOut = (el: Element, rule: string) => {
    for (let n: Element | null = el; n; n = n.parentElement) {
      const rules = (n.getAttribute("data-ouro-allow") ?? "").split(/\s+/);
      if ((rules.includes(rule) || rules.includes("all")) && (n.getAttribute("data-ouro-allow-why") ?? "").trim()) return true;
    }
    return false;
  };
  const describe = (el: Element) => {
    const words = (el.getAttribute("aria-label") || (el as HTMLElement).innerText || el.getAttribute("title") || "").trim().replace(/\s+/g, " ");
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${el.classList.length ? `.${[...el.classList].slice(0, 3).join(".")}` : ""}${words ? ` "${words.slice(0, 40)}${words.length > 40 ? "…" : ""}"` : ""}`;
  };

  // The theme's tokens, as the page defines them on its root. The radius steps are page variables, or, where a theme maps
  // them inline (shadcn's @theme inline), shadcn's own multiples of --radius.
  const rootStyle = getComputedStyle(document.documentElement);
  const defined = (name: string) => rootStyle.getPropertyValue(name).trim() !== "";
  const colorTokens = [
    "background", "foreground", "card", "card-foreground", "popover", "popover-foreground", "primary", "primary-foreground",
    "secondary", "secondary-foreground", "muted", "muted-foreground", "accent", "accent-foreground", "destructive",
    "destructive-foreground", "success", "success-foreground", "warning", "warning-foreground", "border", "input", "ring",
  ].filter((name) => defined(`--${name}`));
  const radiusFactors: Record<string, number> = { sm: 0.6, md: 0.8, lg: 1, xl: 1.4, "2xl": 1.8 };
  const radiusTokens = Object.keys(radiusFactors).filter((step) => defined(`--radius-${step}`) || defined("--radius"));
  const shadowTokens = ["xs", "sm", "md", "lg", "xl", "2xl"].filter((step) => defined(`--shadow-${step}`));
  const fontTokens = ["sans", "serif", "mono", "heading"].filter((name) => defined(`--font-${name}`));
  const spacing = defined("--spacing");
  if (!colorTokens.length && !radiusTokens.length && !shadowTokens.length && !fontTokens.length && !spacing) return issues;

  // A probe reads what a value computes to, so a fixed value can be set beside each token.
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;left:-9999px;top:0;width:10px;height:10px;visibility:hidden;pointer-events:none";
  document.body.append(probe);
  const computed = (property: string, value: string) => {
    probe.style.setProperty(property, value);
    const out = getComputedStyle(probe).getPropertyValue(property);
    probe.style.removeProperty(property);
    return out;
  };
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const paint = canvas.getContext("2d", { willReadFrequently: true })!;
  const rgb = (color: string) => {
    paint.clearRect(0, 0, 1, 1);
    paint.fillStyle = "#000";
    paint.fillStyle = color;
    paint.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = paint.getImageData(0, 0, 1, 1).data;
    return { r: r!, g: g!, b: b!, a: a! / 255 };
  };
  const px = (length: string) => parseFloat(computed("width", length));
  const tokenColors = colorTokens.map((name) => ({ name, color: rgb(computed("color", `var(--${name})`)) }));
  const radiusValue = (step: string) =>
    defined(`--radius-${step}`) ? `var(--radius-${step})` : radiusFactors[step] === 1 ? "var(--radius)" : `calc(var(--radius) * ${radiusFactors[step]})`;
  const radiusSteps = radiusTokens.map((step) => ({ step, px: parseFloat(computed("border-top-left-radius", radiusValue(step))) }));
  const spacingPx = spacing ? px("var(--spacing)") : 0;
  const lengths = (value: string) => [...value.matchAll(/(-?\d*\.?\d+(?:e[+-]?\d+)?)(px|rem|em)\b/gi)].map(([, n, unit]) => ({ n: Number(n), unit: unit! }));

  // Colours. Each property takes the tokens that fit what it paints, and the class that sets them: text a foreground, a
  // fill a surface, a border or an outline the line tokens; a fill or stroke in an SVG, an accent or a caret any token.
  const roles: [RegExp, string, string[]][] = [
    [/^color$|^text-|^caret-/, "text", ["foreground", "muted-foreground", "primary", "destructive", "success", "warning", "card-foreground", "popover-foreground", "primary-foreground", "secondary-foreground", "accent-foreground", "destructive-foreground"]],
    [/^background/, "bg", ["card", "background", "popover", "muted", "secondary", "accent", "primary", "destructive", "success", "warning"]],
    [/^border/, "border", ["border", "input", "ring", "primary", "destructive", "foreground", "muted-foreground"]],
    [/^outline/, "outline", ["ring", "border", "primary", "destructive", "foreground"]],
  ];
  const colorUse = (property: string, value: string) => {
    const [, prefix, fitting] = roles.find(([test]) => test.test(property)) ?? [null, "", colorTokens];
    const pool = fitting.flatMap((name) => tokenColors.filter((token) => token.name === name));
    const from = pool.length ? pool : tokenColors;
    const literal = value.match(/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^)]*\)|var\(--color-[a-z]+(?:-\d+)?\)/i)?.[0] ?? value;
    const c = rgb(computed("color", literal));
    const distance = (t: (typeof tokenColors)[number]) => (t.color.r - c.r) ** 2 + (t.color.g - c.g) ** 2 + (t.color.b - c.b) ** 2;
    const best = from.reduce((a, b) => (distance(b) < distance(a) ? b : a));
    return prefix ? `var(--${best.name}) (${prefix}-${best.name})` : `var(--${best.name})`;
  };
  const system = new Set(["canvas", "canvastext", "linktext", "visitedtext", "activetext", "buttonface", "buttontext", "buttonborder", "field", "fieldtext", "highlight", "highlighttext", "selecteditem", "selecteditemtext", "mark", "marktext", "graytext", "accentcolor", "accentcolortext"]);
  const palette = /var\(--color-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|mauve|olive|mist|taupe)-\d+\b|var\(--color-(?:white|black)\)/;
  // Hex, a colour function or a colour's name, or Tailwind's palette; a fully see-through colour paints nothing.
  const fixedColor = (value: string) => {
    if (palette.test(value)) return true;
    if (value.includes("var(")) return false;
    const literal = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i.test(value);
    const named = /^[a-z]+$/i.test(value) && !system.has(value.toLowerCase());
    return (literal || named) && rgb(value).a > 0;
  };

  const kinds: {
    kind: string;
    rule: "off-theme" | "off-scale";
    test: (property: string) => boolean;
    on: boolean;
    fixed: (value: string, property: string) => boolean;
    use: (value: string, property: string, el: Element) => string;
  }[] = [
    {
      kind: "colour",
      rule: "off-theme",
      test: (p) => /(^|-)color$/.test(p) || p === "fill" || p === "stroke" || p === "background-image",
      on: colorTokens.length > 0,
      // A background picture counts only as a gradient, by the colours it names outside the theme's.
      fixed: (v, p) => (p === "background-image" ? /gradient\(/.test(v) && fixedColor(v.replace(/var\([^)]*\)/g, "")) : fixedColor(v)),
      use: (v, p) => colorUse(p, v),
    },
    {
      kind: "radius",
      rule: "off-theme",
      test: (p) => /^border-.*radius$/.test(p),
      on: radiusTokens.length > 0,
      // A pill's 9999px and a circle's 50% are shapes, not steps.
      fixed: (v) => !v.includes("var(") && lengths(v).some(({ n, unit }) => n !== 0 && !(unit === "px" && n >= 999)),
      use: (v) => {
        const want = parseFloat(computed("border-top-left-radius", v.split(/\s+/)[0]!));
        const best = radiusSteps.reduce((a, b) => (Math.abs(b.px - want) < Math.abs(a.px - want) ? b : a));
        return `${radiusValue(best.step)} (rounded-${best.step})`;
      },
    },
    {
      kind: "shadow",
      rule: "off-theme",
      test: (p) => p === "box-shadow",
      on: shadowTokens.length > 0,
      fixed: (v) => !v.includes("var("),
      use: () => {
        const step = shadowTokens.includes("md") ? "md" : shadowTokens[0];
        return `one of the theme's shadows, such as var(--shadow-${step}) (shadow-(--shadow-${step}))`;
      },
    },
    {
      kind: "font",
      rule: "off-theme",
      test: (p) => p === "font-family",
      on: fontTokens.length > 0,
      fixed: (v) => !v.includes("var("),
      use: (_v, _p, el) => {
        const want = [
          [el.matches("h1, h2, h3, h4, h5, h6"), "heading"],
          [el.matches("code, pre, kbd, samp"), "mono"],
          [true, "sans"],
        ].find(([match, name]) => match && fontTokens.includes(name as string))?.[1] ?? fontTokens[0];
        return `var(--font-${want})`;
      },
    },
    {
      kind: "spacing",
      rule: "off-scale",
      test: (p) => /^(padding|margin)(-|$)/.test(p) || /^(row-|column-)?gap$/.test(p),
      on: spacing,
      // Spacing in em follows the text's size, and clamp(), min(), max() or a viewport unit is fluid: layout choices the
      // spacing scale doesn't make. A length under half a step is a hairline, not a step.
      fixed: (v) =>
        !v.includes("var(") &&
        !/\b(?:clamp|min|max)\(|\d(?:vw|vh|vi|vb|dvh|svh|lvh|cq\w*)\b/.test(v) &&
        lengths(v).some(({ n, unit }) => unit !== "em" && Math.abs(px(`${n}${unit}`)) >= spacingPx / 2),
      use: (v, p) => {
        const first = lengths(v).find(({ n, unit }) => unit !== "em" && Math.abs(px(`${n}${unit}`)) >= spacingPx / 2)!;
        const steps = Math.round(Math.abs(px(`${first.n}${first.unit}`)) / spacingPx);
        const prefix = p.startsWith("padding") ? "p" : p.startsWith("margin") ? "m" : "gap";
        return `calc(var(--spacing) * ${steps}) (${prefix}-${steps})`;
      },
    },
  ];
  const keywords = new Set(["transparent", "currentcolor", "inherit", "initial", "unset", "revert", "revert-layer", "none", "auto"]);
  // A property by the family its longhands share, so border-radius or padding is one finding, not four.
  const family = (property: string) =>
    [
      [/^border-.*radius$/, "border-radius"],
      [/^border-.*color$/, "border-color"],
      [/^padding/, "padding"],
      [/^margin/, "margin"],
      [/gap$/, "gap"],
    ].find(([test]) => (test as RegExp).test(property))?.[1] ?? property;

  // The page's style rules, each with the layer it is in and the outermost style rule around it, whose selector picks
  // the elements: a nested rule only narrows to a state.
  const found: { rule: CSSStyleRule; layer: string; selector: string }[] = [];
  const walk = (list: CSSRuleList, layer: string, outer: string) => {
    for (const rule of Array.from(list)) {
      if (rule instanceof CSSLayerBlockRule) walk(rule.cssRules, rule.name.split(".")[0] || layer, outer);
      else if (rule instanceof CSSStyleRule) {
        const selector = outer || rule.selectorText;
        found.push({ rule, layer, selector });
        walk(rule.cssRules, layer, selector);
      } else if (rule instanceof CSSMediaRule || rule instanceof CSSSupportsRule || rule instanceof CSSContainerRule) walk(rule.cssRules, layer, outer);
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      walk(sheet.cssRules, "", "");
    } catch {
      // A stylesheet from another origin can't be read; it isn't the app's own.
    }
  }
  // States and pseudo-elements a selector names but querySelectorAll can't match now.
  const plain = (selector: string) =>
    selector
      .replace(/::?(?:before|after|placeholder|selection|marker|backdrop|first-line|first-letter|file-selector-button|-webkit-[a-z-]+|-moz-[a-z-]+)(?![\w-])/g, "")
      .replace(/:(?:hover|focus|focus-visible|focus-within|active|visited|target)(?![\w-])/g, "");

  const seen = new Set<string>();
  try {
    for (const { rule, layer, selector } of found) {
      if (layer === "theme" || layer === "base") continue;
      for (let i = 0; i < rule.style.length && issues.length < maxIssues; i++) {
        const property = rule.style[i]!;
        // A custom property defines a token rather than using one.
        const kind = property.startsWith("--") ? undefined : kinds.find((k) => k.on && k.test(property));
        const value = rule.style.getPropertyValue(property).trim();
        if (!kind || !value || keywords.has(value.toLowerCase()) || !kind.fixed(value, property)) continue;
        const key = `${selector}\u0000${family(property)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        let elements: Element[];
        try {
          elements = [...document.querySelectorAll(plain(selector) || "*")];
        } catch {
          continue;
        }
        // A utility on an Ouro component's own element is the component's; a drawing's fills are its picture's.
        const el = elements.find(
          (e) => e !== probe && !(layer === "utilities" && e.closest("[data-ouro]")) && !(kind.kind === "colour" && e.closest("svg")) && !optedOut(e, kind.rule),
        );
        if (!el) continue;
        issues.push({
          ref: ref(el),
          rule: kind.rule,
          element: describe(el),
          // The shorthand's value where the rule has one, as it was written.
          detail: `${rule.selectorText} sets ${family(property)}: ${rule.style.getPropertyValue(family(property)).trim() || value}, a fixed ${kind.kind}; use ${kind.use(value, property, el)}`,
        });
      }
    }
  } finally {
    probe.remove();
  }
  return issues;
}
