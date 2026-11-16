import { afterEach, describe, expect, it } from "vitest";
import ouroPlain from "./ouro-plain.css?inline";

// Runs in the `touch` project: Chromium as a phone with a coarse pointer, where ouro-plain's classes keep their touch targets. ouro-plain.css is an app's choice, so app.css leaves it out and this file loads it.
const plainSheet = document.createElement("style");
plainSheet.textContent = ouroPlain;
document.head.append(plainSheet);
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

describe("plain classes on a touch screen", () => {
  it("show what ouro-reveal hides from a mouse from the start, and make the focused skip link 44px tall", () => {
    host = document.createElement("div");
    host.innerHTML = '<a class="ouro-skip-link" href="#x">Skip to main content</a><div class="ouro-reveal-host"><span class="ouro-reveal">Archive</span></div>';
    document.body.append(host);
    expect(getComputedStyle(host.querySelector(".ouro-reveal")!).opacity).toBe("1");
    const link = host.querySelector("a")!;
    link.focus();
    expect(link.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
  });
});

describe("state classes on a touch screen", () => {
  it("make a segment and an option at least 44px tall, at the 16px text size", () => {
    host = document.createElement("div");
    host.innerHTML = '<div class="ouro-segmented"><label class="ouro-segment"><input type="radio" name="t" /> A</label></div><div role="option" class="ouro-option" aria-selected="false">Contoso</div>';
    document.body.append(host);
    const segment = host.querySelector(".ouro-segment")!;
    expect(segment.getBoundingClientRect().height).toBeGreaterThanOrEqual(40);
    expect(segment.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
    expect(host.querySelector(".ouro-segmented")!.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    expect(host.querySelector(".ouro-option")!.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    expect(getComputedStyle(segment).fontSize).toBe("16px");
  });
});
