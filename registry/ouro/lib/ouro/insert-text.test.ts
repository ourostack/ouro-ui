import { afterEach, expect, it, vi } from "vitest";
import { insertText } from "@/registry/ouro/lib/ouro/insert-text";

let control: HTMLTextAreaElement | HTMLInputElement;
const field = (tag: "input" | "textarea", value: string) => {
  control = document.createElement(tag);
  control.setAttribute("aria-label", "Name");
  control.value = value;
  document.body.append(control);
  return control;
};

afterEach(() => {
  vi.restoreAllMocks();
  control.remove();
});

it("replaces the range and puts the caret after it, in one step undo takes out", () => {
  const box = field("textarea", "Hi @av, see you");
  const inputs: string[] = [];
  box.addEventListener("input", (event) => inputs.push((event as InputEvent).inputType));
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
  const inputs: string[] = [];
  input.addEventListener("input", (event) => inputs.push((event as InputEvent).inputType));
  vi.spyOn(document, "execCommand").mockReturnValue(false);
  expect(document.activeElement).not.toBe(input);
  insertText(input, 3, 6, "@Avery ");
  expect(input.value).toBe("Hi @Avery ");
  expect([input.selectionStart, input.selectionEnd]).toEqual([10, 10]);
  expect(inputs).toEqual(["insertReplacementText"]);
  // It edits as typing would, so the control has focus afterwards.
  expect(document.activeElement).toBe(input);
});
