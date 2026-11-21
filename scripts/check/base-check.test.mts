import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { baseImport, checkBase, compareBase, readRules, runBaseCheck } from "../../registry/ouro/check/base-check.ts";

// The Ouro base check (registry/ouro/check/base-check.ts): an app's stylesheet against ouro-base at the tag its pin
// names, for a stylesheet that imports ouro-base's own file and for one that holds its rules. scripts/check.test.mjs
// runs this file under Node's coverage and holds base-check.ts to 100%.

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const scratch = join(root, ".tmp", `base-check-${process.pid}`);
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
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

const BASE = `/* ouro-base */
@theme inline {
  --radius-ouro-md: calc(var(--radius) * 0.8);
}
:root {
  --input: oklch(0.922 0 0);
  --radius: 0.9375rem;
  --ouro-layer: 50;
  --success-foreground: #ffffff;
  --ouro-ease: cubic-bezier(0.23, 1, 0.32, 1);
}
@layer base {
  [data-ouro][class*="rounded"], [data-ouro] [class*="rounded"] {
    corner-shape: var(--ouro-corner-shape);
  }
  @media (width >= 150rem) {
    html {
      font-size: 112.5%;
    }
  }
}
@supports not (corner-shape: squircle) {
  :root {
    --ouro-corner-fallback: 0.7;
  }
}
@utility press {
  transition: scale 160ms;
}
@keyframes ouro-spin {
  to {
    rotate: 1turn;
  }
}
`;

describe("the Ouro base check", () => {
  test("reads each declaration under its at-rules and its own selector, and each keyframes whole", () => {
    const rules = readRules(`${BASE}.a { content: "a;b{}"; background: url(x;y) }\n`);
    assert.equal(rules.decls.get(":root --ouro-layer"), "50");
    assert.equal(rules.decls.get("@theme inline --radius-ouro-md"), "calc(var(--radius) * 0.8)");
    assert.equal(rules.decls.get('[data-ouro] [class*="rounded"] corner-shape'), "var(--ouro-corner-shape)");
    assert.equal(rules.decls.get('[data-ouro][class*="rounded"] corner-shape'), "var(--ouro-corner-shape)");
    assert.equal(rules.decls.get("@media (width >= 150rem) html font-size"), "112.5%");
    assert.equal(rules.decls.get("@supports not (corner-shape: squircle) :root --ouro-corner-fallback"), "0.7");
    assert.equal(rules.decls.get("@utility press transition"), "scale 160ms");
    assert.equal(rules.decls.get(".a content"), '"a;b{}"');
    assert.equal(rules.decls.get(".a background"), "url(x;y)");
    assert.equal(rules.keyframes.get("@keyframes ouro-spin"), "to{rotate:1turn}");
    assert.equal(rules.decls.has("@keyframes ouro-spin to rotate"), false, "a keyframe's declarations are the keyframes'");
    assert.equal(readRules('.q { content: "\\"" }').decls.get(".q content"), '"\\""');
    assert.equal(readRules("color: red; .b { }").decls.size, 0, "a declaration outside a rule is not one");
  });

  test("finds the import of ouro-base's own file, and not one in a comment", () => {
    assert.equal(baseImport('@import "tailwindcss";\n@import "./ouro/ouro-base.css";\n'), "./ouro/ouro-base.css");
    assert.equal(baseImport("@import url('../ouro-base.css');"), "../ouro-base.css");
    assert.equal(baseImport('/* @import "./ouro/ouro-base.css"; */\n@import "tailwindcss";'), null);
  });

  test("beside the import: an override the list names passes, one it does not is drift, a copy is drift, and a stale line is drift", () => {
    const sheet = `@import "tailwindcss";\n@import "./ouro/ouro-base.css";\n:root, .dark {\n  --input: var(--app-input);\n  --radius: 1rem;\n  --success-foreground: #000;\n}\n:root {\n  --ouro-layer: 60;\n  --ouro-ease: cubic-bezier(0.23, 1, 0.32, 1);\n}\n@keyframes ouro-spin {\n  to { rotate: -1turn; }\n}\n`;
    const findings = compareBase(sheet, BASE, true, { ":root --ouro-layer": "above the app's header", ".dark --gone": "old" });
    assert.deepEqual(
      findings.map((finding) => `${finding.kind} ${finding.key}`),
      [":root --success-foreground", ":root --ouro-ease", "@keyframes ouro-spin", ".dark --gone"].map((key, index) => `${["override", "copy", "override", "stale"][index]} ${key}`),
    );
    assert.match(findings[0]!.message, /sets `#000` where ouro-base has `#ffffff`.*add ":root --success-foreground" to \.github\/ouro-base-overrides\.json/);
    assert.match(findings[1]!.message, /repeats ouro-base's/);
    assert.match(findings[3]!.message, /no longer overrides it/);
  });

  test("a stylesheet that holds ouro-base's rules: what it lacks is drift unless the list names it, and a changed --radius under @supports is ouro-base's", () => {
    const sheet = BASE.replace("--ouro-layer: 50;", "--ouro-layer: 60;").replace(/@utility press \{[^}]*\}\n/, "").replace("--ouro-corner-fallback: 0.7;", "--ouro-corner-fallback: 0.7;\n    --radius: 1px;");
    const withRadius = `${BASE}@supports not (corner-shape: squircle) {\n  :root {\n    --radius: 2px;\n  }\n}\n`;
    const findings = compareBase(sheet, withRadius, false, { ":root --ouro-layer": "above the header" });
    assert.deepEqual(findings.map((finding) => `${finding.kind} ${finding.key}`), ["missing @utility press transition", "override @supports not (corner-shape: squircle) :root --radius"]);
    assert.deepEqual(compareBase(sheet.replace("    --radius: 1px;\n", "    --radius: 2px;\n"), withRadius, false, { ":root --ouro-layer": "above the header", "@utility press transition": "the app presses its own way" }), []);
  });

  test("checks an app by its pin: the imported file must hash to the pin's record, and a monorepo package finds the pin above it", async () => {
    const sheet = '@import "tailwindcss";\n@import "./ouro/ouro-base.css";\n:root {\n  --ouro-layer: 60;\n}\n';
    const app = tree({
      ".github/ouro-hx-installed.json": JSON.stringify({ tag: "v1.3.400", files: { "packages/web/src/ouro/ouro-base.css": sha256(BASE) } }),
      ".github/ouro-base-overrides.json": JSON.stringify({ ":root --ouro-layer": "above the header" }),
      "packages/web/components.json": JSON.stringify({ tailwind: { css: "src/index.css" } }),
      "packages/web/src/index.css": sheet,
      "packages/web/src/ouro/ouro-base.css": BASE,
    });
    const web = join(app, "packages/web");
    const clean = await checkBase(web, async () => assert.fail("an imported file is read from the app"));
    assert.deepEqual(clean, { findings: [], sheet: "packages/web/src/index.css", tag: "v1.3.400" });
    writeFileSync(join(web, "src/ouro/ouro-base.css"), `${BASE}.mine { color: red; }\n`);
    const edited = await checkBase(web);
    assert.deepEqual(edited.findings.map((finding) => finding.kind), ["edited"]);
    assert.match(edited.findings[0]!.message, /packages\/web\/src\/ouro\/ouro-base\.css is not ouro-base at v1\.3\.400/);
  });

  test("the command reads the tag's file from --source or GitHub, prints each finding and exits 1 on drift, 0 without", async () => {
    const app = tree({
      ".github/ouro-hx-installed.json": JSON.stringify({ tag: "v1.3.400", files: {} }),
      "components.json": JSON.stringify({ tailwind: { css: "src/index.css" } }),
      "src/index.css": BASE.replace("--ouro-layer: 50;", "--ouro-layer: 60;"),
      "base.css": BASE,
    });
    const lines: string[] = [];
    assert.equal(await runBaseCheck([app, "--source", join(app, "base.css")], (line) => lines.push(line)), 1);
    assert.match(lines[0]!, /^ouro base check: override: :root --ouro-layer: /);
    assert.equal(lines.at(-1), "ouro base check: src/index.css has drifted from ouro-base at v1.3.400");
    writeFileSync(join(app, "src/index.css"), BASE);
    const fetched: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      fetched.push(url);
      return url.includes("v1.3.400") ? new Response(BASE) : new Response("", { status: 404 });
    }) as typeof fetch;
    try {
      const cwd = process.cwd();
      process.chdir(app);
      try {
        const out: string[] = [];
        assert.equal(await runBaseCheck([], (line) => out.push(line)), 0);
        assert.deepEqual(out, ["ouro base check: src/index.css has ouro-base as v1.3.400 has it"]);
        assert.equal(await runBaseCheck(["."]), 0, "the default log is the console");
      } finally {
        process.chdir(cwd);
      }
      assert.equal(fetched[0], "https://raw.githubusercontent.com/ourostack/ouro-ui/v1.3.400/registry/ouro/theme/ouro-base.css");
      writeFileSync(join(app, ".github/ouro-hx-installed.json"), JSON.stringify({ tag: "v9.9.9", files: {} }));
      await assert.rejects(checkBase(app), /could not read ouro-base at v9\.9\.9: 404/);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test("runs as a command: node scripts/ouro/check/base-check.ts <app> --source <file> exits 1 on drift", () => {
    const app = tree({
      ".github/ouro-hx-installed.json": JSON.stringify({ tag: "v1.3.400", files: {} }),
      "components.json": JSON.stringify({ tailwind: { css: "src/index.css" } }),
      "src/index.css": BASE.replace("--ouro-layer: 50;", "--ouro-layer: 60;"),
      "base.css": BASE,
    });
    const result = spawnSync(process.execPath, [join(root, "registry/ouro/check/base-check.ts"), app, "--source", join(app, "base.css")], { encoding: "utf8" });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stdout, /override: :root --ouro-layer/);
  });

  test("names what it cannot check: no pin, and a components.json with no stylesheet", async () => {
    await assert.rejects(checkBase("/"), /no \.github\/ouro-hx-installed\.json/);
    const app = tree({ ".github/ouro-hx-installed.json": JSON.stringify({ tag: "v1", files: {} }), "components.json": "{}" });
    await assert.rejects(checkBase(app), /names no stylesheet/);
  });
});
