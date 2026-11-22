import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";

// Every corner a theme draws is ouro-base's squircle; no theme sets a round corner shape (Ari,
// 2026-11-20: "ABSOLUTELY NO ROUNDED CORNERS. squircle ONLY"). ouro-base keeps its own few round marks
// (Switch, radios, slider thumbs, presence dots, spinners, a checklist's outline box); those are its
// rules, not a theme's.

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const cssIn = (dir) => readdirSync(new URL(dir, root)).filter((name) => name.endsWith(".css")).map((name) => `${dir}${name}`);

/** The theme sources and what is built from them: the presets, the "Copy theme" CSS and the static theme files. */
const themeFiles = () => [...cssIn("site/src/themes/"), ...cssIn("site/public/css/themes/"), "site/src/themes/themes.json"];

const ROUND = /--ouro-(?:control-|check-)?corner-shape\s*:\s*round\b/;

test("no theme sets its corners, controls or checks to a round corner shape", () => {
  const files = themeFiles();
  assert.ok(files.includes("site/src/themes/cookbook.css"), "the Cookbook theme is among the files checked");
  for (const file of files) assert.doesNotMatch(read(file), ROUND, `${file} sets a round corner shape; leave corners to ouro-base's squircle`);
});

test("the round corner check catches a round control, check or theme corner shape, and passes the squircle", () => {
  for (const css of ["--ouro-control-corner-shape: round;", "--ouro-check-corner-shape:round;", "--ouro-corner-shape: round;"]) assert.match(css, ROUND, css);
  assert.doesNotMatch("--ouro-corner-shape: squircle;", ROUND);
});

test("the Cookbook theme makes its controls squircle capsules: a full control radius, no corner-shape token, and checks on the theme's corners", () => {
  for (const file of ["site/src/themes/cookbook.css", "site/public/css/themes/cookbook.css"]) {
    const css = read(file);
    assert.match(css, /--ouro-control-radius:\s*9999px;/, file);
    assert.doesNotMatch(css, /--ouro-(?:control|check)-corner-shape\s*:|--ouro-check-radius\s*:/, file);
  }
});
