import { expect, it } from "vitest";
import { lastInput } from "@/registry/ouro/lib/ouro/last-input";

const move = (pointerType: string) => document.dispatchEvent(new PointerEvent("pointermove", { pointerType }));
const press = (pointerType: string) => document.dispatchEvent(new PointerEvent("pointerdown", { pointerType }));

it("records the pointer type of a press, and keyboard after a key press", () => {
  press("touch");
  expect(lastInput()).toBe("touch");
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" }));
  expect(lastInput()).toBe("keyboard");
});

it("counts a moving mouse or pen as in use again after a touch, but not a moving finger", () => {
  press("touch");
  move("touch");
  expect(lastInput()).toBe("touch");
  move("mouse");
  expect(lastInput()).toBe("mouse");
  press("touch");
  move("pen");
  expect(lastInput()).toBe("pen");
});

const modality = () => document.documentElement.getAttribute("data-ouro-modality");
const key = (name: string) => document.dispatchEvent(new KeyboardEvent("keydown", { key: name }));

it("marks the page's modality: pointer after a press, keyboard after a key, and not for a lone modifier", () => {
  press("mouse");
  expect(modality()).toBe("pointer");
  key("Shift");
  expect(modality()).toBe("pointer");
  key("Control");
  key("Alt");
  key("Meta");
  key("AltGraph");
  key("CapsLock");
  expect(modality()).toBe("pointer");
  key("Tab");
  expect(modality()).toBe("keyboard");
  press("touch");
  expect(modality()).toBe("pointer");
  key("ArrowDown");
  expect(modality()).toBe("keyboard");
});

it("leaves the attribute alone when the modality has not changed", () => {
  key("a");
  const seen: string[] = [];
  const observer = new MutationObserver((records) => records.forEach((record) => seen.push(record.attributeName ?? "")));
  observer.observe(document.documentElement, { attributes: true });
  key("b");
  return Promise.resolve().then(() => {
    observer.disconnect();
    expect(seen).toEqual([]);
  });
});

it("sees a press or key that a handler below stops, because it listens in the capture phase", () => {
  const target = document.body.appendChild(document.createElement("button"));
  const stop = (event: Event) => event.stopPropagation();
  target.addEventListener("pointerdown", stop);
  target.addEventListener("keydown", stop);
  try {
    key("Tab");
    target.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "mouse", bubbles: true }));
    expect(modality()).toBe("pointer");
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    expect(modality()).toBe("keyboard");
  } finally {
    target.remove();
  }
});
