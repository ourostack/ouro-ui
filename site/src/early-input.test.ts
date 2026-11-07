import { afterEach, describe, expect, it } from "vitest";
import { EARLY_CONTROLS, EARLY_FIELDS, earlyInputScript, keepEarlyInput, type EarlyInputWindow } from "./early-input";

// The head script that keeps a tap or text from before its control hydrates (early-input.ts). Each test runs it over a
// container of its own, standing in for the page's document, and stands in for React by giving a node the key React keeps
// its fiber under.

const roots: HTMLElement[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) root.remove();
});

function page(body: string): { window: EarlyInputWindow; document: HTMLElement; clicks: string[] } {
  const root = document.createElement("div");
  root.innerHTML = body;
  document.body.append(root);
  roots.push(root);
  const clicks: string[] = [];
  // The control's own handler, as React's would be: on the node, below the document.
  for (const node of root.querySelectorAll("[data-name]"))
    node.addEventListener("click", (event) => {
      clicks.push(node.getAttribute("data-name")!);
      event.preventDefault();
    });
  const window = { document: root } as unknown as EarlyInputWindow;
  keepEarlyInput(window, EARLY_CONTROLS, EARLY_FIELDS);
  return { window, document: root, clicks };
}

const hydrate = <T extends Element>(node: T): T => Object.assign(node, { "__reactFiber$test": {} });
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
const frames3 = async () => {
  for (let count = 0; count < 3; count += 1) await nextFrame();
};

describe("keepEarlyInput", () => {
  it("keeps a tap on a control that has not hydrated, and presses it once, a frame after it has", async () => {
    const { window, document, clicks } = page('<button data-name="menu">Menu</button>');
    const menu = document.querySelector("button")!;
    const tap = new MouseEvent("click", { bubbles: true, cancelable: true });
    menu.dispatchEvent(tap);
    expect(tap.defaultPrevented).toBe(true);
    expect(clicks).toEqual([]);
    expect(window.__ouroEarlyInput).toBe(1);
    await frames3();
    expect(clicks).toEqual([]);
    hydrate(menu);
    await nextFrame();
    // Seen hydrated on this frame, pressed on the next.
    expect(clicks).toEqual([]);
    await frames3();
    expect(clicks).toEqual(["menu"]);
    expect(window.__ouroEarlyInput).toBe(0);
    await frames3();
    expect(clicks).toEqual(["menu"]);
  });

  it("shows the kept control pressed until it is answered, then as it was", async () => {
    const { document, clicks } = page('<button data-name="menu" style="opacity: 0.5">Menu</button><button data-name="other">Other</button>');
    const [menu, other] = [...document.querySelectorAll("button")] as [HTMLButtonElement, HTMLButtonElement];
    menu.click();
    expect([menu.style.scale, menu.style.opacity]).toEqual(["var(--ouro-press-scale, 0.97)", "0.8"]);
    // A tap on another lets the first go.
    other.click();
    expect([menu.style.scale, menu.style.opacity]).toEqual(["", "0.5"]);
    expect(other.style.opacity).toBe("0.8");
    hydrate(other);
    await frames3();
    expect(clicks).toEqual(["other"]);
    expect([other.style.scale, other.style.opacity]).toEqual(["", ""]);
  });

  it("keeps still where the reader asks for less motion, and only dims", () => {
    const root = document.createElement("div");
    root.innerHTML = "<button>Menu</button>";
    document.body.append(root);
    roots.push(root);
    const still = { document: root, matchMedia: (query: string) => ({ matches: query === "(prefers-reduced-motion: reduce)" }) } as unknown as EarlyInputWindow;
    keepEarlyInput(still, EARLY_CONTROLS, EARLY_FIELDS);
    const menu = root.querySelector("button")!;
    menu.click();
    expect([menu.style.scale, menu.style.opacity]).toEqual(["", "0.8"]);
  });

  it("presses only the last control tapped", async () => {
    const { document, clicks } = page('<button data-name="a">A</button><div role="tab" data-name="b">B</div>');
    const [a, b] = [document.querySelector('[data-name="a"]')!, document.querySelector('[data-name="b"]')!];
    (a as HTMLElement).click();
    (b as HTMLElement).click();
    hydrate(a);
    hydrate(b);
    await frames3();
    expect(clicks).toEqual(["b"]);
  });

  it("keeps a tap on what a control holds, and presses the control", async () => {
    const { document, clicks } = page('<button data-name="theme"><span>Pearl</span></button>');
    document.querySelector("span")!.click();
    hydrate(document.querySelector("button")!);
    await frames3();
    expect(clicks).toEqual(["theme"]);
  });

  it("leaves a hydrated control, a disabled one, a link and plain text to the page", async () => {
    const { document, clicks } = page('<button data-name="live">Live</button><button data-name="off" aria-disabled="true">Off</button><a href="#here" data-name="link">Here</a><p data-name="text">Text</p>');
    hydrate(document.querySelector('[data-name="live"]')!);
    for (const node of document.querySelectorAll<HTMLElement>("[data-name]")) node.click();
    expect(clicks).toEqual(["live", "off", "link", "text"]);
    await frames3();
    expect(clicks).toEqual(["live", "off", "link", "text"]);
  });

  it("holds a checkbox's tick until it has hydrated, then ticks it", async () => {
    const { document } = page('<input type="checkbox" />');
    const box = document.querySelector("input")!;
    box.click();
    expect(box.checked).toBe(false);
    hydrate(box);
    await frames3();
    expect(box.checked).toBe(true);
  });

  it("drops a tap whose control has gone", async () => {
    const { window, document, clicks } = page('<button data-name="gone">Gone</button>');
    const gone = document.querySelector("button")!;
    gone.click();
    gone.remove();
    hydrate(gone);
    await frames3();
    expect(clicks).toEqual([]);
    expect(window.__ouroEarlyInput).toBe(0);
  });

  it("puts typed text back once its field has hydrated and lost it, as an input the page hears", async () => {
    const { window, document } = page('<input type="search" />');
    const field = document.querySelector("input")!;
    const heard: string[] = [];
    field.addEventListener("input", () => heard.push(field.value));
    field.value = "tab";
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.value = "tabs";
    field.dispatchEvent(new Event("input", { bubbles: true }));
    expect(window.__ouroEarlyInput).toBe(1);
    heard.length = 0;
    // Hydrated, React sets the field to its own value.
    hydrate(field);
    field.value = "";
    await frames3();
    expect(field.value).toBe("tabs");
    expect(heard).toEqual(["tabs"]);
    expect(window.__ouroEarlyInput).toBe(0);
  });

  it("leaves text that hydration kept alone", async () => {
    const { document } = page("<textarea></textarea>");
    const field = document.querySelector("textarea")!;
    field.value = "Soup";
    field.dispatchEvent(new Event("input", { bubbles: true }));
    const heard: string[] = [];
    field.addEventListener("input", () => heard.push(field.value));
    hydrate(field);
    await frames3();
    expect(field.value).toBe("Soup");
    expect(heard).toEqual([]);
  });

  it("does not keep text typed into a hydrated field, or a checkbox's change", async () => {
    const { window, document } = page('<input id="live" /><input type="checkbox" id="box" />');
    const live = hydrate(document.querySelector<HTMLInputElement>("#live")!);
    live.value = "x";
    live.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("#box")!.dispatchEvent(new Event("change", { bubbles: true }));
    expect(window.__ouroEarlyInput ?? 0).toBe(0);
  });

  it("is in the head script, with the controls and fields it watches", () => {
    expect(earlyInputScript).toContain(JSON.stringify(EARLY_CONTROLS));
    expect(earlyInputScript).toContain(JSON.stringify(EARLY_FIELDS));
    expect(earlyInputScript.startsWith("try{(function")).toBe(true);
  });
});
