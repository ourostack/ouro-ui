import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { treeFiles } from "./tree.mjs";
import path from "node:path";
import { describe, it } from "node:test";
import { main } from "../registry/ouro/source-rules/source-rules.mjs";

const root = path.resolve(import.meta.dirname, "../test/incumbent-fixture");

function run(extra = {}) {
  const errors = [];
  const logs = [];
  let code = 0;
  const extraFiles = Object.keys(extra);
  main([], {
    root,
    io: { log: (text) => logs.push(text), error: (text) => errors.push(text) },
    exit: (status) => {
      code = status;
    },
    readFile: (file) => extra[path.relative(root, file)] ?? readFileSync(file, "utf8"),
    readdir: (directory) => [...treeFiles(directory), ...extraFiles.map((file) => path.relative(path.join(root, "src"), path.join(root, file)))],
  });
  return { code, text: [...logs, ...errors].join("\n") };
}

describe("the incumbent fixture app: Mantine and its own tokens, one page on Ouro HX", () => {
  it("passes the source rule with its libraries' controls baselined and the moved page clean", () => {
    const result = run();
    assert.equal(result.code, 0, result.text);
    const baseline = JSON.parse(readFileSync(path.join(root, "ouro-source-rules.baseline.json"), "utf8"));
    assert.ok(Object.keys(baseline.offenders).length > 0);
    assert.ok(Object.keys(baseline.offenders).every((fingerprint) => !fingerprint.includes("Billing")));
    assert.ok(Object.keys(baseline.offenders).some((fingerprint) => fingerprint.includes("::third-party-control::@mantine/core.")));
  });

  it("fails a control the app adds on a page it has not moved, and a Mantine control on the moved page", () => {
    const added = run({ "src/pages/Team.tsx": `import { Button } from "@mantine/core";\nexport function Team() { return <Button>Invite</Button>; }\n` });
    assert.notEqual(added.code, 0);
    assert.match(added.text, /@mantine\/core\.Button/);
    const moved = run({ "src/pages/Billing.tsx": `import { Button } from "@mantine/core";\nexport function Billing() { return <Button>Pay</Button>; }\n` });
    assert.notEqual(moved.code, 0);
    assert.match(moved.text, /Billing/);
  });

  it("keeps its tokens out of shadcn's names", () => {
    const theme = readFileSync(path.join(root, "src/theme.css"), "utf8");
    assert.doesNotMatch(theme, /--(primary|background|foreground|muted|border|ring)\b/);
    const manifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
    assert.ok(manifest.dependencies["@mantine/core"]);
    assert.equal(manifest.dependencies["@radix-ui/react-slot"], undefined);
  });
});
