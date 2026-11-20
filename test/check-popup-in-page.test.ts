import { afterEach, describe, expect, it } from "vitest";
import { findPopupJumps, watchPopups } from "@/registry/ouro/check/popup-check";

// The popup-first-frame rule's page side, in a real browser. scripts/check/check.test.mts runs it through the whole check.

let host: HTMLDivElement;
afterEach(() => {
  host?.remove();
  delete (window as unknown as { __ouroCheckRef?: number }).__ouroCheckRef;
});

const frame = () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));

/** A layer at the end of a tall page, with a menu opened in it: drawn as `first` says, then as `then` says. */
async function open(first: string, then: string, attrs = "") {
  host = document.createElement("div");
  host.innerHTML = `<div style="height:3000px"></div><div style="position:relative;isolation:isolate"><div role="menu" ${attrs} style="width:120px;height:40px;top:100px;left:40px;${first}">Rename</div></div>`;
  const menu = host.querySelector<HTMLElement>("[role=menu]")!;
  menu.style.visibility = "hidden";
  document.body.append(host);
  watchPopups();
  menu.style.visibility = "";
  await frame();
  menu.style.cssText += `;${then}`;
  await frame();
  await frame();
  return findPopupJumps();
}

describe("popup-first-frame", () => {
  it("finds a popup drawn inside a layer far down the page and then moved to where it settles", async () => {
    const issues = await open("position:absolute", "position:fixed");
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ rule: "popup-first-frame", unit: "px" });
    expect(issues[0]!.value).toBeGreaterThan(1000);
    expect(issues[0]!.detail).toContain("first visible frame");
  });

  it("passes a popup placed fixed from its first frame", async () => {
    expect(await open("position:fixed", "position:fixed")).toEqual([]);
  });

  it("does not count the scale and slide of a declared opening", async () => {
    const issues = await open("position:fixed;transform:scale(0.9) translateY(6px);opacity:0.4", "transform:none;opacity:1");
    expect(issues).toEqual([]);
  });

  it("does not count a frame where the popup is not visible", async () => {
    expect(await open("position:absolute;opacity:0", "position:fixed;opacity:1")).toEqual([]);
  });

  it("is left alone where a page allows it with a reason", async () => {
    expect(await open("position:absolute", "position:fixed", 'data-ouro-allow="popup-first-frame" data-ouro-allow-why="a documented demo"')).toEqual([]);
  });
});
