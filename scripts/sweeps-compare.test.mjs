import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { test } from "node:test";
import { Looks } from "../site/e2e/looks.ts";
import { compare } from "./sweeps-compare.mjs";

const look = (key, sig) => ({ key, sig, size: "10x10", behind: "", pictured: false, index: 0, attributes: "" });
const solid = (rgb) => ({ data: Buffer.from(Array.from({ length: 100 }, () => [...rgb, 255]).flat()), width: 10, height: 10, scale: 1 });

async function part(n, parts, pages) {
  const looks = new Looks();
  for (const [where, key, sig, crop] of pages) looks.add(where, look(key, sig), crop);
  return JSON.stringify({ mode: "light", engine: "webkit", part: n, parts, looks: await looks.save() });
}

test("sweeps compare: a difference between pages in different parts is found, whichever parts they are in", async () => {
  const a = await part(1, 2, [["/a/", "button|root|||", "pad:4"], ["/b/", "button|root|||", "pad:4"]]);
  const b = await part(2, 2, [["/c/", "button|root|||", "pad:8"]]);
  const { findings } = await compare([a, b]);
  assert.equal(findings.length, 1);
  assert.match(findings[0], /^light, webkit: button\|root\|\|\| on \/c\/: pad:8$/);
  assert.deepEqual((await compare([await part(1, 2, [["/a/", "k", "pad:4"]]), await part(2, 2, [["/c/", "k", "pad:4"]])])).findings, []);
});

test("sweeps compare: a picture that differs from the pictures of other parts is found after the round trip through PNG", async () => {
  const same = (n, where) => part(n, 3, [[where, "k", "s", solid([200, 10, 10])]]);
  const odd = part(3, 3, [["/odd/", "k", "s", solid([10, 10, 200])]]);
  const { findings } = await compare([await same(1, "/a/"), await same(2, "/b/"), await odd]);
  assert.deepEqual(findings.map((f) => f.replace(/\|.*? looks/, " looks")), ["light, webkit: k looks different on /odd/"]);
});

test("sweeps compare: a part that saved nothing, or no part at all, fails", async () => {
  const { findings } = await compare([await part(2, 3, [["/a/", "k", "s"]])]);
  assert.deepEqual(findings, ["light, webkit: part 1 of 3 saved no looks", "light, webkit: part 3 of 3 saved no looks"]);
  assert.deepEqual((await compare([])).findings, ["no sweep part saved any looks"]);
});
