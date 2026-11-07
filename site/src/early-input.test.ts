import { afterEach, describe, expect, it } from "vitest";
import { EARLY_ANSWER, EARLY_CONTROLS, EARLY_FIELDS, EARLY_PATIENCE, EARLY_POINTS, EARLY_SCOPE, earlyInputScript, keepEarlyInput, type EarlyInputWindow } from "./early-input";

// The head script that keeps a tap or text from before its control hydrates (early-input.ts). Each test runs it over a
// container of its own, standing in for the page's document, and stands in for React by giving a node the key React keeps
// its fiber under.

const roots: HTMLElement[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) root.remove();
});

function page(body: string, patience = EARLY_PATIENCE, answerWithin = EARLY_ANSWER): { window: EarlyInputWindow; document: HTMLElement; clicks: string[] } {
  const root = document.createElement("div");
  // The page's document, holding React's root and, beside it, anything React does not render.
  root.innerHTML = `<div id="root">${body}</div><button data-name="outside">Outside</button>`;
  document.body.append(root);
  roots.push(root);
  const clicks: string[] = [];
  // The control's own handler, as React's would be: on the node, below the document. It answers on the page, as the
  // page would: a menu opening, a switch turning.
  for (const node of root.querySelectorAll("[data-name]"))
    node.addEventListener("click", (event) => {
      clicks.push(node.getAttribute("data-name")!);
      if (!node.hasAttribute("data-quiet")) node.setAttribute("data-presses", String(clicks.length));
      event.preventDefault();
    });
  const window = { document: root } as unknown as EarlyInputWindow;
  keepEarlyInput(window, EARLY_CONTROLS, EARLY_POINTS, EARLY_FIELDS, EARLY_SCOPE, patience, answerWithin);
  return { window, document: root.querySelector<HTMLElement>(EARLY_SCOPE)!, clicks };
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

  it("keeps the pressed look until the page answers the press, or for at most its limit", async () => {
    const { document, clicks } = page('<button data-name="search" data-quiet>Search</button>', EARLY_PATIENCE, 120);
    const search = document.querySelector("button")!;
    const head = globalThis.document.createElement("head");
    document.parentElement!.append(head);
    Object.defineProperty(document.parentElement!, "head", { value: head });
    search.click();
    hydrate(search);
    await frames3();
    // Pressed, but the page has not answered yet (its palette's code is loading): still pressed.
    expect(clicks).toEqual(["search"]);
    expect(search.style.opacity).toBe("0.8");
    // A preload for the palette's code lands in the <head> first: not an answer.
    head.append(globalThis.document.createElement("link"));
    await nextFrame();
    expect(search.style.opacity).toBe("0.8");
    const palette = globalThis.document.createElement("div");
    document.append(palette);
    await nextFrame();
    expect(search.style.opacity).toBe("");
    // A press the page never answers lets go at the limit.
    search.style.opacity = "";
    const { document: other } = page('<button data-name="quiet" data-quiet>Quiet</button>', EARLY_PATIENCE, 120);
    const quiet = other.querySelector("button")!;
    quiet.click();
    hydrate(quiet);
    await frames3();
    expect(quiet.style.opacity).toBe("0.8");
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(quiet.style.opacity).toBe("");
  });

  it("keeps a press on a slider's track as where the finger left it, and presses there again once it has hydrated", async () => {
    const { window, document } = page('<div data-ouro-slider-control style="width: 200px; height: 20px"><div class="track"></div></div>');
    const control = document.querySelector<HTMLElement>("[data-ouro-slider-control]")!;
    const heard: string[] = [];
    for (const type of ["pointerdown", "pointermove", "pointerup"])
      control.addEventListener(type, (event) => heard.push(`${type} ${(event as PointerEvent).clientX} ${(event as PointerEvent).pointerId} ${(event as PointerEvent).buttons}`));
    // A drag: down at 20, along to 150, up there, and the click that follows.
    control.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 20, clientY: 5, pointerId: 7, pointerType: "touch" }));
    control.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 150, clientY: 5, pointerId: 7 }));
    control.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: 150, clientY: 5, pointerId: 7 }));
    control.click();
    expect(window.__ouroEarlyInput).toBe(1);
    expect(control.style.opacity).toBe("0.8");
    heard.length = 0;
    hydrate(control);
    await frames3();
    // On the control, from where it came down to where it lifted, with the button held along the way.
    expect(heard).toEqual(["pointerdown 20 0 1", "pointermove 52.5 0 1", "pointermove 85 0 1", "pointermove 117.5 0 1", "pointermove 150 0 1", "pointerup 150 0 0"]);
    expect(window.__ouroEarlyInput).toBe(0);
  });

  it("lets a press on a slider go when the browser takes it for a scroll", async () => {
    const { window, document } = page('<div data-ouro-slider-control style="width: 200px; height: 20px"></div>');
    const control = document.querySelector<HTMLElement>("[data-ouro-slider-control]")!;
    control.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 20, clientY: 5, pointerId: 7, pointerType: "touch" }));
    expect(control.style.opacity).toBe("0.8");
    control.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 7 }));
    expect(control.style.opacity).toBe("");
    expect(window.__ouroEarlyInput ?? 0).toBe(0);
    let heard = 0;
    control.addEventListener("pointerdown", () => (heard += 1));
    hydrate(control);
    await frames3();
    expect(heard).toBe(0);
  });

  it("leaves a press on a button inside a swiping row to the button's own click", async () => {
    const { document, clicks } = page('<div data-ouro="swipe-actions"><button data-name="more">More</button></div>');
    const more = document.querySelector("button")!;
    more.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 5, clientY: 5, pointerId: 3 }));
    more.click();
    hydrate(more);
    await frames3();
    expect(clicks).toEqual(["more"]);
  });

  it("keeps still where the reader asks for less motion, and only dims", () => {
    const root = document.createElement("div");
    root.innerHTML = '<div id="root"><button>Menu</button></div>';
    document.body.append(root);
    roots.push(root);
    const still = { document: root, matchMedia: (query: string) => ({ matches: query === "(prefers-reduced-motion: reduce)" }) } as unknown as EarlyInputWindow;
    keepEarlyInput(still, EARLY_CONTROLS, EARLY_POINTS, EARLY_FIELDS, EARLY_SCOPE, EARLY_PATIENCE, EARLY_ANSWER);
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

  it("tells the page of text that hydration left in the field, so the page's state holds it too", async () => {
    const { document } = page("<textarea></textarea>");
    const field = document.querySelector("textarea")!;
    field.value = "Soup";
    field.dispatchEvent(new Event("input", { bubbles: true }));
    const heard: string[] = [];
    field.addEventListener("input", () => heard.push(field.value));
    hydrate(field);
    await frames3();
    expect(field.value).toBe("Soup");
    expect(heard).toEqual(["Soup"]);
  });

  it("lets kept text go once the reader types into the hydrated field", async () => {
    const { window, document } = page('<input type="search" />');
    const field = document.querySelector("input")!;
    field.value = "tabs";
    field.dispatchEvent(new Event("input", { bubbles: true }));
    hydrate(field);
    field.value = "tabsx";
    field.dispatchEvent(new Event("input", { bubbles: true }));
    await frames3();
    expect(field.value).toBe("tabsx");
    expect(window.__ouroEarlyInput).toBe(0);
  });

  it("lets a kept tap go once the reader presses something the page answers itself", async () => {
    const { window, document, clicks } = page('<div role="switch" data-name="switch">Switch</div>');
    const control = document.querySelector<HTMLElement>('[role="switch"]')!;
    control.click();
    hydrate(control);
    // Hydrated, the reader's next press goes to the page: the first, kept from before, is now stale.
    control.click();
    expect(clicks).toEqual(["switch"]);
    expect([control.style.scale, control.style.opacity]).toEqual(["", ""]);
    await frames3();
    expect(clicks).toEqual(["switch"]);
    expect(window.__ouroEarlyInput).toBe(0);
  });

  it("leaves a control outside React's root to the page", () => {
    const { clicks } = page("<p>Inside</p>");
    const outside = [...globalThis.document.querySelectorAll<HTMLElement>('[data-name="outside"]')].at(-1)!;
    outside.click();
    // Its own handler heard it: the script let it through.
    expect(clicks).toEqual(["outside"]);
    expect(outside.style.opacity).toBe("");
  });

  it("lets a tap go, looking as it did, once its control has not hydrated in time", async () => {
    const { window, document, clicks } = page('<button data-name="never">Never</button>', 30);
    const never = document.querySelector("button")!;
    never.click();
    expect(never.style.opacity).toBe("0.8");
    await new Promise((resolve) => setTimeout(resolve, 60));
    await frames3();
    expect([never.style.scale, never.style.opacity]).toEqual(["", ""]);
    expect(window.__ouroEarlyInput).toBe(0);
    hydrate(never);
    await frames3();
    expect(clicks).toEqual([]);
  });

  it("answers the rest when a field will not take its text back", async () => {
    const { document, clicks } = page('<input id="odd" /><button data-name="menu">Menu</button>');
    const odd = document.querySelector<HTMLInputElement>("#odd")!;
    odd.value = "x";
    odd.dispatchEvent(new Event("input", { bubbles: true }));
    // A field whose own prototype has no value setter, as a subclassed element's.
    Object.setPrototypeOf(odd, Object.create(HTMLInputElement.prototype));
    const menu = document.querySelector("button")!;
    menu.click();
    hydrate(odd);
    hydrate(menu);
    await frames3();
    expect(clicks).toEqual(["menu"]);
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
    expect(earlyInputScript).toContain(JSON.stringify(EARLY_SCOPE));
    expect(earlyInputScript).toContain(JSON.stringify(EARLY_POINTS));
    expect(earlyInputScript).toContain(`,${EARLY_PATIENCE},${EARLY_ANSWER})`);
    expect(earlyInputScript.startsWith("try{(function")).toBe(true);
  });
});
