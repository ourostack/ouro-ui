// Diagnostic only (branch diag/webkit-frames): where WebKit's 500 ms frame goes when a menu opens on /voyage/.
import { chromium, webkit } from "@playwright/test";
const [base, label] = [process.argv[2], process.argv[3]];
const VARIANTS = {
  asis: "",
  cv: "main > section:not(#chapter-two), main > div > section:not(#chapter-two), section[id]:not(#chapter-two) { content-visibility: auto; contain-intrinsic-size: auto 900px; }",
  nosvg: "main svg { display: none !important; }",
  nohero: ".site-hero { display: none !important; }",
};
const record = (page) => page.evaluate(() => { const w = window; w.__long = []; let last = performance.now(); const tick = (now) => { if (now - last > 40) w.__long.push(Math.round(now - last)); last = now; w.__raf = requestAnimationFrame(tick); }; w.__raf = requestAnimationFrame(tick); });
const longs = (page) => page.evaluate(() => { cancelAnimationFrame(window.__raf); const l = window.__long; return `${l.length}x${l.reduce((a, b) => a + b, 0)}`; });
const probe = (page) => page.evaluate(() => new Promise((resolve) => {
  const out = [];
  const nextFrame = () => new Promise((r) => { const t = performance.now(); requestAnimationFrame(() => r(Math.round(performance.now() - t))); });
  const forced = () => { const t = performance.now(); void document.body.offsetHeight; return Math.round(performance.now() - t); };
  (async () => {
    await nextFrame(); await nextFrame();
    const div = document.createElement("div");
    div.textContent = "x";
    document.body.append(div);
    out.push(`append ${forced()}+${await nextFrame()}`);
    div.remove();
    out.push(`remove ${forced()}+${await nextFrame()}`);
    const trigger = document.querySelector("#chapter-two [data-ouro-reorderable-handle]");
    trigger.setAttribute("data-probe", "");
    out.push(`attr ${forced()}+${await nextFrame()}`);
    trigger.removeAttribute("data-probe");
    await nextFrame();
    document.documentElement.style.setProperty("--probe", "1");
    out.push(`rootvar ${forced()}+${await nextFrame()}`);
    document.documentElement.style.removeProperty("--probe");
    await nextFrame();
    trigger.focus();
    out.push(`focus ${forced()}+${await nextFrame()}`);
    trigger.blur();
    await nextFrame();
    // What the menu's insertion costs: style and layout forced right after it, then the frame.
    const seen = new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node.nodeType === 1 && (node.matches?.("[data-ouro='menu'], [role='menu']") || node.querySelector?.("[role='menu']"))) {
          seen.disconnect();
          const style = forced();
          nextFrame().then((frame) => { window.__menu = `menu insert style+layout ${style} then frame ${frame}`; });
        }
      }
    });
    seen.observe(document.body, { childList: true, subtree: true });
    window.__menuObserver = seen;
    resolve(out.join(" · "));
  })();
}));
const census = (page) => page.evaluate(() => {
  const rules = [];
  const walk = (list) => { for (const rule of list) { if (rule.selectorText) rules.push(rule.selectorText); if (rule.cssRules) walk(rule.cssRules); } };
  for (const sheet of document.styleSheets) { try { walk(sheet.cssRules); } catch {} }
  const has = rules.filter((s) => s.includes(":has("));
  return `elements ${document.querySelectorAll("*").length} svg-nodes ${document.querySelectorAll("svg *").length} rules ${rules.length} has ${has.length}: ${has.slice(0, 25).join(" | ")}`;
});
if (label !== "branch") process.exit(0);
for (const type of [webkit, chromium]) {
  const browser = await type.launch();
  for (const [name, css] of Object.entries(VARIANTS)) {
    if (type === chromium && name !== "asis") continue;
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(base + "voyage/");
    await page.locator("html[data-site-ready]").waitFor({ state: "attached" });
    if (css) await page.addStyleTag({ content: css });
    await page.locator("#chapter-two").scrollIntoViewIfNeeded();
    await page.locator("#chapter-two[data-chapter-ready]").waitFor({ state: "attached" });
    await page.waitForTimeout(800);
    const row = [];
    if (name === "asis") row.push(await census(page));
    row.push(await probe(page));
    await record(page);
    let t0 = Date.now();
    await page.getByRole("button", { name: /^Reorder Atlantis/ }).click();
    row.push(`open ${Date.now() - t0} [${await longs(page)}]`);
    await page.waitForTimeout(300);
    row.push(await page.evaluate(() => window.__menu ?? "menu not seen"));
    await record(page);
    t0 = Date.now();
    await page.getByRole("menu").getByRole("menuitem", { name: "Move to top" }).click();
    await page.getByRole("menu").waitFor({ state: "hidden" });
    row.push(`pick ${Date.now() - t0} [${await longs(page)}]`);
    console.log(`${type.name()} ${name}: ${row.join(" · ")}`);
    await page.close();
  }
  await browser.close();
}
