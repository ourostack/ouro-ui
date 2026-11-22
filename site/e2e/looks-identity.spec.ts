import { expect, test } from "@playwright/test";
import { describe, LOOK_SELECTOR, loaded, picture, quiet, settled } from "./looks";

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
// scroll offset, the islands above it) must not reach its box, colour or hover.
test("the More ways trigger hovers to one picture on every docs page", async ({ page }) => {
  const seen: { name: string; width: number; height: number; data: Buffer }[] = [];
  for (const name of ["badge", "button", "card", "command", "dialog", "image-cropper"]) {
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
    seen.push({ name, width: crop!.width, height: crop!.height, data: crop!.data });
  }
  const first = seen[0]!;
  for (const other of seen.slice(1)) {
    expect([other.width, other.height], `${other.name} against ${first.name}`).toEqual([first.width, first.height]);
    let off = 0;
    for (let i = 0; i < first.data.length; i += 4) {
      if (Math.max(...[0, 1, 2].map((c) => Math.abs(first.data[i + c]! - other.data[i + c]!))) > 40) off++;
    }
    expect(off / (first.width * first.height), `${other.name} against ${first.name}`).toBeLessThanOrEqual(0.015);
  }
});
