import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { insertText } from "@/registry/ouro/lib/ouro/insert-text";

let control: HTMLTextAreaElement | HTMLInputElement;
let inputs: string[] = [];
// On the page rather than the field, as React listens, so the input event must bubble to reach it.
const record = (event: Event) => inputs.push((event as InputEvent).inputType);
const field = (tag: "input" | "textarea", value: string) => {
  control = document.createElement(tag);
  control.setAttribute("aria-label", "Name");
  control.value = value;
  document.body.append(control);
  return control;
};

beforeEach(() => {
  inputs = [];
  document.body.addEventListener("input", record);
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.removeEventListener("input", record);
  control.remove();
});

it("replaces the range and puts the caret after it, in one step undo takes out", () => {
  const box = field("textarea", "Hi @av, see you");
  insertText(box, 3, 6, "@Avery ");
  expect(box.value).toBe("Hi @Avery , see you");
  expect([box.selectionStart, box.selectionEnd]).toEqual([10, 10]);
  expect(inputs).toEqual(["insertText"]);
  expect(document.activeElement).toBe(box);
  document.execCommand("undo");
  expect(box.value).toBe("Hi @av, see you");
});

it("inserts with setRangeText and an input event where insertText is not available", () => {
  const input = field("input", "Hi @av");
  vi.spyOn(document, "execCommand").mockReturnValue(false);
  expect(document.activeElement).not.toBe(input);
  insertText(input, 3, 6, "@Avery ");
  expect(input.value).toBe("Hi @Avery ");
  expect([input.selectionStart, input.selectionEnd]).toEqual([10, 10]);
  expect(inputs).toEqual(["insertReplacementText"]);
  // It edits as typing would, so the control has focus afterwards.
  expect(document.activeElement).toBe(input);
});
