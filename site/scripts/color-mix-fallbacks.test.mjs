import assert from "node:assert/strict";
import { test } from "node:test";
import { dropColorMixFallbacks } from "./color-mix-fallbacks.mts";

const SUPPORTS = "@supports (color:color-mix(in lab, red, red))";

test("drops the plain fallback and keeps the color-mix() rule, unwrapped", () => {
  const css = `.a{color:red}.bg-p\\/10{background-color:var(--p)}${SUPPORTS}{.bg-p\\/10{background-color:color-mix(in oklab,var(--p)10%,transparent)}}.b{color:blue}`;
  assert.equal(dropColorMixFallbacks(css), ".a{color:red}.bg-p\\/10{background-color:color-mix(in oklab,var(--p)10%,transparent)}.b{color:blue}");
});

test("works inside a media query, where the fallback follows the query's opening brace", () => {
  const css = `@media (hover:hover){.h:hover{border-color:var(--b)}${SUPPORTS}{.h:hover{border-color:color-mix(in oklab,var(--b)70%,transparent)}}}`;
  assert.equal(dropColorMixFallbacks(css), "@media (hover:hover){.h:hover{border-color:color-mix(in oklab,var(--b)70%,transparent)}}");
});

test("keeps a rule before it that is not its fallback: another selector, or other properties", () => {
  const other = `.x{background-color:var(--p)}${SUPPORTS}{.y{background-color:color-mix(in oklab,var(--p)10%,transparent)}}`;
  assert.equal(dropColorMixFallbacks(other), ".x{background-color:var(--p)}.y{background-color:color-mix(in oklab,var(--p)10%,transparent)}");
  const more = `.y{background-color:var(--p);padding:0}${SUPPORTS}{.y{background-color:color-mix(in oklab,var(--p)10%,transparent)}}`;
  assert.equal(dropColorMixFallbacks(more), ".y{background-color:var(--p);padding:0}.y{background-color:color-mix(in oklab,var(--p)10%,transparent)}");
});

test("leaves other @supports blocks alone", () => {
  const css = "@supports (-webkit-touch-callout:none){.t{color:red}}";
  assert.equal(dropColorMixFallbacks(css), css);
});
