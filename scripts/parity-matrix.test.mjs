import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { appleComponents, claimMatrix, componentMatrix, gather, gatherApple, pinnedDrift, PAGE, readData, renderMatrix, renderPage, kitClaims, windowsComponents, androidComponents } from "./parity-matrix.mjs";

const real = (path) => readFileSync(path, "utf8");

test("the parity page shows what its data renders", () => {
  assert.equal(renderPage(real(PAGE), readData()), real(PAGE));
});

test("the hourly Apple release check reads GitHub again for the parity matrix, and a change to it runs that check", () => {
  const workflow = real(".github/workflows/apple-release.yml");
  assert.match(workflow, /node scripts\/parity-matrix\.mjs --live/);
  for (const path of ["docs/platforms/parity.md", "scripts/parity-matrix.mjs"]) {
    assert.equal(workflow.split(`\n      - ${path}\n`).length - 1, 2, `${path} in the push and pull_request paths`);
    assert.ok(workflow.includes(`\n            ${path}\n`), `${path} in the sparse checkout`);
  }
  assert.match(workflow, /steps\.parity\.outputs\.behind == 'true'/);
});

test("--live holds Apple's pinned components to GitHub; pinnedDrift never sees a kit, so a kit's newer release is no drift", () => {
  const apple = { repo: "o/apple", tag: "v0.6.0", commit: "c", components: [{ name: "OuroButton", web: "button" }] };
  const stored = { apple, windows: { tag: "v0.1.0", components: [] } };
  assert.deepEqual(pinnedDrift(stored, apple), []);
  assert.equal(pinnedDrift(stored, { ...apple, components: [] }).length, 1);
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

test("Apple's file that declares several views counts each, and not its support types", () => {
  const files = {
    "Sources/OuroHX/Components/OuroLoading.swift": "public struct OuroLoadingPalette: Sendable {}\npublic struct OuroSkeleton: View {}\npublic struct OuroSpinner: View {}\npublic struct OuroProgress: View {}",
    "Sources/OuroHX/Components/OuroChoice.swift": "public struct OuroSegment<Value: Hashable>: Identifiable {}\npublic struct OuroSegmentedControl<Value: Hashable>: View {}\npublic struct OuroCheckbox: View {}",
    "Sources/OuroHX/Components/OuroItem.swift": "public struct OuroItem<Media: View, Actions: View>: View {}\npublic struct OuroItemGroup<Content: View>: View {}",
  };
  assert.deepEqual(appleComponents(files), [
    { name: "OuroCheckbox", web: "checkbox" },
    { name: "OuroItem", web: "item" },
    { name: "OuroItemGroup", web: "item-group" },
    { name: "OuroProgress", web: "progress" },
    { name: "OuroSegmentedControl", web: "segmented-control" },
    { name: "OuroSkeleton", web: "skeleton" },
    { name: "OuroSpinner", web: "spinner" },
  ]);
});

test("Apple's view that is a part of a component (OuroCheckboxMark, Checkbox's box) is not a component, and a component beside another still is", () => {
  const files = {
    "Sources/OuroHX/Components/OuroCheckbox.swift": "public struct OuroCheckbox: View {}\npublic struct OuroCheckboxMark: View {}\npublic struct OuroCheckboxPressStyle: ButtonStyle {}",
    "Sources/OuroHX/Components/OuroItem.swift": "public struct OuroItem<Media: View, Actions: View>: View {}\npublic struct OuroItemGroup<Content: View>: View {}",
  };
  assert.deepEqual(appleComponents(files), [
    { name: "OuroCheckbox", web: "checkbox" },
    { name: "OuroItem", web: "item" },
    { name: "OuroItemGroup", web: "item-group" },
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

test("Android's components are the Ouro<Name> composables in ouro-hx, under web's name, and not the theme or the helpers", () => {
  const dir = "ouro-hx/src/main/kotlin/bot/ouro/ui/hx";
  const files = {
    [`${dir}/OuroButton.kt`]: "@Composable\nfun OuroButton(\n    label: String,\n) {}\n@Composable\nfun <I : Any, O : Any> OuroButton(action: OuroAction<I, O>) {}",
    [`${dir}/OuroBadge.kt`]: "@Composable\nfun OuroBadge(label: String) {}",
    [`${dir}/OuroCard.kt`]: "@Composable\nfun OuroCard(content: @Composable () -> Unit) {}",
    [`${dir}/OuroTheme.kt`]: "@Composable\nfun OuroTheme(content: @Composable () -> Unit) {}",
    [`${dir}/OuroSemantics.kt`]: "fun Modifier.ouroAction(id: String, consent: String): Modifier = this",
    [`${dir}/OuroPaint.kt`]: "enum class OuroTone { Primary }",
  };
  assert.deepEqual(androidComponents(files), [
    { name: "OuroBadge", web: "badge" },
    { name: "OuroButton", web: "button" },
    { name: "OuroCard", web: "card" },
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
  const windowsRows = claimMatrix({ claims: [{ id: "a", tier: "must", checks: {} }] }, { claims: [{ id: "c", tier: "must", appliesTo: ["cli"] }] }, { windows: { claims: ["a", "c"] } });
  assert.deepEqual(windowsRows.map((row) => [row.id, row.windows]), [["a", "checked"], ["c", "none"]]);
  const androidRows = claimMatrix({ claims: [{ id: "a", tier: "must", checks: {} }] }, { claims: [] }, { android: { claims: ["a"] } });
  assert.deepEqual(androidRows.map((row) => [row.id, row.android]), [["a", "checked"]]);
  assert.deepEqual(kitClaims({ "a.spec.json": '{"claims":["target.touch","name.spoken"]}', "b.spec.json": '{"claims":["name.spoken"]}', "c.spec.json": "{}" }), ["name.spoken", "target.touch"]);
  const page = renderMatrix({ web: { names: ["button"] }, platforms: { apple: { repo: "o/apple", tag: "v1.0.0", components: [] }, android: { repo: "o/android", tag: null }, windows: { repo: "o/windows", tag: null } }, componentClaims: { claims: [] }, actionClaims: { claims: [] } });
  assert.match(page, /^\| \[button\]\(https:\/\/ui\.ouroboros\.bot\/docs\/button\/\) \| `button` \| Not yet \| Not yet \| Not yet \|$/m);
  assert.match(page, /Not yet: \[o\/android\]/);
});

test("gather reads Apple's components at the recorded commit, and Windows's components and claims at its newest release's commit, and notes a kit whose repository does not exist", async () => {
  const fetch = async (url) => {
    const body = (value, status = 200) => ({ ok: status === 200, status, json: async () => value, text: async () => value });
    if (url.includes("/git/trees/abc")) return body({ tree: [{ path: "Sources/OuroHX/Components/OuroButton.swift" }, { path: "Sources/OuroHX/Color/OuroColor.swift" }] });
    if (url.endsWith("/abc/Sources/OuroHX/Components/OuroButton.swift")) return body("public struct OuroButton: View {}");
    if (url.endsWith("ouro-ui-android")) return body({}, 404);
    if (url.endsWith("ouro-ui-windows")) return body({ name: "ouro-ui-windows" });
    if (url.endsWith("ouro-ui-windows/releases/latest")) return body({ tag_name: "v0.1.0" });
    if (url.endsWith("ouro-ui-windows/commits/v0.1.0")) return body({ sha: "def" });
    if (url.includes("/git/trees/def")) return body({ tree: [{ path: "src/Ouro.UI.Windows/OuroBadge.cs" }, { path: "src/Ouro.UI.Windows/OuroPaint.cs" }, { path: "tests/Ouro.Tests/RuntimeTests.cs" }, { path: "vendor/core/components/badge.spec.json" }] });
    if (url.endsWith("/def/vendor/core/components/badge.spec.json")) return body('{"claims":["contrast.text"]}');
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
  assert.deepEqual(facts.windows.claims, ["contrast.text"]);
  assert.equal(facts.android.claims, undefined);
});

test("gather with only one kit reads that kit from GitHub and keeps each other kit as platforms.json has it", async () => {
  const stored = { apple: { repo: "o/apple", tag: "v1.0.0", components: [] }, android: { repo: "o/android", tag: "v0.9.0", components: [] }, windows: { repo: "o/windows", tag: "v0.10.0", components: [] } };
  const asked = [];
  const fetch = async (url) => {
    asked.push(url);
    const body = (value, status = 200) => ({ ok: status === 200, status, json: async () => value, text: async () => value });
    if (url.endsWith("ouro-ui-windows")) return body({ name: "ouro-ui-windows" });
    if (url.endsWith("ouro-ui-windows/releases/latest")) return body({ tag_name: "v0.12.0" });
    if (url.endsWith("ouro-ui-windows/commits/v0.12.0")) return body({ sha: "def" });
    if (url.includes("/git/trees/def")) return body({ tree: [{ path: "src/Ouro.UI.Windows/OuroBadge.cs" }] });
    if (url.endsWith("/def/src/Ouro.UI.Windows/OuroBadge.cs")) return body("public sealed partial class OuroBadge : Control\n{\n}");
    return body(null, 500);
  };
  const facts = await gather({ fetch, apple: { tag: "v1.0.0", commit: "abc" }, only: "windows", stored });
  assert.equal(facts.windows.tag, "v0.12.0");
  assert.deepEqual(facts.windows.components, [{ name: "OuroBadge", web: "badge" }]);
  assert.equal(facts.apple, stored.apple);
  assert.equal(facts.android, stored.android);
  assert.deepEqual(Object.keys(facts), ["$comment", "apple", "android", "windows"]);
  assert.ok(asked.every((url) => url.includes("ouro-ui-windows") || url.includes("/def/")), `asked only for Windows: ${asked.join(", ")}`);
  const appleOnly = await gather({ fetch: async (url) => (asked.push(url), { ok: false, status: 500, json: async () => null, text: async () => null }), apple: { tag: "v1.0.0", commit: "abc" }, only: "apple", stored, wait: async () => {}, log: () => {} }).catch((error) => error);
  assert.ok(appleOnly instanceof Error, "Apple alone is read from GitHub, which this fetch refuses");
});

test("a 503 from raw.githubusercontent.com (ourostack/ouro-ui-apple's run 45308495839) clears on retry, after one 5s wait, with no real time spent", async () => {
  const body = (value, status = 200) => ({ ok: status === 200, status, json: async () => value, text: async () => value });
  let rawCalls = 0;
  const fetch = async (url) => {
    if (url.includes("/git/trees/abc")) return body({ tree: [{ path: "Sources/OuroHX/Components/OuroButton.swift" }] });
    rawCalls += 1;
    return rawCalls === 1 ? body(null, 503) : body("public struct OuroButton: View {}");
  };
  const waits = [];
  const logs = [];
  const apple = await gatherApple({ fetch, apple: { tag: "v0.5.1", commit: "abc" }, wait: async (ms) => waits.push(ms), log: (message) => logs.push(message) });
  assert.deepEqual(apple.components, [{ name: "OuroButton", web: "button" }]);
  assert.equal(rawCalls, 2, "retried the raw file once after the 503");
  assert.deepEqual(waits, [5000], "waited 5s before the retry, not the real clock");
  assert.match(logs[0], /answered 503.*Retrying in 5s/);
});

test("three 5xx answers in a row exhaust the retries: 5s then 20s, then Unreadable, never a 4xx retry", async () => {
  const body = (value, status = 200) => ({ ok: status === 200, status, json: async () => value, text: async () => value });
  let rawCalls = 0;
  const fetch = async (url) => {
    if (url.includes("/git/trees/abc")) return body({ tree: [{ path: "Sources/OuroHX/Components/OuroButton.swift" }] });
    rawCalls += 1;
    return body(null, 503);
  };
  const waits = [];
  await assert.rejects(
    gatherApple({ fetch, apple: { tag: "v0.5.1", commit: "abc" }, wait: async (ms) => waits.push(ms), log: () => {} }),
    (error) => /answered 503/.test(error.message),
  );
  assert.equal(rawCalls, 3, "the initial try plus two retries, then it gives up");
  assert.deepEqual(waits, [5000, 20000]);
});

test("a 404 (real drift, not a GitHub hiccup) throws straight away, with no retry and no wait", async () => {
  const body = (value, status = 200) => ({ ok: status === 200, status, json: async () => value, text: async () => value });
  let rawCalls = 0;
  const fetch = async (url) => {
    if (url.includes("/git/trees/abc")) return body({ tree: [{ path: "Sources/OuroHX/Components/OuroButton.swift" }] });
    rawCalls += 1;
    return body(null, 404);
  };
  const waits = [];
  await assert.rejects(
    gatherApple({ fetch, apple: { tag: "v0.5.1", commit: "abc" }, wait: async (ms) => waits.push(ms), log: () => {} }),
    (error) => /answered 404/.test(error.message),
  );
  assert.equal(rawCalls, 1, "no retry of a 404");
  assert.deepEqual(waits, []);
});

test("no hand-written page states web's component count: the parity matrix holds it", async () => {
  // Two component pull requests that each wrote "127" merged into 128 and turned main red (#2372 after #2362). A page
  // links the parity matrix instead (docs/platforms/android.md, windows.md, #2382).
  const { execFileSync } = await import("node:child_process");
  const pages = execFileSync("git", ["ls-files", "*.md", "*.mdx"], { encoding: "utf8" }).split("\n").filter(Boolean);
  const stating = pages.filter((page) => {
    const prose = readFileSync(page, "utf8").replace(/^(```|~~~)[\s\S]*?^\1/gm, "");
    return /verify:count\(registry:ui\)/.test(prose);
  });
  assert.deepEqual(stating, []);
});
