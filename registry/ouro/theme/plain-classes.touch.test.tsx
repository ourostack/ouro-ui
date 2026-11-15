import { afterEach, describe, expect, it } from "vitest";

// Runs in the `touch` project: Chromium as a phone with a coarse pointer, where ouro-base's disclosure title is a full touch target.
let host: HTMLElement | undefined;
afterEach(() => host?.remove());

describe("disclosure classes on a touch screen", () => {
  it("make the title at least 44px tall, at the 16px text size", () => {
    host = document.createElement("div");
    host.innerHTML = '<details class="ouro-disclosure"><summary class="ouro-disclosure-summary">Why it matters</summary></details>';
    document.body.append(host);
    const summary = host.querySelector("summary")!;
    expect(matchMedia("(pointer: coarse)").matches).toBe(true);
    expect(summary.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    expect(getComputedStyle(summary).fontSize).toBe("16px");
  });
});
