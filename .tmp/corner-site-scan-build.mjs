import { readFileSync, writeFileSync } from "node:fs";

let source = readFileSync("registry/ouro/check/squircle-paint.ts", "utf8");
const replace = (before, after) => {
  const parts = source.split(before);
  if (parts.length !== 2) throw new Error(`Expected one diagnostic insertion: ${before}`);
  source = parts.join(after);
};
replace("  const capture = (window as unknown as { __ouroPaintCapture?: PaintCapture }).__ouroPaintCapture;",
  "  const capture = (window as unknown as { __ouroPaintCapture?: PaintCapture }).__ouroPaintCapture;\n  let pixelIndex = 0;");
replace("  for (const el of targets) {", '  for (const el of targets) {\n    if (!el.hasAttribute("data-corner-debug")) continue;');
replace("          if (delta >= 64 || (x > startX && row[x - 1]) || previous[x]) {",
  "          if (delta >= 64 || (x > startX && row[x - 1]) || previous[x]) {\n            pixelIndex = index;");
replace("            if (differs) { found = differs; break; }", `            if (differs) {
              const rgba = (await Promise.all([actual, masked, hidden, ...(solo ? [solo] : [])].map(pixels))).map((image) => [...image.data.slice(pixelIndex, pixelIndex + 4)]);
              const computed = getComputedStyle(el);
              console.log("INLINE-CORNER", JSON.stringify({ point: differs, rgba, rect: r.toJSON(), clip, corners: initial.corners, fragments: fragments.map((fragment) => ({ ...fragment, rect: fragment.rect.toJSON() })), display: computed.display, decoration: computed.boxDecorationBreak, radius: computed.borderRadius, clipPath: computed.clipPath, background: computed.backgroundColor }));
              found = differs;
              break;
            }`);
writeFileSync(".tmp/squircle-site-diag.ts", source);
