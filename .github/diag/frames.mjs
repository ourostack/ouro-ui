// Diagnostic only (branch diag/webkit-frames): where WebKit's 500 ms frame goes when a menu opens on /voyage/.
import { chromium, webkit } from "@playwright/test";
const [base, label] = [process.argv[2], process.argv[3]];
const VARIANTS = {
  asis: "",
  nosvg: "main svg { display: none !important; }",
  noactivedesc: { pseudo: "active" },
  nohoverdesc: { pseudo: "hover" },
  nobothdesc: { pseudo: "active|hover|focus-visible|focus-within|focus" },
};
/** Drops each rule whose selector has the pseudo-class anywhere but on its subject, and says what it dropped. */
const drop = (page, pseudo) => page.evaluate((pseudo) => {
  const pattern = new RegExp(`:(${pseudo})(?![\\w-])(?=[^,]*?[\\s)>~+])`);
  const dropped = [];
  const walk = (owner) => { for (let i = owner.cssRules.length - 1; i >= 0; i--) { const rule = owner.cssRules[i]; if (rule.selectorText && pattern.test(rule.selectorText)) { dropped.push(rule.selectorText); owner.deleteRule(i); } else if (rule.cssRules) walk(rule); } };
  for (const sheet of document.styleSheets) { try { walk(sheet); } catch {} }
  return `dropped ${dropped.length}: ${dropped.slice(0, 12).join(" | ")}`;
}, pseudo);
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
    if (typeof css === "string" && css) await page.addStyleTag({ content: css });
    await page.locator("#chapter-two").scrollIntoViewIfNeeded();
    await page.locator("#chapter-two[data-chapter-ready]").waitFor({ state: "attached" });
    await page.waitForTimeout(800);
    const row = [];
    if (typeof css === "object") row.push(await drop(page, css.pseudo));
    
    row.push(await probe(page));
    const handle = page.getByRole("button", { name: /^Reorder Atlantis/ });
    const step = async (name, fn) => { await record(page); const t = Date.now(); await fn(); await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); row.push(`${name} ${Date.now() - t} [${await longs(page)}]`); };
    const box = await handle.boundingBox();
    await step("move", () => page.mouse.move(box.x + box.width / 2, box.y + box.height / 2));
    await step("down", () => page.mouse.down());
    await step("up", () => page.mouse.up());
    await page.waitForTimeout(300);
    row.push(await page.evaluate(() => window.__menu ?? "menu not seen"));
    await record(page);
    const t0 = Date.now();
    await page.getByRole("menu").getByRole("menuitem", { name: "Move to top" }).click();
    await page.getByRole("menu").waitFor({ state: "hidden" });
    row.push(`pick ${Date.now() - t0} [${await longs(page)}]`);
    console.log(`${type.name()} ${name}: ${row.join(" · ")}`);
    await page.close();
  }
  await browser.close();
}
