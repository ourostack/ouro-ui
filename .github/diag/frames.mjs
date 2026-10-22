// Diagnostic only (branch diag/webkit-frames): what a pointer press costs WebKit on /voyage/, and where.
import { chromium, webkit } from "@playwright/test";
const [base, label] = [process.argv[2], process.argv[3]];
const VARIANTS = {
  asis: "",
  noshadow: "*, *::before, *::after { box-shadow: none !important; }",
  nolayers: "* { will-change: auto !important; }",
};
/** Replaces each SVG text with an HTML span in a foreignObject (fo), or removes all but one (one). */
const rewrite = (page, how) => page.evaluate((how) => {
  const texts = [...document.querySelectorAll("main svg text")];
  texts.forEach((text, index) => {
    if (how === "one") { if (index > 0) text.remove(); return; }
    const box = text.getBBox();
    const fo = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
    fo.setAttribute("x", String(box.x)); fo.setAttribute("y", String(box.y)); fo.setAttribute("width", String(Math.max(1, box.width + 4))); fo.setAttribute("height", String(Math.max(1, box.height + 2)));
    const span = document.createElement("span");
    span.textContent = text.textContent;
    span.style.cssText = "font-size: 10px; white-space: nowrap; display: block;";
    fo.append(span);
    text.replaceWith(fo);
  });
  return `${texts.length} texts`;
}, how);
/** Drops each rule whose selector has the pseudo-class at all, and counts them. */
const drop = (page, pseudo) => page.evaluate((pseudo) => {
  const pattern = new RegExp(`:(${pseudo})(?![\\w-])`);
  let dropped = 0;
  const walk = (owner) => { for (let i = owner.cssRules.length - 1; i >= 0; i--) { const rule = owner.cssRules[i]; if (rule.selectorText && pattern.test(rule.selectorText)) { dropped++; owner.deleteRule(i); } else if (rule.cssRules) walk(rule); } };
  for (const sheet of document.styleSheets) { try { walk(sheet); } catch {} }
  return dropped;
}, pseudo);
const census = (page) => page.evaluate(() => {
  const q = (s) => document.querySelectorAll(s).length;
  const big = [...document.querySelectorAll("main svg")].map((svg) => [svg.querySelectorAll("*").length, (svg.getAttribute("class") || svg.parentElement?.className || "?").toString().slice(0, 30), svg.closest("section[id], section")?.id || "hero?"]).sort((a, b) => b[0] - a[0]).slice(0, 12);
  return `svgs ${q("main svg")} nodes ${q("main svg *")} use ${q("main svg use")} text ${q("main svg text")} filter ${q("main svg [filter]")} mask ${q("main svg [mask]")} clip ${q("main svg [clip-path]")} fo ${q("main svg foreignObject")} big ${big.map((b) => b.join(":")).join(" | ")}`;
});
const arm = (page) => page.evaluate(() => {
  const w = window;
  w.__probe = [];
  for (const type of ["pointerdown", "pointerup", "click", "focusin"]) {
    window.addEventListener(type, () => {
      const t0 = performance.now();
      setTimeout(() => {
        const t1 = performance.now();
        void document.body.offsetHeight;
        const t2 = performance.now();
        requestAnimationFrame(() => {
          const t3 = performance.now();
          requestAnimationFrame(() => w.__probe.push(`${type} js ${Math.round(t1 - t0)} style+layout ${Math.round(t2 - t1)} toframe ${Math.round(t3 - t2)} frame ${Math.round(performance.now() - t3)}`));
        });
      }, 0);
    }, { capture: true, once: true });
  }
});
const read = (page) => page.evaluate(() => new Promise((r) => setTimeout(() => r(window.__probe.join(", ")), 1200)));
if (label !== "branch") process.exit(0);
for (const type of [webkit, chromium]) {
  const browser = await type.launch();
  for (const [name, css] of Object.entries(VARIANTS)) {
    if (type === chromium && name !== "asis") continue;
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(base + "voyage/");
    await page.locator("html[data-site-ready]").waitFor({ state: "attached" });
    let dropped = "";
    if (typeof css === "string" && css) await page.addStyleTag({ content: css });
    await page.locator("#chapter-two").scrollIntoViewIfNeeded();
    await page.locator("#chapter-two[data-chapter-ready]").waitFor({ state: "attached" });
    await page.waitForTimeout(800);

    const selection = await page.evaluate(() => new Promise((resolve) => {
      const node = document.querySelector("#chapter-two p")?.firstChild ?? document.body;
      const t0 = performance.now();
      getSelection().collapse(node, 0);
      const t1 = performance.now();
      void document.body.offsetHeight;
      const t2 = performance.now();
      requestAnimationFrame(() => { const t3 = performance.now(); getSelection().removeAllRanges(); void document.body.offsetHeight; resolve(`selection set ${Math.round(t1 - t0)} layout ${Math.round(t2 - t1)} frame ${Math.round(t3 - t2)} clear+layout ${Math.round(performance.now() - t3)}`); });
    }));
    const synthetic = await page.evaluate(() => new Promise((resolve) => {
      const target = document.querySelector("#chapter-two h2");
      const t0 = performance.now();
      target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, composed: true }));
      target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, composed: true }));
      const t1 = performance.now();
      void document.body.offsetHeight;
      const t2 = performance.now();
      requestAnimationFrame(() => resolve(`synthetic js ${Math.round(t1 - t0)} layout ${Math.round(t2 - t1)} frame ${Math.round(performance.now() - t2)}`));
    }));
    const hover = await (async () => { const box = await page.locator("#chapter-two h2").first().boundingBox(); await page.mouse.move(5, 5); await page.waitForTimeout(300); await arm(page); const t = Date.now(); await page.mouse.move(box.x + 10, box.y + 10); return `hover ${Date.now() - t}`; })();
    console.log(`${type.name()} ${name} ${selection} · ${synthetic} · ${hover} ${await read(page)}`);
    const targets = {
      text: page.locator("#chapter-two h2").first(),
      handle: page.getByRole("button", { name: /^Reorder Vigo/ }),
    };
    for (const [target, locator] of Object.entries(targets)) {
      const box = await locator.boundingBox();
      await page.mouse.move(5, 5);
      await page.waitForTimeout(300);
      const m0 = Date.now();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      const moved = Date.now() - m0;
      await page.waitForTimeout(400);
      await arm(page);
      const t0 = Date.now();
      await page.mouse.down();
      const t1 = Date.now();
      await page.mouse.up();
      const t2 = Date.now();
      console.log(`${type.name()} ${name} ${target}: move ${moved} down ${t1 - t0} up ${t2 - t1} | ${await read(page)}`);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(600);
    }
    await page.close();
  }
  await browser.close();
}
