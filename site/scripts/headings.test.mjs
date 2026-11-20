import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { decodeText, pageHeadings } from "./headings.mts";

test("a docs page's h1 reads back as its title, an apostrophe and the other characters React escapes included (#2438)", () => {
  const title = `Keep the person's review worth doing: "<Dialog>" & <Sheet>`;
  const html = renderToStaticMarkup(createElement("main", null, createElement("h1", { className: "x" }, title, createElement("small", null, " for Apple"))));
  assert.match(html, /&#x27;/);
  assert.deepEqual(pageHeadings(html), [`${title} for Apple`]);
});

test("decodeText reads numeric and named references once each, so an escaped ampersand stays one", () => {
  assert.equal(decodeText("A&#39;s &#x2014; &apos;B&apos;"), "A's \u2014 'B'");
  assert.equal(decodeText("&amp;lt;"), "&lt;");
});
