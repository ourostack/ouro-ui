import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(source, before, after) {
  const parts = source.split(before);
  if (parts.length !== 2) throw new Error(`Expected one diagnostic insertion: ${before}`);
  return parts.join(after);
}

let source = readFileSync("registry/ouro/check/squircle-paint.ts", "utf8");
source = replaceOnce(source,
  "  const capture = (window as unknown as { __ouroPaintCapture?: PaintCapture }).__ouroPaintCapture;",
  `  const capture = (window as unknown as { __ouroPaintCapture?: PaintCapture }).__ouroPaintCapture;
  const diagnostic = (window as unknown as { __ouroPaintDiagnostic?: (data: object) => Promise<void> }).__ouroPaintDiagnostic;`,
);
source = replaceOnce(source,
  "            let withoutStrokes: string | null = null;",
  `            if (el.id === "surface" && el.classList.contains("broken")) {
              const style = getComputedStyle(el);
              console.log("PAINT-CASE", JSON.stringify({ html: el.outerHTML, clip: style.clipPath, radius: style.borderRadius, corners: initial.corners, native: initial.native, differs, roundedEffects }));
              await diagnostic?.({ actual, masked, hidden, solo, withoutEffects, rect: r.toJSON(), clip, differs });
            }
            let withoutStrokes: string | null = null;`,
);
writeFileSync("registry/ouro/check/squircle-paint.ts", source);

let tests = readFileSync("scripts/check/check-corners.test.mts", "utf8");
tests = replaceOnce(tests,
  'import { readFileSync } from "node:fs";',
  'import { readFileSync, writeFileSync, mkdirSync } from "node:fs";',
);
tests = replaceOnce(tests,
  "async function bindCapture(tab: Page) {",
  `let diagnosticCount = 0;
async function bindCapture(tab: Page) {
  tab.on("console", (message) => console.log(message.text()));
  await tab.exposeBinding("__ouroPaintDiagnostic", (_, data) => {
    const root = ".tmp/paint-cases";
    mkdirSync(root, { recursive: true });
    const id = ++diagnosticCount;
    for (const key of ["actual", "masked", "hidden", "solo", "withoutEffects"]) {
      if (data[key]) writeFileSync(\`\${root}/\${id}-\${key}.png\`, Buffer.from(data[key], "base64"));
    }
    writeFileSync(\`\${root}/\${id}.json\`, JSON.stringify({ rect: data.rect, clip: data.clip, differs: data.differs }));
  });`,
);
writeFileSync("scripts/check/check-corners.test.mts", tests);
