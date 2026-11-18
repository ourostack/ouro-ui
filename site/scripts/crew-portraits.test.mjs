import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";
import { CREW_FACES, crewFace } from "../src/voyage/chapters/crew-faces.ts";
import { cut, difference, fileName, OUT, PORTRAITS, problems, TOLERANCE, WIDTHS } from "./crew-portraits.mts";

const repo = new URL("../../", import.meta.url);
const committed = (portrait, width) => readFileSync(new URL(`${OUT}/${fileName(portrait, width)}`, repo));
const nemo = PORTRAITS.find((portrait) => portrait.id === "nemo");

test("the crew's faces are their scenes cut at their boxes, from the scenes the manifest names", async () => {
  assert.deepEqual(await problems(), []);
});

test("a face cut from a moved box is another picture, and the check names the file and the fix", async () => {
  const moved = { ...nemo, box: { ...nemo.box, left: nemo.box.left + 24 } };
  assert.ok((await difference(committed(nemo, 96), await cut(moved, 96))) > TOLERANCE);
  const found = await problems(undefined, PORTRAITS.map((portrait) => (portrait.id === "nemo" ? moved : portrait)));
  for (const width of WIDTHS) assert.ok(found.some((line) => line.startsWith(`${OUT}/nemo-${width}.webp is not`) && line.endsWith("Fix: node site/scripts/crew-portraits.mts --write")), found.join("\n"));
});

test("a face whose scene changed, a face with no file and a face nobody cuts any more each fail the check", async () => {
  const otherScene = { ...nemo, source: nemo.source.replace("-3072.webp", "-dark-3072.webp") };
  const stranger = { ...nemo, id: "stranger", name: "A stranger" };
  const found = await problems(undefined, [otherScene, stranger, ...PORTRAITS.filter((portrait) => portrait.id !== "nemo" && portrait.id !== "ned")]);
  assert.ok(found.some((line) => line.startsWith(`nemo's scene ${otherScene.source} changed since its face was cut`)), found.join("\n"));
  assert.ok(found.some((line) => line.startsWith("stranger is not in")), found.join("\n"));
  assert.ok(found.some((line) => line.includes("lists ned, which the script does not cut")), found.join("\n"));
});

test("every one of the crew has a face, cut square at each width the site asks for, and nobody else has one", async () => {
  assert.deepEqual(PORTRAITS.map((portrait) => portrait.name).sort(), Object.keys(CREW_FACES).sort());
  for (const portrait of PORTRAITS) {
    assert.equal(CREW_FACES[portrait.name], portrait.id);
    assert.equal(crewFace(portrait.name), `/crew/${fileName(portrait, 96)}`);
    assert.equal(crewFace(portrait.name, "md"), `/crew/${fileName(portrait, 192)}`);
  }
  assert.equal(crewFace("Ana Lind"), undefined);
  assert.equal(crewFace("toString"), undefined);
});
