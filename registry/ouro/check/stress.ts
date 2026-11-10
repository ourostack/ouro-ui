export { applyStress, STRESSES };
export type { Stress };

const STRESSES = ["zoom", "large-text", "contrast", "forced-colors", "long-text", "counts"] as const;
type Stress = (typeof STRESSES)[number];

// Runs in the page after the configured state is reached. Media and viewport inputs are set on its fresh context.
function applyStress(stress: Stress): void {
  const visible = (element: Element): boolean => {
    if (element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return true;
    const style = getComputedStyle(element);
    if (style.display !== "contents" || style.visibility !== "visible") return false;
    const range = document.createRange();
    range.selectNodeContents(element);
    if (![...range.getClientRects()].some((rect) => rect.width > 0 && rect.height > 0)) return false;
    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      if (getComputedStyle(ancestor).display !== "contents" && !ancestor.checkVisibility({ checkOpacity: true })) return false;
    }
    return true;
  };
  if (stress === "large-text") {
    if (document.querySelector("[data-ouro-check-large-text]")) return;
    const sizes = [...document.querySelectorAll("html, body, body *")]
      .filter((element) => visible(element) && !element.closest("[data-ouro-check-stress-skip]"))
      .map((element) => ({ element, size: parseFloat(getComputedStyle(element).fontSize) * 2 }));
    const inline = document.createElement("span").style;
    for (const { element, size } of sizes) {
      inline.cssText = element.getAttribute("style") ?? "";
      inline.setProperty("font-size", `${size}px`, "important");
      element.setAttribute("style", inline.cssText);
    }
    document.documentElement.setAttribute("data-ouro-check-large-text", "");
    return;
  }
  if (stress !== "long-text" && stress !== "counts") return;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement!;
    if (parent.closest("script, style, noscript, template, textarea, code, pre, svg, [contenteditable]:not([contenteditable=false]), [data-ouro-check-stress-skip]")) continue;
    if (!visible(parent)) continue;
    const text = node.textContent!;
    if (!text.trim()) continue;
    node.textContent = stress === "long-text" ? text.replace(/\S(?:[\s\S]*\S)?/, (label) => `${label} ${label} ${label}`) : text.replace(/^(\s*)\d+\+?(\s*)$/, "$1999+$2");
  }
}
