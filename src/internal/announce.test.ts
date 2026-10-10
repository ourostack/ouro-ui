import { afterEach, describe, expect, it } from "vitest";
import { announce } from "./announce.ts";

const regions = () => document.querySelectorAll<HTMLElement>("[data-ouro-announcer]");
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

afterEach(() => {
  for (const region of regions()) region.remove();
});

describe("announce", () => {
  it("creates one polite, visually hidden status region at the end of body", async () => {
    expect(regions()).toHaveLength(0);
    announce("Loading");
    const [region] = regions();
    expect(region!.getAttribute("role")).toBe("status");
    expect(region!.getAttribute("aria-live")).toBe("polite");
    expect(region!.getAttribute("aria-atomic")).toBe("true");
    expect(document.body.lastElementChild).toBe(region);
    const rect = region!.getBoundingClientRect();
    expect(rect.width).toBeLessThanOrEqual(1);
    expect(rect.height).toBeLessThanOrEqual(1);
    await nextFrame();
    expect(region!.textContent).toBe("Loading");
  });

  it("reuses the region across calls", async () => {
    announce("One");
    announce("Two");
    expect(regions()).toHaveLength(1);
    await nextFrame();
    expect(regions()[0]!.textContent).toBe("Two");
  });

  it("clears and re-sets a repeated message so it is spoken again", async () => {
    announce("Loading");
    await nextFrame();
    const region = regions()[0]!;
    announce("Loading");
    expect(region.textContent).toBe("");
    await nextFrame();
    expect(region.textContent).toBe("Loading");
  });

  it("recreates the region if the page removed it", async () => {
    announce("First");
    regions()[0]!.remove();
    announce("Second");
    expect(regions()).toHaveLength(1);
    await nextFrame();
    expect(regions()[0]!.textContent).toBe("Second");
  });
});
