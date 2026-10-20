import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// The approved Ouro HX logo files the site serves (site/public/brand/): byte-identical copies of the
// approved artwork, listed with their checksums in provenance.json. A file that is not listed, or
// whose bytes changed (recoloured, re-exported, redrawn), fails.

const dir = join(dirname(fileURLToPath(import.meta.url)), "../public/brand");
const provenance = JSON.parse(readFileSync(join(dir, "provenance.json"), "utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("every brand file is listed in provenance.json, and every listed file is there", () => {
  const files = readdirSync(dir).filter((file) => file !== "provenance.json").sort();
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
