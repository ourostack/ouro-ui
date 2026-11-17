// Where a registry file installs in an app. The Node-only tools (Ouro check, Ouro images, and the X-ray, the flow runner and
// the surfaces check with their tests) install under scripts/ouro/, outside the app's TypeScript project. The rest of
// Ouro AX installs in the app's lib folder, beside the components. scripts/registry.mts writes these targets, and
// scripts/ax-docs.mts names them.

const checkDir = "registry/ouro/check/";
const imagesDir = "registry/ouro/images/";
// Ouro AX: the agent-experience kit, Node TypeScript with no dependencies, one item per file (ax-<stem>), its node:test
// tests as ax-<stem>-tests, the X-ray's fixtures with its tests (a flow suite's with ax-flows'), and the example tool as
// ax-example.
const axDir = "registry/ouro/ax/";

export { axDir, checkDir, imagesDir };

/** The Ouro AX files Node runs only: the X-ray, the flow runner, the surfaces check with the kit files they import (*.kit.mts), and every test and fixture. */
export function axMovesOut(rest: string): boolean {
  return rest === "xray.ts" || rest === "flows.ts" || rest === "surfaces.ts" || rest.endsWith(".kit.mts") || rest.endsWith(".test.mts") || rest.startsWith("fixtures/");
}

/** Whether a registry file installs under scripts/ouro/, out of the app's TypeScript project, rather than in its lib folder. */
export function installsOutsideSrc(path: string): boolean {
  if (path.startsWith(checkDir) || path.startsWith(imagesDir)) return true;
  return path.startsWith(axDir) && axMovesOut(path.slice(axDir.length));
}
