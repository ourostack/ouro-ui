import { afterEach, describe, expect, it } from "vitest";
import { readSource } from "./render";

afterEach(() => {
  document.body.replaceChildren();
  document.head.replaceChildren();
});

describe("readSource", () => {
  it("skips a corner-shape element whose corners are all flat — a flat squircle is a plain rectangle", () => {
    document.body.innerHTML =
      '<div style="--corner-shape: squircle; border-radius: 0;"></div>';
    const element = document.body.firstElementChild as HTMLElement;

    expect(readSource(element)).toBeNull();
  });

  it("still reads a corner-shape element that has a radius on a corner", () => {
    document.body.innerHTML =
      '<div style="--corner-shape: squircle; border-radius: 12px 0 0 0;"></div>';
    const element = document.body.firstElementChild as HTMLElement;

    expect(readSource(element)).not.toBeNull();
  });
});
