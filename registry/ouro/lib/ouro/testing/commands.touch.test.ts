import { expect, test } from "vitest";
import { commands } from "vitest/browser";
import { rotate } from "@/registry/ouro/lib/ouro/testing/rotate";

test("the touch project reports a coarse pointer at 390x844", () => {
  expect(matchMedia("(pointer: coarse)").matches).toBe(true);
  expect(innerWidth).toBe(390);
});

test("rotate refuses to run on a page that is already zoomed, naming the test", async () => {
  await commands.setPageZoom(2);
  expect(await commands.pageZoom()).toBeCloseTo(2);
  try {
    await expect(rotate(844, 390)).rejects.toThrow(
      '"rotate refuses to run on a page that is already zoomed, naming the test" left the page zoomed to 2.00',
    );
  } finally {
    await commands.resetPageZoom();
  }
  expect(await commands.pageZoom()).toBe(1);
  await rotate(844, 390);
  expect(innerWidth).toBe(844);
  await rotate(390, 844);
});
