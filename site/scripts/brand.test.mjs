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

test("every scene the site shows is there at each width, with the phone crop and the og crop", async () => {
  const { SCENES } = await import("../src/storybook.ts");
  const have = new Set(storyFiles());
  for (const scene of Object.keys(SCENES)) {
    const wanted = [`headers/${scene}.webp`, `scenes/${scene}-1536.avif`];
    for (const width of [640, 960]) wanted.push(`scenes/${scene}-${width}.avif`, `scenes/${scene}-${width}.webp`);
    for (const width of [384, 768]) wanted.push(`phone/${scene}-${width}.avif`, `phone/${scene}-${width}.webp`);
    for (const file of wanted) assert.ok(have.has(file), `${file} is missing`);
  }
  const { CARDS } = await import("../src/storybook.ts");
  for (const card of Object.values(CARDS)) assert.ok(have.has(`og/${card.scene}.jpg`), `og/${card.scene}.jpg, the card ${card.file}'s scene, is missing`);
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
