import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import sharp from "sharp";
import { BOX, FORMATS, OUT, SOURCES, WIDTHS, crop, fileName, repo, sha256 } from "./plan-ship.mts";

const STALE = "run node site/scripts/plan-ship.mts";
const manifestFile = join(repo, OUT, "manifest.json");
const manifest = () => JSON.parse(readFileSync(manifestFile, "utf8"));

test("the plan's painting has a day and a night file at each width, as AVIF and WebP, each listed in its manifest", () => {
  assert.ok(existsSync(manifestFile), `${OUT}/manifest.json is missing; ${STALE}`);
  const listed = manifest().files.map((each) => each.file).sort();
  const expected = ["day", "night"].flatMap((scheme) => WIDTHS.flatMap((width) => FORMATS.map((format) => fileName(scheme, width, format)))).sort();
  assert.deepEqual(listed, expected);
  for (const file of expected) assert.ok(existsSync(join(repo, OUT, file)), `${OUT}/${file} is missing; ${STALE}`);
});

test("the plan's painting is cut from the scene files as they are now, by the script's box, at the plan's 3:1", () => {
  const { box, sources } = manifest();
  assert.deepEqual(box, BOX, `the box changed; ${STALE}`);
  assert.equal(BOX.width, BOX.height * 3);
  for (const [scheme, file] of Object.entries(SOURCES)) {
    assert.equal(sources[scheme].file, file);
    assert.equal(sources[scheme].sha256, sha256(readFileSync(join(repo, file))), `${file} changed since the crop was made; ${STALE}`);
  }
});

test("each committed file of the plan's painting is the crop derived again, at its width and in its format", async () => {
  for (const each of manifest().files) {
    const bytes = readFileSync(join(repo, OUT, each.file));
    assert.equal(sha256(bytes), each.sha256, `${each.file} is not the file the manifest lists; ${STALE}`);
    const { width, height, format } = await sharp(bytes).metadata();
    assert.deepEqual([width, height, format === "heif" ? "avif" : format], [each.width, each.width / 3, each.format]);
    // Encoders differ a little between hosts, so the pixels are compared, not the bytes.
    const committed = await sharp(bytes).removeAlpha().raw().toBuffer();
    const derived = await crop(each.scheme, each.width).removeAlpha().raw().toBuffer();
    assert.equal(committed.length, derived.length);
    let total = 0;
    for (let i = 0; i < derived.length; i++) total += Math.abs(committed[i] - derived[i]);
    assert.ok(total / derived.length < 6, `${each.file} differs from the crop by ${(total / derived.length).toFixed(1)} a channel; ${STALE}`);
  }
});
