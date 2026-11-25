import { expect, test, type Page } from "@playwright/test";
import { describe, LOOK_SELECTOR, loaded, motionTick, picture, quiet, settled, stagePaced } from "./looks";
import { instability, settleMotion } from "./stable-take";
import { slowFrames } from "./stage-helpers";

// A late island mounts ahead of a control between the sweep's inventory pass and its hover pass. The hover pass must still
// describe, hover and picture the control the inventory named, not whatever now sits at its position in the document.
const html = `<main>
  <button data-ouro-control="alpha" data-ouro-part="trigger" style="padding: 4px 30px; font: 14px sans-serif">Alpha</button>
  <button data-ouro-control="beta" data-ouro-part="trigger" style="padding: 12px 8px; font: 14px sans-serif">Beta</button>
</main>`;

test("a control that an island pushes down the document after the inventory keeps its look, hover and picture", async ({ page }) => {
  await page.goto("./docs/");
  await page.evaluate((markup) => { document.body.innerHTML = markup; }, html);
  await loaded(page);
  const { looks } = await page.evaluate(describe, { selector: LOOK_SELECTOR });
  const index = looks.findIndex((l) => l.size.includes("|Beta"));
  expect(index).toBeGreaterThanOrEqual(0);
  const inventory = looks[index]!;

  await page.evaluate(() => {
    const main = document.querySelector("main")!;
    for (const name of ["late-one", "late-two"]) {
      const late = document.createElement("button");
      late.setAttribute("data-ouro-control", name);
      late.setAttribute("data-ouro-part", "trigger");
      late.textContent = name;
      main.prepend(late);
    }
  });

  const read = (await page.evaluate(describe, { selector: LOOK_SELECTOR, only: index })).looks;
  expect(read).toHaveLength(1);
  expect(read[0]!.key).toBe(inventory.key);
  expect(read[0]!.sig).toBe(inventory.sig);

  const control = page.locator(`[data-sweep-look="${index}"]`);
  await expect(control).toHaveText("Beta");
  const at = (await control.boundingBox())!;
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
  await expect.poll(() => control.evaluate((el) => el.matches(":hover"))).toBe(true);
  const crop = await picture(page, index);
  expect(crop).not.toBeNull();
  const box = (await control.boundingBox())!;
  // The picture is the hovered control's: its shape, whatever the device pixel ratio.
  expect(Math.abs(crop!.width / crop!.height - box.width / box.height)).toBeLessThan(0.1);
});

test("loaded waits until a late island has mounted, so the inventory already holds it", async ({ page }) => {
  await page.goto("./docs/");
  await page.evaluate((markup) => {
    document.body.innerHTML = markup;
    setTimeout(() => {
      const late = document.createElement("button");
      late.setAttribute("data-ouro-control", "late");
      late.textContent = "late";
      document.querySelector("main")!.prepend(late);
    }, 80);
  }, html);
  await loaded(page);
  expect(await page.locator(LOOK_SELECTOR).count()).toBe(3);
});

// The same disclosure trigger on different component pages is one picture when hovered: what differs between pages (the
// scroll offset, the islands above it) must not reach its box, colour or hover. One test per page, each against the badge
// page's picture, so a slow page fails alone and no test runs past the timeout.
async function hoveredTrigger(page: Page, name: string) {
  await page.goto(`./docs/${name}/`);
  await settled(page);
  await quiet(page);
  await loaded(page);
  const { looks } = await page.evaluate(describe, { selector: LOOK_SELECTOR });
  const found = looks.filter((l) => l.key.startsWith("collapsible|trigger") && l.size.includes("More ways"));
  expect(found, `${name} has one More ways trigger`).toHaveLength(1);
  const index = found[0]!.index;
  await page.evaluate(describe, { selector: LOOK_SELECTOR, only: index });
  const trigger = page.locator(`[data-sweep-look="${index}"]`);
  await expect(trigger).toHaveText("More ways");
  // picture() centres the element, so centre it first: the mouse then stays over it through the picture.
  await trigger.evaluate((el) => el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" }));
  const at = (await trigger.boundingBox())!;
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
  await expect.poll(() => trigger.evaluate((el) => el.matches(":hover"))).toBe(true);
  const crop = await picture(page, index);
  expect(crop, `${name} pictured`).not.toBeNull();
  expect(await trigger.evaluate((el) => el.matches(":hover")), `${name} still hovered`).toBe(true);
  const style = await trigger.evaluate((el) => {
    const cs = getComputedStyle(el);
    return [cs.color, cs.backgroundColor, cs.paddingInline, cs.borderRadius, cs.textDecorationLine].join("|");
  });
  return { width: crop!.width, height: crop!.height, data: crop!.data, style };
}

test.describe("the More ways trigger hovers to one picture on every docs page", () => {
  for (const name of ["image-cropper", "card", "command", "aspect-ratio", "checkbox", "live-captions", "button", "dialog"]) {
    test(name, async ({ page }) => {
      const first = await hoveredTrigger(page, "badge");
      const other = await hoveredTrigger(page, name);
      expect(other.style, `${name} against badge`).toBe(first.style);
      expect([other.width, other.height], `${name} against badge`).toEqual([first.width, first.height]);
      let off = 0;
      for (let i = 0; i < first.data.length; i += 4) {
        if (Math.max(...[0, 1, 2].map((c) => Math.abs(first.data[i + c]! - other.data[i + c]!))) > 40) off++;
      }
      expect(off / (first.width * first.height), `${name} against badge`).toBeLessThanOrEqual(0.015);
    });
  }
});

// A retake's two takes are read back to back, with nothing between them; a transition or keyframe animation that
// starts only then (not when the state itself began, so the settle before the first take never saw it) used to
// leave the second take mid-flight (#2989). settleMotion, run again before the second take, waits it out the same
// way as before the first. A picture's screenshot runs with animations disabled, which fast-forwards any animation
// or transition it finds already running to its end value there and then (irreversibly, for the rest of the page's
// life) rather than holding the frame still; the first take here is read before the mover starts, so it is the
// take's own screenshot that catches the mover mid-flight and commits it, producing a genuine disagreement with the
// untouched take before it.
test("settleMotion waits out a mover that starts between two takes, so both agree once it has run its course (#2989)", async ({ page }) => {
  await page.goto("./docs/");
  await page.evaluate(() => {
    document.body.innerHTML = '<main><button data-ouro="mover" data-ouro-control="mover" data-ouro-part="trigger" style="width:40px;height:40px;background-color:#ff0000;transition:background-color 150ms linear"></button></main>';
  });
  await loaded(page);
  const { looks } = await page.evaluate(describe, { selector: LOOK_SELECTOR });
  expect(looks).toHaveLength(1);
  const index = 0;
  const where = { signature: "mover|trigger", page: "/synthetic/", state: "test" };

  const midA = await picture(page, index);
  await page.evaluate(() => {
    document.querySelector("button")!.style.backgroundColor = "#00ff00";
  });
  const midB = await picture(page, index);
  expect(instability(midA, midB, where), "two takes read back to back while a mover runs disagree").not.toBeNull();

  await settleMotion(() => motionTick(page));
  const afterA = await picture(page, index);
  const afterB = await picture(page, index);
  expect(instability(afterA, afterB, where), "once the mover has run its course, two more takes agree").toBeNull();
});

// The home page's stage judges the screen once on its own clock (a beat and then real frames, not an Animation or
// Transition settled and motionTick already wait for), and commits with a plain state update: left unwaited, the
// verdict could land between an unrelated control's two takes (ourostack/ouro-ui#2989). Forcing every frame to hold
// briefly, as stage-pacing.spec.ts forces a slow screen, makes the judge reach its verdict fast and every run.
test("stagePaced waits out the home page's stage before a control elsewhere on the page is taken twice (#2989)", async ({ page }) => {
  await slowFrames(page, 120);
  await page.goto("./");
  // A page held 120 ms every frame is never idle, so each hydration turn waits out its idle timeout: allow what openSlow
  // (stage-helpers.ts) allows such a page before the settle's own ready wait.
  await expect(page.locator("html[data-site-ready]")).toBeAttached({ timeout: 20_000 });
  await settled(page);
  await quiet(page);
  await loaded(page);
  // The stage is below the fold at load: its own judge never starts until a scroll (here standing in for a control
  // of its own, states-sweep.ts's real trigger) brings it onscreen.
  await page.locator("[data-stage]").evaluate((el) => el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" }));
  await stagePaced(page);
  await expect(page.locator("[data-stage]")).toHaveAttribute("data-paced", "");

  const swatch = page.getByRole("radiogroup", { name: "Accent" }).getByRole("radio").first();
  await swatch.evaluate((el) => el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" }));
  const at = (await swatch.boundingBox())!;
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
  await expect.poll(() => swatch.evaluate((el) => el.matches(":hover"))).toBe(true);
  const { looks } = await page.evaluate(describe, { selector: LOOK_SELECTOR });
  const found = looks.find((l) => l.key.includes("34x34") && l.key.includes("data-tone=secondary") && l.key.includes("data-variant=plain"));
  expect(found, "the accent swatch is in the inventory").toBeDefined();
  const index = found!.index;

  const first = await picture(page, index);
  await settleMotion(() => motionTick(page));
  const retake = await picture(page, index);
  expect(instability(first, retake, { signature: found!.key, page: "/", state: "hover" }), "the swatch's two takes agree once the stage's one verdict is already in").toBeNull();
});

// The stage's own judge bails out at once while it is offscreen (stage.tsx), so a call made before any control has
// scrolled it into view has nothing to wait for: it must return fast, not spin for stagePaced's own full timeout
// every time, which a one-time call before states-sweep.ts's loop once did (ourostack/ouro-ui#2989).
test("stagePaced returns at once while the stage is still offscreen, with no verdict yet to wait for (#2989)", async ({ page }) => {
  await page.goto("./");
  await settled(page);
  await quiet(page);
  await loaded(page);
  await expect(page.locator("[data-stage]")).not.toHaveAttribute("data-paced");
  const started = Date.now();
  await stagePaced(page);
  expect(Date.now() - started, "an offscreen stage has no judge in flight: no need to wait it out").toBeLessThan(5_000);
});

// An instant scrollIntoView returns before the browser's paint and compositor pipeline has necessarily caught up: a
// picture taken right then can show a frame still mid-repaint, with no Animation or Transition to mark it, so
// settleMotion never sees the gap either (ourostack/ouro-ui#3693). picture() must let at least one real frame land
// between the scroll and its screenshot, for every control it takes, not only one deep below the fold.
test("picture lets a real frame land after scrollIntoView before taking its screenshot, so a scroll-triggered repaint has already landed (#3693)", async ({ page }) => {
  await page.goto("./docs/");
  await page.evaluate(() => {
    document.body.innerHTML = '<main style="height:4000px"><button data-ouro-control="far" data-ouro-part="trigger" style="position:absolute;top:3000px;left:0;width:40px;height:40px">Far</button></main>';
    const marks: string[] = [];
    (window as unknown as { scrollPaintOrder: string[] }).scrollPaintOrder = marks;
    const realRaf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => realRaf((time) => {
      marks.push("frame");
      callback(time);
    });
    const realScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element, ...args: Parameters<typeof realScrollIntoView>) {
      marks.push("scroll");
      return realScrollIntoView.apply(this, args);
    };
  });
  await loaded(page);
  const { looks } = await page.evaluate(describe, { selector: LOOK_SELECTOR });
  const index = looks.findIndex((l) => l.size.includes("|Far"));
  expect(index).toBeGreaterThanOrEqual(0);

  const crop = await picture(page, index);
  expect(crop, "far control is pictured").not.toBeNull();
  const order = await page.evaluate(() => (window as unknown as { scrollPaintOrder: string[] }).scrollPaintOrder);
  const scrollAt = order.indexOf("scroll");
  expect(scrollAt, "picture scrolled the control into view").toBeGreaterThanOrEqual(0);
  expect(order.slice(scrollAt + 1), "a real frame lands after the scroll and before the screenshot").toContain("frame");
});
