import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { test } from "node:test";
import { APP, build, markers, MAX_PAGES, MAX_SOURCES, OUT, PAGES, SOURCE, sources } from "./spoonjoy.mts";

const registry = JSON.parse(readFileSync(new URL("../../registry.json", import.meta.url), "utf8"));
const items = new Set(registry.items.filter((item) => item.type === "registry:ui").map((item) => item.name));
const data = JSON.parse(readFileSync(OUT, "utf8"));

test("a page counts for an item only when its HTML holds the item's root marker", () => {
  const html = '<div data-ouro="button"></div><span data-ouro="dialog-portal"></span><p data-ouro-control="checkbox"></p><i data-ouro="nope"></i>';
  assert.deepEqual([...markers(html, items)], ["button"]);
});

test("an item's Spoonjoy sources are its rendering files, most used first", () => {
  const provenance = {
    root: { renders: { button: ["app/root.tsx"] } },
    routes: [{ renders: { button: ["app/routes/a.tsx", "app/root.tsx"] } }, { renders: { text: ["app/routes/b.tsx"] } }, {}],
  };
  assert.deepEqual(Object.fromEntries(sources(provenance)), { button: ["app/root.tsx", "app/routes/a.tsx"], text: ["app/routes/b.tsx"] });
});

test("build keeps the preferred pages first, caps pages and sources, and leaves out items Spoonjoy does not use", () => {
  const shown = PAGES.map((page, index) => ({ url: `${APP}/${index}`, label: page.label, items: new Set(["button"]) }));
  const bySource = new Map([["button", ["a", "b", "c", "d"]]]);
  const out = build(shown, bySource, ["button", "dialog"], "v1.2.12", "https://example.com/guide");
  assert.deepEqual(out.items.button.pages.map((page) => page.label), PAGES.slice(0, MAX_PAGES).map((page) => page.label));
  assert.deepEqual(out.items.button.sources, ["a", "b", "c"].map((file) => `${SOURCE}/blob/main/${file}`));
  assert.equal(out.items.dialog, undefined);
});

test("the committed Spoonjoy data names only registry components, Spoonjoy's own pages and its source on GitHub", () => {
  assert.match(data.ouroTag, /^v\d+\.\d+\.\d+$/);
  assert.ok(data.guide.startsWith(`${SOURCE}/blob/main/`), data.guide);
  assert.ok(Object.keys(data.items).length > 0);
  const labels = new Set(PAGES.map((page) => page.label));
  for (const [item, use] of Object.entries(data.items)) {
    assert.ok(items.has(item), `${item} is not a registry:ui item`);
    assert.ok(use.pages.length + use.sources.length > 0, item);
    assert.ok(use.pages.length <= MAX_PAGES && use.sources.length <= MAX_SOURCES, item);
    for (const page of use.pages) {
      assert.ok(page.url.startsWith(`${APP}/`), page.url);
      assert.ok(labels.has(page.label), page.label);
    }
    for (const file of use.sources) assert.ok(file.startsWith(`${SOURCE}/blob/main/app/`), file);
  }
});
