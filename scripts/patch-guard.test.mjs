import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { scratchDir } from "./scratch.mjs";
import { importsAtRuntime, patchedPackage, problems } from "./patch-guard.mjs";

function repo() {
  const root = scratchDir("patch-guard");
  mkdirSync(join(root, "registry/ouro/components/ouro/x"), { recursive: true });
  writeFileSync(join(root, "registry/ouro/components/ouro/x/x.tsx"), 'import { A } from "@base-ui/react/toggle";\n');
  writeFileSync(join(root, "registry/ouro/components/ouro/x/x.test.tsx"), 'import { A } from "left-pad";\n');
  return root;
}

test("a patch names its package, scoped or not", () => {
  assert.equal(patchedPackage("patches/@base-ui__react@1.8.0.patch"), "@base-ui/react");
  assert.equal(patchedPackage("patches/left-pad@1.0.0.patch"), "left-pad");
});

test("only runtime imports count, not tests", () => {
  const root = repo();
  assert.equal(importsAtRuntime("@base-ui/react", root), true);
  assert.equal(importsAtRuntime("left-pad", root), false);
});

test("a patch to a runtime dependency fails unless the description names where it also ships", () => {
  const root = repo();
  const changed = ["patches/@base-ui__react@1.8.0.patch", "README.md"];
  assert.equal(problems({ changed, root }).length, 1);
  assert.match(problems({ changed, root })[0], /Patch-covered/);
  assert.equal(problems({ changed, root, body: "Patch-covered: registry/ouro/components/ouro/x/x.tsx" }).length, 0);
  assert.equal(problems({ changed, root, body: "Patch-covered: registry/ouro/nowhere.tsx" }).length, 1);
  assert.equal(problems({ changed, root, body: "Upstream-release: 1.10.0" }).length, 0);
  assert.equal(problems({ changed: ["patches/left-pad@1.0.0.patch"], root }).length, 0);
});
