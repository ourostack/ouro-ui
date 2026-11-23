import { afterEach, describe, expect, it } from "vitest";
import { findPopupJumps, watchPopups } from "@/registry/ouro/check/popup-check";

// The popup-first-frame rule's page side, in a real browser. scripts/check/check.test.mts runs it through the whole check.

let host: HTMLDivElement;
afterEach(() => {
  host?.remove();
  delete (window as unknown as { __ouroCheckRef?: number }).__ouroCheckRef;
});

const frame = () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));

type Step = string | ((menu: HTMLElement) => void);

/** A layer at the end of a tall page, with a menu opened in it: drawn as `first` says, then changed by each step. */
async function open(first: string, then: Step | Step[], attrs = "") {
  host = document.createElement("div");
  host.innerHTML = `<div style="height:3000px"></div><div style="position:relative;isolation:isolate"><div role="menu" ${attrs} style="width:120px;height:40px;top:100px;left:40px;${first}">Rename</div></div>`;
  const menu = host.querySelector<HTMLElement>("[role=menu]")!;
  menu.style.visibility = "hidden";
  document.body.append(host);
  watchPopups();
  menu.style.visibility = "";
  await frame();
  for (const step of [then].flat()) {
    if (typeof step === "string") menu.style.cssText += `;${step}`;
    else step(menu);
    await frame();
  }
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

  it("judges the popover that opens, not an inline listbox inside it that rides its opening motion", async () => {
    host = document.createElement("div");
    host.innerHTML = `<div role="dialog" style="position:fixed;top:100px;left:40px;width:200px;height:80px;transform:translateY(9px)"><div role="listbox" style="width:100px;height:30px">Looks</div></div>`;
    const dialog = host.querySelector<HTMLElement>("[role=dialog]")!;
    document.body.append(host);
    watchPopups();
    await frame();
    dialog.style.transform = "none";
    await frame();
    expect(findPopupJumps()).toEqual([]);
  });

  it("still finds a listbox that has its own trigger and is drawn 9px from where it settles", async () => {
    host = document.createElement("div");
    host.innerHTML = `<button aria-controls="lb" aria-expanded="true">Pick</button><div role="listbox" id="lb" style="position:fixed;top:100px;left:40px;width:100px;height:30px;margin-top:9px">Looks</div>`;
    const list = host.querySelector<HTMLElement>("#lb")!;
    document.body.append(host);
    watchPopups();
    await frame();
    list.style.marginTop = "0";
    await frame();
    expect(findPopupJumps()).toHaveLength(1);
  });

  it("is left alone where a page allows it with a reason", async () => {
    expect(await open("position:absolute", "position:fixed", 'data-ouro-allow="popup-first-frame" data-ouro-allow-why="a documented demo"')).toEqual([]);
  });

  it("names a popup that moved after its first frames, by its id and classes, and keeps an earlier reference", async () => {
    (window as unknown as { __ouroCheckRef?: number }).__ouroCheckRef = 3;
    const issues = await open("position:fixed", ["position:absolute", "position:fixed"], 'id="m" class="a b" data-ouro-check-ref="w1"');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ ref: "p4", element: "div#m.a.b" });
    expect(issues[0]!.detail).toMatch(/frame \d+ of \d+ visible frame/);
    expect(host.querySelector("[role=menu]")!.getAttribute("data-ouro-check-ref")).toBe("w1 p4");
  });

  it("measures a positioner by where it is drawn, as its transform is its placement", async () => {
    const issues = await open("position:absolute;--anchor-width:10px", "position:fixed");
    expect(issues).toHaveLength(1);
  });

  it("reads a popup that opens with the scale and translate properties and a transform as where it settles", async () => {
    expect(await open("position:fixed;translate:10px;scale:1.2;transform:translateX(5px)", "translate:none;scale:none;transform:none")).toEqual([]);
    expect(await open("position:fixed;translate:10px 6px;scale:0.9 0.8", "translate:none;scale:none")).toEqual([]);
  });

  it("does not count a frame where the popup has no size or sits in a hidden box", async () => {
    expect(await open("position:absolute;width:0px", "position:fixed;width:120px")).toEqual([]);
    expect(await open("position:absolute;display:none", "position:fixed;display:block")).toEqual([]);
  });

  it("does not judge a popup that is gone or hidden by the time it is read", async () => {
    expect(await open("position:absolute", "visibility:hidden")).toEqual([]);
    expect(await open("position:absolute", (menu) => menu.remove())).toEqual([]);
  });

  it("starts fresh when it is watching already, and reads nothing when it was never started", async () => {
    watchPopups();
    expect(await open("position:fixed", "position:fixed")).toEqual([]);
    expect(findPopupJumps()).toEqual([]);
  });

  it("is left alone for all rules with a reason, but not without one", async () => {
    expect(await open("position:absolute", "position:fixed", 'data-ouro-allow="all" data-ouro-allow-why="a demo"')).toEqual([]);
    host.remove();
    expect(await open("position:absolute", "position:fixed", 'data-ouro-allow="popup-first-frame" data-ouro-allow-why=" "')).toHaveLength(1);
  });
});
