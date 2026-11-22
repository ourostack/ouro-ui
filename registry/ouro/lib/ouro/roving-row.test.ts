import { afterEach, describe, expect, it } from "vitest";
import type { KeyboardEvent } from "react";
import { rovingRow } from "@/registry/ouro/lib/ouro/roving-row";

const names = ["a", "b", "c"];
let row: HTMLElement | undefined;

function build(dir = "ltr") {
  row = document.createElement("div");
  row.dir = dir;
  row.innerHTML = names.map((n) => `<button>${n}</button>`).join("") + "<input>";
  document.body.append(row);
  return [...row.querySelectorAll("button")];
}

function press(key: string, from: Element, mods: Partial<KeyboardEvent> = {}) {
  let prevented = false;
  rovingRow(names, "a").onKeyDown({ key, currentTarget: row, target: from, preventDefault: () => (prevented = true), altKey: false, ctrlKey: false, metaKey: false, ...mods } as unknown as KeyboardEvent<HTMLElement>);
  return prevented;
}

afterEach(() => row?.remove());

describe("rovingRow", () => {
  it("makes the pressed name the one Tab stop, or the first when none matches", () => {
    expect(names.map(rovingRow(names, "b").tabIndex)).toEqual([-1, 0, -1]);
    expect(names.map(rovingRow(names, "zzz").tabIndex)).toEqual([0, -1, -1]);
  });

  it("moves focus with the arrows, wrapping, and to the ends with Home and End", () => {
    const [a, b, c] = build();
    a!.focus();
    expect(press("ArrowRight", a!)).toBe(true);
    expect(document.activeElement).toBe(b);
    press("ArrowUp", b!);
    expect(document.activeElement).toBe(a);
    press("ArrowLeft", a!);
    expect(document.activeElement).toBe(c);
    press("ArrowDown", c!);
    expect(document.activeElement).toBe(a);
    press("End", a!);
    expect(document.activeElement).toBe(c);
    press("Home", c!);
    expect(document.activeElement).toBe(a);
  });

  it("flips left and right in a right-to-left row", () => {
    const [a, , c] = build("rtl");
    a!.focus();
    press("ArrowRight", a!);
    expect(document.activeElement).toBe(c);
    press("ArrowLeft", c!);
    expect(document.activeElement).toBe(a);
  });

  it("leaves other keys, modified arrows and keys from outside the buttons alone", () => {
    const [a] = build();
    a!.focus();
    expect(press("x", a!)).toBe(false);
    for (const mod of ["altKey", "ctrlKey", "metaKey"] as const) expect(press("ArrowRight", a!, { [mod]: true })).toBe(false);
    expect(press("ArrowRight", row!.querySelector("input")!)).toBe(false);
    expect(document.activeElement).toBe(a);
  });
});
