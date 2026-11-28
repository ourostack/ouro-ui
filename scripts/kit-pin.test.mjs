import assert from "node:assert/strict";
import { test } from "node:test";
import { bumpLine, bumpText, FEEL_CATALOG, feelCatalogAt, kitPages, KITS, pinOf, urlsIn } from "./kit-pin.mjs";

const APPLE = "https://github.com/ourostack/ouro-ui-apple/releases/tag/";
const WINDOWS = "https://github.com/ourostack/ouro-ui-windows/releases/tag/";

test("a release's statements move to the new one, its release link's minor version with them, and nothing else moves", () => {
  assert.equal(bumpLine(`const kit = { release: "1.4.0", releaseUrl: "https://github.com/ourostack/ouro-ui-apple/releases/tag/v1.4.0" };`, "1.4.0", "1.5.0"), `const kit = { release: "1.5.0", releaseUrl: "https://github.com/ourostack/ouro-ui-apple/releases/tag/v1.5.0" };`);
  assert.equal(bumpLine(`Apple's [1.4](${APPLE}v1.4.0) is out.`, "1.4.0", "1.5.0"), `Apple's [1.5](${APPLE}v1.5.0) is out.`);
  assert.equal(bumpLine(`The foundations ship today in 1.4.0: core v1.2.0 and web 1.4.0.5 stay.`, "1.4.0", "1.5.0"), `The foundations ship today in 1.5.0: core v1.2.0 and web 1.4.0.5 stay.`);
});

test("a 'since' statement names the release a feature came in, so it stays, and a longer number is no match", () => {
  assert.equal(bumpLine(`Since 1.4.0 every corner is a squircle; since v1.4.0 too.`, "1.4.0", "1.5.0"), `Since 1.4.0 every corner is a squircle; since v1.4.0 too.`);
  assert.equal(bumpLine(`Version 11.4.0 and 1.4.00 are other numbers.`, "1.4.0", "1.5.0"), `Version 11.4.0 and 1.4.00 are other numbers.`);
});

test("a mixed file moves only its lines that name the kit, and a kit's own file moves every line", () => {
  const text = "| For Apple | v1.4.0 |\n| For Windows | v1.4.0 |\nship today in 1.4.0";
  assert.equal(bumpText(text, "1.4.0", "1.5.0", { mixed: true }), "| For Apple | v1.5.0 |\n| For Windows | v1.4.0 |\nship today in 1.4.0");
  assert.equal(bumpText(text, "1.4.0", "1.5.0"), "| For Apple | v1.5.0 |\n| For Windows | v1.5.0 |\nship today in 1.5.0");
});

test("Windows's bump moves its own lines and its release link, and leaves Android's line at the same version alone", () => {
  const text = [
    `| For Windows | [v0.10.0](${WINDOWS}v0.10.0)[^windows-release] | core v1.8.0 |`,
    `| For Android | [v0.10.0](https://github.com/ourostack/ouro-ui-android/releases/tag/v0.10.0)[^android-release] | core v1.7.0 |`,
    `[^windows-release]: ${WINDOWS}v0.10.0 verify:urlOk(${WINDOWS}v0.10.0) verify:equals(scripts/parity-data/versions.json#windows.tag)=v0.10.0`,
    `The Windows kit is at [0.10](${WINDOWS}v0.10.0) now.`,
  ].join("\n");
  const moved = bumpText(text, "0.10.0", "0.11.0", { mixed: true, word: KITS.windows.word, link: WINDOWS }).split("\n");
  assert.equal(moved[0], `| For Windows | [v0.11.0](${WINDOWS}v0.11.0)[^windows-release] | core v1.8.0 |`);
  assert.equal(moved[1], text.split("\n")[1], "Android's line names Android, so it stays");
  assert.equal(moved[2], `[^windows-release]: ${WINDOWS}v0.11.0 verify:urlOk(${WINDOWS}v0.11.0) verify:equals(scripts/parity-data/versions.json#windows.tag)=v0.11.0`);
  assert.equal(moved[3], `The Windows kit is at [0.11](${WINDOWS}v0.11.0) now.`);
});

test("a row where every kit shares one line, as parity.md's Kit row does, bumps only the cell that names the kit, leaving another kit's cell alone even on the same version", () => {
  const android = "https://github.com/ourostack/ouro-ui-android/releases/tag/";
  const apple = "https://github.com/ourostack/ouro-ui-apple/releases/tag/";
  const row = `| Kit | this repository | [ourostack/ouro-ui-apple v1.10.1](${apple}v1.10.1) | [ourostack/ouro-ui-android v0.12.0](${android}v0.12.0) | [ourostack/ouro-ui-windows v0.12.0](${WINDOWS}v0.12.0) |`;
  const moved = bumpText(row, "0.12.0", "0.12.1", { mixed: true, word: KITS.windows.word, link: WINDOWS });
  assert.equal(moved, `| Kit | this repository | [ourostack/ouro-ui-apple v1.10.1](${apple}v1.10.1) | [ourostack/ouro-ui-android v0.12.0](${android}v0.12.0) | [ourostack/ouro-ui-windows v0.12.1](${WINDOWS}v0.12.1) |`);
});

test("Android's release link minor version moves with its statements, and a line that names another kit's link does not", () => {
  const android = "https://github.com/ourostack/ouro-ui-android/releases/tag/";
  assert.equal(bumpLine(`Android is at [0.10](${android}v0.10.0).`, "0.10.0", "0.11.0", android), `Android is at [0.11](${android}v0.11.0).`);
});

test("a claim address a footnote cites is kept, and the TypeScript claim address is read too", () => {
  const cited = urlsIn(`x[^a]\n[^a]: https://github.com/a verify:urlOk(https://github.com/a) verify:equals(site/src/apple/kit.json#release)=1.4.0\n{ urlOk: "https://github.com/b" }`);
  assert.deepEqual([...cited], ["https://github.com/a", "https://github.com/b"]);
});

test("a TypeScript claim's current release moves, but a claim that says 'since' the old release keeps its prose and source", () => {
  const claim = (text) => [
    `{claim("${text}", {`,
    `  source: { spec: "https://github.com/ourostack/ouro-ui-apple/releases/tag/v1.4.0" },`,
    `  verify: [`,
    `    { urlOk: "https://github.com/ourostack/ouro-ui-apple/releases/tag/v1.4.0" },`,
    `    { equals: "site/src/apple/kit.json#release", is: "1.4.0" },`,
    `  ],`,
    `})}`,
  ];
  const text = [...claim("Ouro UI for Apple 1.4.0 has twenty components, with fields since 1.1."), ...claim("Since 1.4.0 every corner is a squircle.")].join("\n");
  const moved = bumpText(text, "1.4.0", "1.5.0", { typescript: true }).split("\n");
  const [first, second] = [moved.slice(0, 7), moved.slice(7)];
  assert.equal(first.join("\n"), claim("Ouro UI for Apple 1.5.0 has twenty components, with fields since 1.1.").join("\n").replaceAll("v1.4.0", "v1.5.0").replace('is: "1.4.0"', 'is: "1.5.0"'));
  assert.equal(second.join("\n"), claim("Since 1.4.0 every corner is a squircle.").join("\n").replace('is: "1.4.0"', 'is: "1.5.0"'));
});

test("a Markdown footnote a 'since' line cites keeps its release link, and only its current-release check moves", () => {
  const old = "https://github.com/ourostack/ouro-ui-apple/releases/tag/v1.4.0";
  const text = [
    "Since 1.4.0 every corner is a squircle.[^hx]",
    `[^hx]: ${old} verify:urlOk(${old}) verify:equals(site/src/apple/kit.json#release)=1.4.0`,
    "The Apple foundations ship today in 1.4.0.[^now]",
    `[^now]: ${old} verify:equals(site/src/apple/kit.json#release)=1.4.0`,
  ].join("\n");
  const now = "https://github.com/ourostack/ouro-ui-apple/releases/tag/v1.5.0";
  assert.equal(
    bumpText(text, "1.4.0", "1.5.0", { mixed: true }),
    ["Since 1.4.0 every corner is a squircle.[^hx]", `[^hx]: ${old} verify:urlOk(${old}) verify:equals(site/src/apple/kit.json#release)=1.5.0`, "The Apple foundations ship today in 1.5.0.[^now]", `[^now]: ${now} verify:equals(site/src/apple/kit.json#release)=1.5.0`].join("\n"),
  );
});

test("each kit's own pages, its change fragments and the shared pages that name it are the files its pin moves", () => {
  const listing = (dir) => ({ "site/src/apple": ["home.tsx", "kit.json", "notes.md", "start.tsx"], changes: ["apple-newest-pages.md", "windows-x.md", "2673-other.md"] })[dir] ?? [];
  const apple = kitPages("apple", listing);
  assert.deepEqual(apple.map((page) => page.path), [
    "site/src/apple/home.tsx",
    "site/src/apple/kit.json",
    "site/src/apple/start.tsx",
    "docs/platforms/apple.md",
    "README.md",
    "docs/platforms/README.md",
    "docs/platforms/parity.md",
    "site/llms.txt",
    "changes/apple-newest-pages.md",
  ]);
  assert.equal(apple.find((page) => page.path === "README.md").mixed, true);
  assert.equal(apple.find((page) => page.path === "docs/platforms/apple.md").mixed, false);
  const windows = kitPages("windows", listing).map((page) => page.path);
  assert.ok(windows.includes("docs/platforms/windows.md"));
  assert.ok(windows.includes("changes/windows-x.md"));
  assert.ok(!windows.some((path) => path.includes("apple")), "Apple's pages are not Windows's");
});

test("the pin's verdict: a pin behind GitHub's newest release is behind, and one at or ahead of it has nothing to pin", () => {
  assert.deepEqual(pinOf("1.4.0", "1.5.0"), { result: "behind", tag: "v1.5.0", from: "1.4.0" });
  assert.equal(pinOf("1.5.0", "1.5.0").result, "current");
  assert.equal(pinOf("1.10.0", "1.9.9").result, "current", "versions compare as numbers");
});

test("the kits are the three sibling repositories, each named by its own word", () => {
  assert.deepEqual(Object.keys(KITS), ["apple", "windows", "android"]);
  assert.equal(KITS.android.repo, "ourostack/ouro-ui-android");
  assert.equal(KITS.windows.word.test("Windows v0.10.0"), true);
  assert.equal(KITS.windows.word.test("Android v0.11.0"), false);
});

test("an Apple pin copies Feel's catalog from the new release, so the Feel page lists the checks that release ships", async () => {
  const asked = [];
  const catalog = `{\n  "principles" : [\n\n  ]\n}\n`;
  const text = await feelCatalogAt("1.12.0", async (url) => {
    asked.push(url);
    return { ok: true, status: 200, text: async () => catalog };
  });
  assert.deepEqual(asked, ["https://raw.githubusercontent.com/ourostack/ouro-ui-apple/v1.12.0/docs/ouro-feel/checks.json"]);
  assert.equal(text, catalog);
  assert.equal(FEEL_CATALOG, "site/src/apple/feel-checks.json");
});

test("a release without Feel's catalog, or one GitHub won't serve, leaves the page's copy as it is", async () => {
  assert.equal(await feelCatalogAt("1.12.0", async () => ({ ok: false, status: 404, text: async () => "Not Found" })), null);
  assert.equal(await feelCatalogAt("1.12.0", async () => ({ ok: true, status: 200, text: async () => "<html>" })), null);
  assert.equal(await feelCatalogAt("1.12.0", async () => ({ ok: true, status: 200, text: async () => `{"checks": []}` })), null);
  assert.equal(await feelCatalogAt("1.12.0", async () => { throw new Error("offline"); }), null);
});
