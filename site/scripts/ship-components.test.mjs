import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { test } from "node:test";
import { build, OUT, SHIP_PAGES, shown, UNSEEN } from "./ship-components.mts";

const registry = JSON.parse(readFileSync(new URL("../../registry.json", import.meta.url), "utf8"));
const items = new Set(registry.items.filter((item) => item.type === "registry:ui").map((item) => item.name));

test("a page shows an item when its HTML holds a root marker X-ray reads as that item", () => {
  const html = '<div data-ouro="button"></div><span data-ouro="dialog-portal"></span><i data-ouro="radio"></i><b data-ouro="toast"></b><p data-ouro-control="checkbox"></p><i data-ouro="nope"></i><i data-ouro="inspector"></i>';
  assert.deepEqual([...shown(html, items)].sort(), ["button", "radio-group"]);
  assert.ok(UNSEEN.has("toaster"));
});

test("leaves out what a page keeps hidden, like a closed Collapsible's panel, until it opens", () => {
  const html = [
    '<div data-ouro="collapsible"><div hidden="" data-closed=""><article data-ouro="message"><span aria-hidden="true" data-ouro="avatar"></span></article><br/><img src="x"></div></div>',
    '<p aria-hidden="true"><i data-ouro="badge"></i></p><input hidden><span data-ouro="kbd"></span>',
    '<script>if (a < b) document.write("<i data-ouro=\\"switch\\">")</script><template><i data-ouro="slider"></i></template>',
  ].join("");
  assert.deepEqual([...shown(html, items)].sort(), ["badge", "collapsible", "kbd"]);
});

test("build lists each item with its pages, the story first, items sorted", () => {
  const out = build({ "/": '<i data-ouro="switch"></i><i data-ouro="badge"></i>', "/nautilus/": '<i data-ouro="switch"></i>' }, items);
  assert.deepEqual(out.items, { badge: ["/"], switch: ["/nautilus/", "/"] });
  assert.deepEqual(SHIP_PAGES.map((page) => page.path), ["/nautilus/", "/"]);
});

test("the committed list names only registry components, each on a ship page", () => {
  const data = JSON.parse(readFileSync(OUT, "utf8"));
  assert.ok(Object.keys(data.items).length > 3);
  for (const [item, paths] of Object.entries(data.items)) {
    assert.ok(items.has(item), `${item} is not a registry:ui item`);
    assert.ok(paths.length > 0 && paths.every((path) => SHIP_PAGES.some((page) => page.path === path)), item);
  }
});
