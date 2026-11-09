import assert from "node:assert/strict";
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { EXIT } from "../../registry/ouro/check/check.ts";
import { FADE_FIX, findFades, main, SCANNED, SKIPPED, scan } from "../../registry/ouro/check/fades.ts";

// The fade check (registry/ouro/check/fades.ts): every syntax a gradient mask is written in fails, the masks that fade
// no picture pass with a reason, and the command exits as check.ts does. scripts/check.test.mjs runs this file under
// Node's coverage with check.test.mts and holds fades.ts to 100%.

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const scratch = join(root, ".tmp", `fades-${process.pid}`);
mkdirSync(scratch, { recursive: true });
after(() => rmSync(scratch, { recursive: true, force: true }));
let made = 0;
const tree = (files: Record<string, string>) => {
  const folder = join(scratch, `tree-${++made}`);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, file)), { recursive: true });
    writeFileSync(join(folder, file), text);
  }
  return folder;
};
const lines = (text: string) => findFades(text, "x").map((fade) => fade.line);
const run = async (argv: string[], cwd = scratch, env: Record<string, string | undefined> = {}) => {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main(argv, { cwd, env, log: (line) => out.push(line), error: (line) => err.push(line) });
  return { code, out: out.join("\n"), err: err.join("\n") };
};

describe("the fade check", () => {
  test("finds a gradient mask in a stylesheet: mask-image, -webkit-mask-image, mask and -webkit-mask, over several lines too", () => {
    const planted = [
      ".hero img { mask-image: linear-gradient(to bottom, #000 70%, transparent); }",
      ".hero img { -webkit-mask-image: radial-gradient(circle, #000 60%, transparent 100%); }",
      ".hero { mask: linear-gradient(#000, transparent) no-repeat; }",
      ".hero { -webkit-mask: url(shape.svg), repeating-linear-gradient(#000 0 4px, transparent 4px 8px); }",
      ".hero { mask-image:\n  conic-gradient(\n    #000, transparent\n  );\n}",
      '<img src="hero.jpg" alt="" style="mask-image: linear-gradient(to top, transparent, #000 40%)">',
    ];
    for (const text of planted) assert.deepEqual(lines(text), [1], text);
    assert.deepEqual(findFades(planted[0]!, "app.css"), [{ file: "app.css", line: 1, declaration: "mask-image: linear-gradient(to bottom, #000 70%, transparent)" }]);
  });

  test("finds a gradient mask in Tailwind: an arbitrary property or value, and every gradient mask utility, under any variant", () => {
    const planted = [
      '<img className="[mask-image:linear-gradient(to_bottom,#000_70%,transparent)]" />',
      '<img className="md:[-webkit-mask-image:linear-gradient(#000,transparent)]" />',
      '<img className="mask-[radial-gradient(#000,transparent)]" />',
      '<img className="mask-b-from-60%" />',
      '<img className="w-full mask-t-to-90% object-cover" />',
      '<img class="mask-linear-to-transparent" />',
      '<img class="-mask-linear-45 mask-linear-from-white" />',
      '<img class="hover:mask-radial-from-40%" />',
      '<img class="mask-conic-from-75%" />',
      '<img class="mask-x-from-80% mask-y-to-10%" />',
      ".hero img { @apply mask-l-from-50%; }",
    ];
    for (const text of planted) assert.deepEqual(lines(text), [1], text);
    assert.equal(findFades(planted[2]!, "x")[0]!.declaration, "mask-[radial-gradient(#000,transparent)]");
    assert.equal(findFades(planted[3]!, "x")[0]!.declaration, "mask-b-from-60%");
  });

  test("finds a gradient mask in a style object or a setProperty call", () => {
    const planted = [
      '<img style={{ maskImage: "linear-gradient(to bottom, #000, transparent)" }} />',
      "const style = { WebkitMaskImage: `linear-gradient(${side}, #000, transparent)`, color: 'red' };",
      "const style = { webkitMaskImage: fade ? 'linear-gradient(#000, transparent)' : 'none' };",
      '<img style={{ "mask-image": "radial-gradient(#000, transparent)" }} />',
      'img.style.setProperty("-webkit-mask-image", "linear-gradient(#000, transparent)");',
      "const style = { WebkitMask: 'linear-gradient(#000, transparent)' };",
    ];
    for (const text of planted) assert.deepEqual(lines(text), [1], text);
  });

  test("passes a mask with no gradient, a gradient that is no mask, and code that reads a mask", () => {
    const allowed = [
      ".logo { mask-image: url(logo.svg); mask-size: cover; mask-mode: alpha; mask-repeat: no-repeat; }",
      ".hero { mask-image: none; -webkit-mask: none; }",
      ".sky { background-image: linear-gradient(to bottom, #9cf, #fff); }",
      '<div className="bg-linear-to-b from-sky-200 to-white" />',
      "<OtpField label=\"PIN\" mask defaultValue=\"1234\" />\nconst args = { mask: true, label: 'PIN' };\nconst types = { mask: { control: \"boolean\" } };\nconst sky = 'linear-gradient(#9cf, #fff)';",
      'expect(getComputedStyle(box).maskImage).toContain("linear-gradient");',
      "// A mask: it fades nothing\nconst masked = mask;\nconst sky = 'linear-gradient(#9cf, #fff)';",
      "/* a mask: (don't fade it */",
      '<div className="[mask-image:url(shape.svg)] mask-[url(shape.svg)] mask-linearly" />',
    ];
    for (const text of allowed) assert.deepEqual(lines(text), [], text);
  });

  test("passes a gradient mask that says why on its line or the line before, and only with a reason", () => {
    assert.deepEqual(lines(".row { mask-image: linear-gradient(to right, #000 90%, transparent); } /* fade-ok: fades a scrolling row of links */"), []);
    assert.deepEqual(lines("// fade-ok: fades folded text, not a picture\nconst fold = '[mask-image:linear-gradient(#000,transparent)]';"), []);
    assert.deepEqual(lines('<!-- fade-ok: fades the hidden end of a row of tabs -->\n<div style="mask-image: linear-gradient(#000, transparent)"></div>'), []);
    assert.deepEqual(lines("{/* fade-ok: fades a code block's hidden end */}\n<pre className=\"mask-r-from-90%\" />"), []);
    // No reason, a reason of only a comment's closing marks, or a marker two lines up: each still fails.
    assert.deepEqual(lines(".row { mask-image: linear-gradient(#000, transparent); } /* fade-ok: */"), [1]);
    assert.deepEqual(lines("<!-- fade-ok: -->\n<div style=\"mask-image: linear-gradient(#000, transparent)\"></div>"), [2]);
    assert.deepEqual(lines("{/* fade-ok: */}\n<img className=\"mask-b-from-50%\" />"), [2]);
    assert.deepEqual(lines("// fade-ok: fades text\n\n.hero { mask-image: linear-gradient(#000, transparent); }"), [3]);
  });

  test("reports a line once, however many masks it holds, in line order, and shortens a long declaration", () => {
    const text = [
      ".a { color: red; }",
      ".b { mask: linear-gradient(#000, transparent); -webkit-mask: linear-gradient(#000, transparent); }",
      '<img class="mask-b-from-50% mask-t-from-50%" style="mask-image: linear-gradient(#000, transparent)">',
      `.c { mask-image: linear-gradient(to bottom, ${Array.from({ length: 30 }, (_, i) => `#000 ${i}%`).join(", ")}, transparent); }`,
    ].join("\n");
    const fades = findFades(text, "x");
    assert.deepEqual(fades.map((fade) => fade.line), [2, 3, 4]);
    assert.equal(fades[2]!.declaration.length, 160);
    assert.ok(fades[2]!.declaration.endsWith("…"));
  });

  test("reads every source an app styles pictures in, and never dependencies, build output or hidden folders", async () => {
    const mask = "mask-image: linear-gradient(#000, transparent);";
    const files = Object.fromEntries(SCANNED.map((ext) => [`src/page${ext}`, `.x { ${mask} }`]));
    const folder = tree({
      ...files,
      "src/deep/er/hero.css": `.hero { ${mask} }`,
      "src/notes.md": `\`${mask}\``,
      ...Object.fromEntries(SKIPPED.map((skipped) => [`${skipped}/x.css`, `.x { ${mask} }`])),
      "src/node_modules/x.css": `.x { ${mask} }`,
      ".astro/x.css": `.x { ${mask} }`,
      "src/.cache/x.css": `.x { ${mask} }`,
    });
    const fades = await scan([folder], folder);
    assert.deepEqual(
      fades.map((fade) => fade.file),
      [...SCANNED.map((ext) => `src/page${ext}`), "src/deep/er/hero.css"].sort(),
    );
    // A file named on its own is read whatever its extension, and once however often it is named.
    assert.deepEqual((await scan(["src/notes.md", "src/notes.md", "src/deep"], folder)).map((fade) => fade.file), ["src/deep/er/hero.css", "src/notes.md"]);
  });

  test("keeps Ouro HX's own masks, which fade text and controls, each with its reason", async () => {
    assert.deepEqual(await scan(["registry"], root), []);
  });
});

describe("the fade check's command", () => {
  test("prints each finding with its place, its declaration and the fix, and exits 3", async () => {
    const folder = tree({ "src/hero.css": ".hero {\n  mask-image: linear-gradient(to bottom, #000 70%, transparent);\n}\n", "src/ok.css": ".ok { color: red; }" });
    const result = await run(["src"], folder);
    assert.equal(result.code, EXIT.findings);
    assert.equal(result.out, `src/hero.css:2: mask-image: linear-gradient(to bottom, #000 70%, transparent)\n  Fix: ${FADE_FIX}.\n\n1 gradient mask to fix.`);
    assert.match(FADE_FIX, /^end the picture on a hard edge, or put it on a solid band; if this mask fades text or controls rather than a picture, mark it `fade-ok: <why>`$/);
    const two = tree({ "a.css": ".a { mask: linear-gradient(#000, transparent); }", "b.tsx": '<img className="mask-b-from-50%" />' });
    const annotated = await run(["."], two, { GITHUB_ACTIONS: "true" });
    assert.equal(annotated.code, EXIT.findings);
    assert.match(annotated.out, /^::error file=a\.css,line=1,title=Picture fade::mask: linear-gradient\(#000, transparent\): end the picture/m);
    assert.match(annotated.out, /^::error file=b\.tsx,line=1,title=Picture fade::mask-b-from-50%: /m);
    assert.match(annotated.out, /\n2 gradient masks to fix\.$/);
  });

  test("exits 0 with nothing to fix", async () => {
    const folder = tree({ "a.css": ".a { mask-image: linear-gradient(#000, transparent); } /* fade-ok: fades a scrolling row */" });
    assert.deepEqual(await run([folder]), { code: EXIT.ok, out: "No gradient masks without a fade-ok reason.", err: "" });
  });

  test("prints its usage for --help, exits 2 on a usage problem, and 1 when a file cannot be read", async () => {
    for (const flag of ["--help", "-h"]) {
      const help = await run([flag]);
      assert.equal(help.code, EXIT.ok);
      assert.match(help.out, /^Usage: node lib\/ouro\/check\/fades\.ts <folder \| file>…/);
    }
    const none = await run([]);
    assert.equal(none.code, EXIT.usage);
    assert.match(none.err, /^Name a folder or a file to check\.\n\nUsage:/);
    const wrong = await run(["src", "--fix"]);
    assert.equal(wrong.code, EXIT.usage);
    assert.match(wrong.err, /^Unknown option --fix\.\n\nUsage:/);
    const missing = await run(["no-such-folder"]);
    assert.equal(missing.code, EXIT.usage);
    assert.match(missing.err, /^no-such-folder is not a folder or a file\.\n\nUsage:/);
    const broken = tree({ "a.css": ".a {}" });
    symlinkSync(join(broken, "gone.css"), join(broken, "link.css"));
    const unreadable = await run([broken]);
    assert.equal(unreadable.code, EXIT.error);
    assert.match(unreadable.err, /^The fade check stopped before it finished: ENOENT/);
  });
});
