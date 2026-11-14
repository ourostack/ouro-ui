/* global fetch, AbortSignal */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// The approved Ouro HX logo files the site serves (site/public/brand/): byte-identical copies of the
// approved artwork, listed with their checksums in provenance.json. A file that is not listed, or
// whose bytes changed (recoloured, re-exported, redrawn), fails. The storybook brand's scenes and
// icons (site/public/brand/storybook/) are held the same way to their own provenance.json, a subset
// of ourostack/.github's brand/provenance.json.

const dir = join(dirname(fileURLToPath(import.meta.url)), "../public/brand");
const provenance = JSON.parse(readFileSync(join(dir, "provenance.json"), "utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("every brand file is listed in provenance.json, and every listed file is there", () => {
  const files = readdirSync(dir).filter((file) => file !== "provenance.json" && statSync(join(dir, file)).isFile()).sort();
  assert.deepEqual(provenance.files.map((entry) => entry.file).sort(), files);
});

test("every brand file is byte-identical to the approved artwork it was copied from", () => {
  for (const entry of provenance.files) {
    assert.match(entry.sha256, /^[0-9a-f]{64}$/, entry.file);
    assert.equal(sha256(readFileSync(join(dir, entry.file))), entry.sha256, `${entry.file} changed since it was copied`);
  }
  assert.equal(provenance.approvedSource.sha256, "7fdaabb2cc0717eccc9bca967891dcaef206ef4963109205b0e7e60675ce1f25");
  assert.match(provenance.origin, /^arimendelow\/desk@[0-9a-f]{40}:ouro-public-web\/public-pages-holistic-plan\/icons\/final\/$/);
});

test("the rich render is square at each size and keeps its transparency", () => {
  for (const [file, size] of [["ouro-hx-render.webp", 1024], ["ouro-hx-render-256.webp", 256], ["ouro-hx-render-128.webp", 128]]) {
    const bytes = readFileSync(join(dir, file));
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF", file);
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP", file);
    // A lossless or extended WebP: VP8L carries its size in a 14-bit field each, VP8X in 24-bit fields.
    const chunk = bytes.toString("ascii", 12, 16);
    let width, height, alpha;
    if (chunk === "VP8L") {
      const bits = bytes.readUInt32LE(21);
      width = (bits & 0x3fff) + 1;
      height = ((bits >> 14) & 0x3fff) + 1;
      alpha = Boolean((bits >> 28) & 1);
    } else {
      assert.equal(chunk, "VP8X", file);
      width = bytes.readUIntLE(24, 3) + 1;
      height = bytes.readUIntLE(27, 3) + 1;
      alpha = Boolean(bytes[20] & 0x10);
    }
    assert.deepEqual([width, height, alpha], [size, size, true], file);
  }
});

const storybook = join(dir, "storybook");
const story = JSON.parse(readFileSync(join(storybook, "provenance.json"), "utf8"));
const storyFiles = (folder = "") =>
  readdirSync(join(storybook, folder)).flatMap((name) => {
    const path = folder ? `${folder}/${name}` : name;
    return statSync(join(storybook, path)).isDirectory() ? storyFiles(path) : path === "provenance.json" ? [] : [path];
  });

test("every storybook file is listed in its provenance.json, byte-identical to the canonical brand", () => {
  assert.match(story.origin, /^ourostack\/\.github@[0-9a-f]{40}:brand\/$/);
  assert.deepEqual(story.files.map((entry) => entry.file).sort(), storyFiles().sort());
  for (const entry of story.files) {
    assert.match(entry.sha256, /^[0-9a-f]{64}$/, entry.file);
    assert.equal(sha256(readFileSync(join(storybook, entry.file))), entry.sha256, `${entry.file} is not the canonical file's bytes`);
  }
});

test("every scene the site shows is there at each width, by day and at night, with the phone crop and the og crop", async () => {
  const { SCENES, sceneSources } = await import("../src/storybook.ts");
  const have = new Set(storyFiles());
  for (const scene of Object.keys(SCENES)) {
    for (const night of [false, true]) {
      const { phone, wide, header } = sceneSources(scene, (path) => path, night);
      const wanted = [header, ...[phone, wide].flatMap((sources) => ["avif", "webp"].flatMap((type) => sources(type).split(", ").map((entry) => entry.split(" ")[0])))];
      for (const file of wanted) assert.ok(have.has(file), `${file} is missing`);
    }
  }
  const { CARDS } = await import("../src/storybook.ts");
  for (const card of Object.values(CARDS)) assert.ok(have.has(`og/${card.scene}.jpg`), `og/${card.scene}.jpg, the card ${card.file}'s scene, is missing`);
  // Each phone crop's shape is its own: the picture's height for it (SCENES[scene].phoneHeight, and its night's) is the file's.
  // A lossy WebP ("VP8 ") holds its width and height, 14 bits each, after its frame's start code. The night's wide
  // scene is the day's size, so the page holds the same box whichever theme draws it.
  const size = (file) => {
    const webp = readFileSync(join(storybook, file));
    assert.equal(webp.toString("latin1", 12, 16), "VP8 ", file);
    return [webp.readUInt16LE(26) & 0x3fff, webp.readUInt16LE(28) & 0x3fff];
  };
  for (const [scene, { height, phoneHeight, night }] of Object.entries(SCENES)) {
    assert.deepEqual(size(`phone/${scene}-768.webp`), [768, phoneHeight], `phone/${scene}-768.webp`);
    assert.deepEqual(size(`phone/${scene}-dark-768.webp`), [768, night.phoneHeight], `phone/${scene}-dark-768.webp`);
    assert.deepEqual(size(`headers/${scene}.webp`), [1536, height], `headers/${scene}.webp`);
    assert.deepEqual(size(`headers/${scene}-dark.webp`), [1536, height], `headers/${scene}-dark.webp`);
  }
  for (const icon of ["icons/ouro-hx.svg", "icons/ouro-hx-180.png", "icons/ouro-hx-192.png", "icons/ouro-hx-512.png"]) assert.ok(have.has(icon), icon);
});

test("every link-preview card is a 1200x630 JPEG", async () => {
  const { CARDS } = await import("../src/storybook.ts");
  for (const card of Object.values(CARDS)) {
    const bytes = readFileSync(join(dir, "../og", card.file));
    assert.equal(bytes.readUInt16BE(0), 0xffd8, card.file);
    // The first baseline or progressive frame header carries the height, then the width.
    let at = 2;
    while (at < bytes.length && ![0xc0, 0xc2].includes(bytes[at + 1])) at += 2 + bytes.readUInt16BE(at + 2);
    assert.deepEqual([bytes.readUInt16BE(at + 7), bytes.readUInt16BE(at + 5)], [1200, 630], card.file);
  }
});

// The family's links (site/src/family.json): a byte-for-byte copy of ourostack/.github's brand/family.json, the one list
// every Ouro site's family bar and footer show, in its order. Offline, the copy is held to the order and ids it had when
// it was copied.
const familyCopy = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../src/family.json"), "utf8");
const FAMILY_CANONICAL = "https://raw.githubusercontent.com/ourostack/.github/main/brand/family.json";

test("the family links are in the family's order, with its ids, labels and addresses", () => {
  assert.deepEqual(
    JSON.parse(familyCopy).links.map((link) => [link.id, link.label, link.href]),
    [
      ["ouro", "Ouro", "https://ouroboros.bot/"],
      ["ouro-ui", "Ouro UI", "https://ui.ouroboros.bot/"],
      ["ouro-md", "Ouro MD", "https://ouroboros.bot/ouro-md/"],
      ["desk", "Desk", "https://ouroboros.bot/desk/"],
      ["apps", "Apps", "https://ouroboros.bot/apps/"],
      ["ari", "Ari Mendelow", "https://mendelow.me/"],
      ["github", "GitHub", "https://github.com/ourostack"],
    ],
  );
});

test("the family links are byte-identical to the canonical brand/family.json, when the network is reachable", async (t) => {
  let response;
  try {
    response = await fetch(FAMILY_CANONICAL, { signal: AbortSignal.timeout(15_000) });
  } catch (error) {
    t.skip(`the canonical file is out of reach: ${error.message}`);
    return;
  }
  // GitHub's own trouble (rate limits, outages) is out of reach too; a missing file is not.
  if (response.status === 429 || response.status >= 500) {
    t.skip(`the canonical file is out of reach: HTTP ${response.status}`);
    return;
  }
  assert.equal(response.status, 200, `${FAMILY_CANONICAL} answered ${response.status}`);
  assert.equal(familyCopy, await response.text(), "site/src/family.json differs from ourostack/.github's brand/family.json: copy it again, byte for byte");
});
