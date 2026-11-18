import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";
import sharp from "sharp";
import { NEMO_SHIPS, nemoShip } from "../src/voyage/eggs/nemo-ship.ts";
import { alphaOf, boxOf, cut, difference, fileName, OUT, problems, SHIPS, TOLERANCE, WIDTHS } from "./nemo-ship.mts";

const repo = new URL("../../", import.meta.url);
const committed = (ship, width) => readFileSync(new URL(`${OUT}/${fileName(ship, width)}`, repo));
const day = SHIPS.find((ship) => ship.id === "day");

test("the nemo egg's ships are their scenes cut with their masks, from the scenes the manifest names", async () => {
  assert.deepEqual(await problems(), []);
});

test("a ship cut with a moved mask is another picture, and the check names the file and the fix", async () => {
  const moved = { ...day, mask: { ...day.mask, outline: day.mask.outline.map(([x, y]) => [x + 24, y]) } };
  assert.ok((await difference(committed(day, 420), await cut(moved, 420))) > TOLERANCE);
  const found = await problems(undefined, SHIPS.map((ship) => (ship.id === "day" ? moved : ship)));
  assert.ok(found.some((line) => line.startsWith("the day ship's manifest entry is not the script's")), found.join("\n"));
  for (const width of WIDTHS) assert.ok(found.some((line) => line.startsWith(`${OUT}/nautilus-day-${width}.webp is not`) && line.endsWith("Fix: node site/scripts/nemo-ship.mts --write")), found.join("\n"));
});

test("a ship whose scene changed, a ship with no file and a ship nobody cuts any more each fail the check", async () => {
  const otherScene = { ...day, source: day.source.replace("-3072.webp", "-dark-3072.webp") };
  const stranger = { ...day, id: "stranger" };
  const found = await problems(undefined, [otherScene, stranger]);
  assert.ok(found.some((line) => line.startsWith(`the day ship's scene ${otherScene.source} changed since she was cut`)), found.join("\n"));
  assert.ok(found.some((line) => line.startsWith("stranger is not in")), found.join("\n"));
  assert.ok(found.some((line) => line.includes("lists night, which the script does not cut")), found.join("\n"));
});

test("each ship is clear all round: nothing at her box's edges, and nothing below her waterline", async () => {
  for (const ship of SHIPS) {
    const { data, width, height } = await alphaOf(ship.mask);
    const at = (x, y) => data[y * width + x];
    for (let x = 0; x < width; x++) assert.equal(at(x, 0) + at(x, height - 1), 0, `${ship.id}: column ${x} touches the top or the bottom`);
    for (let y = 0; y < height; y++) assert.equal(at(0, y) + at(width - 1, y), 0, `${ship.id}: row ${y} touches a side`);
    const from = ship.mask.waterline.from - boxOf(ship.mask).top;
    assert.ok(data.subarray(from * width, (from + 1) * width).some((alpha) => alpha === 255), `${ship.id}: the hull is whole down to the waterline`);
    for (const file of WIDTHS.map((width) => committed(ship, width))) {
      const { channels, hasAlpha } = await sharp(file).metadata();
      assert.deepEqual([channels, hasAlpha], [4, true]);
    }
  }
});

test("the egg asks for each ship's files at 1x and 2x, at the height her picture has", async () => {
  for (const ship of SHIPS) {
    const { src, srcset, width, height } = nemoShip(ship.id === "night");
    assert.equal(src, `/eggs/${fileName(ship, 420)}`);
    assert.equal(srcset, `/eggs/${fileName(ship, 420)} 1x, /eggs/${fileName(ship, 840)} 2x`);
    const box = boxOf(ship.mask);
    assert.equal(height, Math.round((width * box.height) / box.width));
    assert.equal(NEMO_SHIPS[ship.id].height, height);
  }
});
