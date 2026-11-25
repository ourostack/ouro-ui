export { installSquircleCapsules, capsuleHalf };

// What stays round, whatever its radius: a switch, a radio, a slider's thumb, a presence dot and a spinner.
const ROUND = [
  '[data-ouro-control="switch"]', '[data-ouro-control="switch"] *', "input[type=radio]", "[role=radio] [data-ouro-menu-indicator]",
  "[role=slider]", "input[type=range]", "[data-ouro-avatar-presence]", "[data-ouro-avatar-presence] *", '[data-ouro="spinner"]', '[data-ouro="spinner"] *',
].join(",");
const ENCLOSING_CIRCLE = 0.543;

/** The radius of a capsule: half its shorter side, in eighths of a pixel so a half-pixel of layout jitter writes nothing. */
function capsuleHalf(inline: number, block: number): number {
  return Math.round(Math.min(inline, block) * 4) / 8;
}

function selectorsOf(rules: CSSRuleList, out: string[]): void {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSStyleRule && rule.cssText.includes("--sq-half")) out.push(rule.selectorText);
    else if ("cssRules" in rule) selectorsOf((rule as CSSGroupingRule).cssRules, out);
  }
}

/**
 * Draws capsules as squircles where the engine lacks `corner-shape`. Sets `--sq-half` on capsules, the variable the
 * clip from `squircleCorners()` waits on. Use it once at the root; `OuroProvider` calls it for you. It does nothing where `corner-shape` is drawn or
 * `clip-path: shape()` is missing, and returns a function that stops it.
 * @example
 * const stop = installSquircleCapsules(document);
 */
function installSquircleCapsules(doc: Document): () => void {
  const css = doc.defaultView!.CSS;
  if (css.supports("corner-shape", "squircle") || !css.supports("clip-path", "shape(from 0 0, close)")) return () => {};
  const done = new WeakMap<Element, number>();
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const size = entry.borderBoxSize[0]!;
      const half = capsuleHalf(size.inlineSize, size.blockSize);
      if (done.get(entry.target) === half) continue;
      done.set(entry.target, half);
      const style = (entry.target as HTMLElement).style;
      style.setProperty("--sq-half", `${half}px`);
      style.setProperty("--sq-capsule-radius", `${half * ENCLOSING_CIRCLE}px`);
    }
  });
  const watched = new Set<Element>();
  const watch = (root: ParentNode) => {
    // Stryker disable next-line ArrayDeclaration: a stray starting entry is a syntactically valid, unmatched compound selector in the join, so it changes which elements match nothing.
    const selectors: string[] = [];
    for (const sheet of Array.from(doc.styleSheets)) {
      try {
        selectorsOf(sheet.cssRules, selectors);
      } catch {
        // A cross-origin sheet is not ours.
      }
    }
    if (!selectors.length) return;
    for (const el of Array.from(root.querySelectorAll(selectors.join(",")))) {
      if (watched.has(el) || el.matches(ROUND)) continue;
      watched.add(el);
      observer.observe(el, { box: "border-box" });
    }
  };
  watch(doc);
  const mutations = new MutationObserver(() => watch(doc));
  mutations.observe(doc.documentElement, { childList: true, subtree: true });
  return () => {
    observer.disconnect();
    mutations.disconnect();
    // Stryker disable next-line CallExpression: both observers are already disconnected, so nothing reads watched again; clearing it only frees the elements it held onto.
    watched.clear();
  };
}
