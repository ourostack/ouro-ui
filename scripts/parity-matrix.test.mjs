import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { appleComponents, claimMatrix, componentMatrix, gather, PAGE, readData, renderMatrix, renderPage, windowsComponents } from "./parity-matrix.mjs";

const real = (path) => readFileSync(path, "utf8");

test("the parity page shows what its data renders", () => {
  assert.equal(renderPage(real(PAGE), readData()), real(PAGE));
});

test("the hourly Apple release check reads GitHub again for the parity matrix, and a change to it runs that check", () => {
  const workflow = real(".github/workflows/apple-release.yml");
  assert.match(workflow, /run: node scripts\/parity-matrix\.mjs --live/);
  for (const path of ["docs/platforms/parity.md", "scripts/parity-matrix.mjs"]) {
    assert.equal(workflow.split(`\n      - ${path}\n`).length - 1, 2, `${path} in the push and pull_request paths`);
    assert.ok(workflow.includes(`\n            ${path}\n`), `${path} in the sparse checkout`);
  }
  assert.match(workflow, /steps\.parity\.outputs\.behind == 'true'/);
});

test("Apple's components are the files that declare the component, under web's name", () => {
  const files = {
    "Sources/OuroHX/Components/OuroButton.swift": "public struct OuroButton<Label: View>: View {}",
    "Sources/OuroHX/Components/OuroSheet.swift": "public struct OuroSheetPalette {}\nextension View {\n    public func ouroSheet<Content: View>(",
    "Sources/OuroHX/Components/OuroToast.swift": "public struct OuroToast: Identifiable, Sendable {}",
    "Sources/OuroHX/Components/OuroEmptyState.swift": "public struct OuroEmptyState<Action: View>: View {}",
    "Sources/OuroHX/Components/OuroTone.swift": "public enum OuroTone: String {}",
    "Sources/OuroHX/Components/WebNames.swift": "public typealias OuroEmpty<Action: View> = OuroEmptyState<Action>",
  };
  assert.deepEqual(appleComponents(files), [
    { name: "OuroButton", web: "button" },
    { name: "OuroEmptyState", web: "empty" },
    { name: "OuroSheet", web: "sheet" },
    { name: "OuroToast", web: "toast" },
  ]);
});

test("Windows's components are the Ouro<Name> controls that derive from a XAML control, under web's name", () => {
  const files = {
    "src/Ouro.UI.Windows/OuroButton.cs": "public sealed partial class OuroButton : Button\n{\n}",
    "src/Ouro.UI.Windows/OuroBadge.cs": "public sealed partial class OuroBadge : Control\n{\n}\npublic sealed partial class OuroBadgeAutomationPeer(OuroBadge owner) : FrameworkElementAutomationPeer(owner)\n{\n}",
    "src/Ouro.UI.Windows/OuroPaint.cs": "public enum OuroTone { Primary }\npublic static class OuroPaint\n{\n}",
    "src/Ouro.UI.Windows/OuroPerson.cs": "public static class OuroPerson\n{\n}",
    "src/Ouro.UI.Windows/OuroItem.cs": "public sealed partial class OuroItem : Control\n{\n}",
    "src/Ouro.UI.Windows/OuroCard.cs": "public sealed partial class OuroCard : ContentControl\n{\n}",
  };
  assert.deepEqual(windowsComponents(files), [
    { name: "OuroBadge", web: "badge" },
    { name: "OuroButton", web: "button" },
    { name: "OuroCard", web: "card" },
    { name: "OuroItem", web: "item" },
  ]);
});

test("every platform gets a cell for every component, and a component only one platform has gets a row", () => {
  const web = { names: ["button", "toaster", "dialog"], folders: { button: "button", toast: "toaster", dialog: "dialog" } };
  const platforms = { apple: { components: [{ name: "OuroButton", web: "button" }, { name: "OuroToast", web: "toast" }, { name: "OuroDuoHinge", web: "duo-hinge" }] }, android: { components: [] } };
  assert.deepEqual(componentMatrix(web, platforms), [
    { name: "button", web: "button", apple: "OuroButton", android: null, windows: null },
    { name: "toaster", web: "toaster", apple: "OuroToast", android: null, windows: null },
    { name: "dialog", web: "dialog", apple: null, android: null, windows: null },
    { name: "duo-hinge", web: null, apple: "OuroDuoHinge", android: null, windows: null },
  ]);
});

test("a claim is covered where core names a platform's check, or where an action surface runs, and Not yet elsewhere", () => {
  const rows = claimMatrix(
    { claims: [{ id: "a", tier: "must", checks: { web: "x.test.tsx", apple: "Not yet checked on apple: the sheet." } }] },
    { claims: [{ id: "b", tier: "should", appliesTo: ["app-intent"] }, { id: "c", tier: "must", appliesTo: ["cli"] }] },
  );
  assert.deepEqual(rows.map((row) => [row.id, row.web, row.apple, row.android, row.windows]), [
    ["a", "checked", "partly", "none", "none"],
    ["b", "none", "checked", "none", "none"],
    ["c", "checked", "checked", "none", "none"],
  ]);
  const page = renderMatrix({ web: { names: ["button"] }, platforms: { apple: { repo: "o/apple", tag: "v1.0.0", components: [] }, android: { repo: "o/android", tag: null }, windows: { repo: "o/windows", tag: null } }, componentClaims: { claims: [] }, actionClaims: { claims: [] } });
  assert.match(page, /^\| \[button\]\(https:\/\/ui\.ouroboros\.bot\/docs\/button\/\) \| `button` \| Not yet \| Not yet \| Not yet \|$/m);
  assert.match(page, /Not yet: \[o\/android\]/);
});

test("gather reads Apple's components at the recorded commit, and Windows's at its newest release's commit, and notes a kit whose repository does not exist", async () => {
  const fetch = async (url) => {
    const body = (value, status = 200) => ({ ok: status === 200, status, json: async () => value, text: async () => value });
    if (url.includes("/git/trees/abc")) return body({ tree: [{ path: "Sources/OuroHX/Components/OuroButton.swift" }, { path: "Sources/OuroHX/Color/OuroColor.swift" }] });
    if (url.endsWith("/abc/Sources/OuroHX/Components/OuroButton.swift")) return body("public struct OuroButton: View {}");
    if (url.endsWith("ouro-ui-android")) return body({}, 404);
    if (url.endsWith("ouro-ui-windows")) return body({ name: "ouro-ui-windows" });
    if (url.endsWith("ouro-ui-windows/releases/latest")) return body({ tag_name: "v0.1.0" });
    if (url.endsWith("ouro-ui-windows/commits/v0.1.0")) return body({ sha: "def" });
    if (url.includes("/git/trees/def")) return body({ tree: [{ path: "src/Ouro.UI.Windows/OuroBadge.cs" }, { path: "src/Ouro.UI.Windows/OuroPaint.cs" }, { path: "tests/Ouro.Tests/RuntimeTests.cs" }] });
    if (url.endsWith("/def/src/Ouro.UI.Windows/OuroBadge.cs")) return body("public sealed partial class OuroBadge : Control\n{\n}");
    if (url.endsWith("/def/src/Ouro.UI.Windows/OuroPaint.cs")) return body("public static class OuroPaint\n{\n}");
    return body(null, 500);
  };
  const facts = await gather({ fetch, apple: { tag: "v0.5.1", commit: "abc" } });
  assert.deepEqual(facts.apple.components, [{ name: "OuroButton", web: "button" }]);
  assert.equal(facts.android.tag, null);
  assert.equal(facts.android.commit, null);
  assert.deepEqual(facts.android.components, []);
  assert.equal(facts.windows.tag, "v0.1.0");
  assert.equal(facts.windows.commit, "def");
  assert.deepEqual(facts.windows.components, [{ name: "OuroBadge", web: "badge" }]);
});
