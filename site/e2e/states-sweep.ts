import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { recordMatched } from "./waivers";
import { instability, settleMotion, wantsRetake } from "./stable-take";
import { describe, LOOK_SELECTOR, Looks, loaded, motionTick, picture, quiet, routeGuard, routes, settled, stagePaced } from "./looks";

// Every control, as each page shows it, is put through hover, keyboard focus and press, in both engines and
// both themes. Controls are deduped by component, part, variant, size and checked or disabled state, and a
// look is taken from at most SAMPLES pages, so the cost stays flat as pages are added. In every state a
// layer drawn on ::before or ::after that takes its control's radius keeps the control's corner shape, an
// element whose classes ask for round corners is drawn round, a switch's thumb stays inside its track, and
// the control's look (shape, box, padding, gap, colours, font, shadow, opacity, transform and its children's
// geometry, and a picture of it) is the one the other pages give it in the same state.

const SAMPLES = 2;
// The looks under a docs demo (components/demo-looks.tsx) are left out: a press repaints the whole page, so every control
// read after it on that page would wear another look, and their own states are those of a plain Button the sweep reads.
const CONTROL = "[data-ouro-control]:not(a):not([href]):not([disabled]):not([aria-hidden=true]):not([data-ouro-part=hidden-input]):not([data-ouro-part=input]):not([data-site-demo-looks] *)";

// The control is the element holding the mark the inventory pass wrote, not whatever sits at that position now.
async function broken(page: Page, index: number): Promise<string[]> {
  return page.evaluate(
    (i) => {
      const el = document.querySelector<HTMLElement>(`[data-sweep-look="${i}"]`);
      if (!el) return [];
      const out: string[] = [];
      const name = `${el.dataset["ouroControl"]}/${el.dataset["ouroPart"] ?? ""}`;
      const own = getComputedStyle(el);
      if (own.borderTopLeftRadius !== "0px") {
        for (const pseudo of ["::before", "::after"] as const) {
          const layer = getComputedStyle(el, pseudo);
          if (layer.content !== "none" && layer.borderTopLeftRadius === own.borderTopLeftRadius && layer.getPropertyValue("corner-shape") !== own.getPropertyValue("corner-shape"))
            out.push(`${name} ${pseudo} is ${layer.getPropertyValue("corner-shape")}, its control ${own.getPropertyValue("corner-shape")}`);
        }
      }
      for (const round of [el, ...el.querySelectorAll<HTMLElement>("*")])
        if (round.classList.contains("[corner-shape:round]") && getComputedStyle(round).getPropertyValue("corner-shape") !== "superellipse(1)")
          out.push(`${name}: ${round.dataset["ouroPart"] ?? round.tagName.toLowerCase()} classes ask for round, drawn ${getComputedStyle(round).getPropertyValue("corner-shape")}`);
      if (el.getAttribute("role") === "switch") {
        const a = el.getBoundingClientRect();
        for (const child of el.children) {
        const b = child.getBoundingClientRect();
        if (b.width <= 1) continue;
        if (b.left < a.left - 1 || b.right > a.right + 1 || b.top < a.top - 1 || b.bottom > a.bottom + 1) out.push(`${name}: thumb leaves its track`);
        }
      }
      return out;
    },
    index,
  );
}

export const CHUNKS = 8;

export function statesSweep(mode: "light" | "dark", chunk: number) {
  test(`states keep their look on every page, ${mode}, part ${chunk + 1} of ${CHUNKS}`, async ({ page, context, browserName }) => {
    test.setTimeout(900_000);
    page.setDefaultTimeout(5_000);
    await context.addInitScript((m) => localStorage.setItem("ouro-site-theme", JSON.stringify({ preset: "pearl", mode: m })), mode);
    const found: string[] = [];
    const unsteady: string[] = [];
    const looks = new Looks();
    const taken = new Map<string, number>();
    const guard = routeGuard(context, page);
    const spent = { load: 0, motion: 0, reads: 0, picture: 0 };
    const timed = async <T>(bucket: keyof typeof spent, work: () => Promise<T>) => {
      const t = Date.now();
      try {
        return await work();
      } finally {
        spent[bucket] += Date.now() - t;
      }
    };
    for (const path of routes().filter((_, n) => n % CHUNKS === chunk)) {
      await guard.visit(path, async (page) => {
        const { looks: rest } = await timed("load", async () => {
          await page.goto(path);
          await settled(page);
          await quiet(page);
          await loaded(page);
          return page.evaluate(describe, { selector: LOOK_SELECTOR });
        });
        const candidates = await page.evaluate(
          ([all, control]) =>
            [...document.querySelectorAll<HTMLElement>(all as string)].flatMap((el, i) => {
              const r = el.getBoundingClientRect();
              return el.matches(control as string) && r.width > 0 && r.height > 0 ? [i] : [];
            }),
          [LOOK_SELECTOR, CONTROL] as const,
        );
        for (const i of candidates) {
          const key = rest.find((l) => l.index === i)?.key;
          if (!key || (taken.get(key) ?? 0) >= SAMPLES) continue;
          taken.set(key, (taken.get(key) ?? 0) + 1);
          const control = page.locator(`[data-sweep-look="${i}"]`);
          // A page that removed or re-rendered the control since the inventory has no control to read: skip it.
          if ((await control.count()) !== 1) continue;
          // The site scrolls smoothly (html's scroll-behavior), so a plain scrollIntoView is still moving when the box is
          // read, and the mouse lands where the control was (#1453): instant, so the hover is on the control.
          await control.evaluate((el) => el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" }));
          // The home page's stage reaches its one verdict on its own clock, not on anything settled or quiet see: a
          // scroll that brings it onscreen can leave its judge mid-flight, so wait it out before this control's two
          // takes, each time a scroll might have moved the stage, so its verdict cannot land between them
          // (ourostack/ouro-ui#2989).
          await stagePaced(page);
          const box = await control.boundingBox();
          if (!box) continue;
          const marks = () => control.evaluate((el) => el.getAttributeNames().filter((n) => n.startsWith("data-") || n.startsWith("aria-")).map((n) => `${n}=${el.getAttribute(n)}`).sort().join(" "));
          const before = await marks();
          // What the control is, read with the mark: a hover or press that lands on another element (a later island moved
          // it) is skipped, never recorded under this control's key.
          const identity = () => control.evaluate((el) => `${el.dataset["ouroControl"]}/${el.dataset["ouroPart"] ?? ""}`);
          const who = await identity();
          const record = async (state: string, pseudo: string) => {
            if (!(await control.evaluate((el, p) => el.matches(p), pseudo)) || (await identity()) !== who) return;
            // A press that picks the control (a calendar day) changes what it is, so it no longer has this state's look.
            if ((await marks()) !== before) return;
            // A transition or a finite (non-looping) animation can start a frame or two after the state does, so
            // wait until none runs for several frames.
            const settle = () => settleMotion(() => motionTick(page));
            await timed("motion", settle);
            if (!(await control.evaluate((el, p) => el.matches(p), pseudo)) || (await marks()) !== before) return;
            found.push(...(await broken(page, i)).map((m) => `${path} ${state}: ${m}`));
            // A state's style can land a frame after the state itself (#1404: a hover read with the resting border while
            // :hover matched), so the look is read until two reads, a couple of frames apart, agree.
            const read = () => page.evaluate(describe, { selector: LOOK_SELECTOR, only: i });
            const { now, escapes } = await timed("reads", async () => {
              let { looks: now, escapes } = await read();
              for (let tries = 0; tries < 5; tries++) {
                await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
                const again = await read();
                if (again.looks[0]?.sig === now[0]?.sig) break;
                ({ looks: now, escapes } = again);
              }
              return { now, escapes };
            });
            found.push(...escapes.map((e) => `${path} ${state}: ${e}`));
            const look = now[0];
            if (!look) return;
            const tagged = { ...look, key: `${look.key}|${state}` };
            const label = await control.evaluate((el) => (el.getAttribute("aria-label") || el.closest("label, [data-ouro]")?.textContent || "").trim().slice(0, 40));
            const shot = tagged.pictured && looks.wants(tagged) ? await timed("picture", () => picture(page, i)) : null;
            if (shot && wantsRetake(process.env["OURO_SWEEP_RETAKE"], tagged.key)) {
              // The first take is only read once nothing is animating; the second take, read right after, needs the
              // same guard, or a transition that starts between the two takes reads as the state itself being
              // unstable (#2989).
              await settle();
              const again = await timed("picture", () => picture(page, i));
              const unstable = instability(shot, again, { signature: tagged.key, page: path, state });
              // A control that left the state between the takes shows another state in the second take, not an unsteady
              // picture of this one: a control the picture scrolls out from under the mouse loses its hover (#3021).
              if (unstable && (await marks()) === before && (await control.evaluate((el, p) => el.matches(p), pseudo))) {
                unsteady.push(unstable);
                // Both takes go in the report, so a finding shows what moved.
                for (const [n, take] of [shot, again!].entries())
                  await test.info().attach(`unsteady ${unsteady.length} take ${n + 1}.png`, {
                    body: await sharp(take.data, { raw: { width: take.width, height: take.height, channels: 4 } }).png().toBuffer(),
                    contentType: "image/png",
                  });
              }
            }
            looks.add(path, tagged, shot, label);
          };
          // Nothing keeps focus into the hover and press reads: a control focused before (by the page, or by the last
          // control's press handing focus to a sibling) would read its focus ring as part of the hover (#2235).
          await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await record("hover", ":hover");
          await page.mouse.down();
          await record("active", ":active");
          await page.mouse.move(0, 0);
          await page.mouse.up();
          await page.keyboard.press("Shift");
          await control.focus();
          await record("focus", ":focus-visible");
          await control.blur();
        }
      });
    }
    console.log(`TIMING ${browserName} ${mode} part ${chunk + 1}: page load ${spent.load} ms, motion settles ${spent.motion} ms, look reads ${spent.reads} ms, pictures ${spent.picture} ms, over ${looks.keys} control states`);
    console.log(`${browserName} ${mode}: ${looks.keys} control states, ${looks.crops} pictures`);
    for (const f of [...new Set(found), ...looks.differences(), ...looks.pixelDifferences()]) console.log(`FINDING ${browserName} ${mode}: ${typeof f === "string" ? f : JSON.stringify(f)}`);
    for (const side of looks.sides()) console.log(`SIDES ${browserName} ${mode}: ${side}`);
    expect.soft(guard.skipped.length, `routes skipped as too slow: ${guard.skipped.join(", ")}`).toBeLessThanOrEqual(3);
    recordMatched(`states-${mode}-${chunk}-${browserName}`);
    for (const f of unsteady) console.log(`FINDING ${browserName} ${mode}: ${f}`);
    expect.soft(unsteady, "a control's picture differs between two takes in a state").toEqual([]);
    expect.soft([...new Set(found)], "a control leaves its shape in a state").toEqual([]);
    expect.soft(looks.differences(), "a control's properties differ from page to page in a state").toEqual([]);
    expect.soft(looks.pixelDifferences(), "a control's picture differs from page to page in a state").toEqual([]);
  });
}
