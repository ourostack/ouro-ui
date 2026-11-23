import { chromium } from "playwright";
const b = await chromium.launch();
try { for (const t of ["dark","light"]) {
 const p = await (await b.newContext({viewport:{width:1100,height:800}})).newPage();
 await p.goto("https://ui.ouroboros.bot/docs/chat-demo/"); await p.waitForTimeout(1000);
 await p.evaluate(t=>document.documentElement.classList.toggle("dark",t==="dark"),t);
 for (const st of ["Loading","Empty"]) { await p.getByRole("radio",{name:st}).first().click(); await p.waitForTimeout(500); await p.evaluate(()=>scrollTo(0,640)); await p.waitForTimeout(200); await p.screenshot({path:process.argv[2]+`/shots/c-1100-${t}-${st}2.png`}); }
}} finally { await b.close(); }
