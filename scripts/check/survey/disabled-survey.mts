import { chromium } from "playwright";
import { listPages, serve } from "./registry/ouro/check/serve.ts";
const probe = () => [...document.querySelectorAll('button, [role=button], input[type=submit], input[type=button], [role=menuitem], [role=tab], a[aria-disabled]')].filter((el) => ((el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true") && el.getBoundingClientRect().width > 1 && !el.closest("[hidden],[aria-hidden=true]")).map((el) => {
  const desc = (el.getAttribute("aria-describedby") ?? "").split(/\s+/).map((id) => document.getElementById(id)?.textContent?.trim() ?? "").join(" ").trim();
  const name = (el.getAttribute("aria-label") || (el as HTMLElement).innerText || "").trim().slice(0, 30);
  return `${el.tagName.toLowerCase()}${el.getAttribute("role") ? "[" + el.getAttribute("role") + "]" : ""} "${name}" title=${!!el.getAttribute("title")} desc=${!!desc} fieldset=${!!el.closest("fieldset[disabled]")} nav=${!!el.closest("nav,[role=navigation]")}`;
});
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const out: Record<string, number> = {};
const visit = async (url: string) => { const p = await ctx.newPage(); try { await p.goto(url, { waitUntil: "load", timeout: 20000 }); await p.waitForTimeout(800); for (const k of await p.evaluate(probe)) out[k] = (out[k] ?? 0) + 1; } catch {} await p.close(); };
const [kind, target] = process.argv.slice(2);
if (kind === "url") await visit(target!);
else { const s = await serve(target!); for (const page of await listPages(target!)) await visit(s.origin + page); await s.close(); }
for (const [k, v] of Object.entries(out).sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(v, k);
await b.close();
