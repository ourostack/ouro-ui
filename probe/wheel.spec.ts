import { test } from "@playwright/test";

// What ends an animated wheel scroll: a plain scroller, no Ouro, a wheel of -400 from the bottom, and one action at its first
// scroll event (or the frame after it). Prints how far the wheel got, and when scrollend came.
const page = `<!doctype html><style>body{margin:0}#s{height:420px;width:360px;overflow:auto;overflow-anchor:none}#c{display:flex;flex-direction:column;gap:16px;padding:16px}.r{height:60px;flex:none;background:#ddd}</style>
<div id=s><div id=c>${'<div class=r></div>'.repeat(200)}</div></div>`;
const actions: Record<string, string> = {
  none: "",
  translate: "c.style.translate = '0 21px'",
  shrinkFar: "rows[20].style.height = '39px'",
  shrinkFarTranslate: "rows[20].style.height = '39px'; c.style.translate = '0 21px'",
  insertFar: "const n = document.createElement('div'); n.className = 'r'; c.insertBefore(n, rows[20])",
  insertFarTranslate: "const n = document.createElement('div'); n.className = 'r'; c.insertBefore(n, rows[20]); c.style.translate = '0 -76px'",
  writeSame: "s.scrollTop = s.scrollTop",
  writeBy21: "s.scrollTop -= 21",
};
for (const reduced of [true, false])
  for (const when of ["scroll", "raf", "ro"])
    for (const [name, code] of Object.entries(actions))
      test(`${reduced ? "reduced" : "motion"} ${when} ${name}`, async ({ page: p }, info) => {
        await p.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
        const results: string[] = [];
        for (let run = 0; run < 10; run++) {
          await p.setContent(page);
          await p.evaluate(({ code, when }) => {
            const s = document.getElementById("s")!;
            const c = document.getElementById("c")!;
            const rows = [...c.children] as HTMLElement[];
            s.scrollTop = s.scrollHeight;
            const w = window as unknown as { log: string[] };
            w.log = [];
            const act = new Function("s", "c", "rows", code) as (s: HTMLElement, c: HTMLElement, rows: HTMLElement[]) => void;
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                const start = s.scrollTop;
                let done = false;
                s.addEventListener("scroll", () => {
                  w.log.push(`s${Math.round(start - s.scrollTop)}`);
                  if (done) return;
                  done = true;
                  if (when === "scroll") act(s, c, rows);
                  else if (when === "raf") requestAnimationFrame(() => act(s, c, rows));
                  else {
                    const ro = new ResizeObserver(() => (ro.disconnect(), act(s, c, rows)));
                    ro.observe(c);
                    rows[0]!.style.height = "61px";
                  }
                });
                s.addEventListener("scrollend", () => w.log.push(`e${Math.round(start - s.scrollTop)}`));
                (window as unknown as { start: number }).start = start;
              }),
            );
          }, { code, when });
          await p.waitForTimeout(100);
          const box = (await p.locator("#s").boundingBox())!;
          await p.mouse.move(box.x + 100, box.y + 200);
          await p.mouse.wheel(0, -400);
          await p.waitForTimeout(1500);
          const moved = await p.evaluate(() => Math.round((window as unknown as { start: number }).start - document.getElementById("s")!.scrollTop));
          const log = await p.evaluate(() => (window as unknown as { log: string[] }).log.join(" "));
          results.push(`${moved}`);
          if (run === 0) results.push(`[${log.slice(0, 120)}]`);
        }
        console.log(`PROBE ${info.project.name} ${reduced ? "reduced" : "motion"} ${when} ${name}: ${results.join(" ")}`);
      });
