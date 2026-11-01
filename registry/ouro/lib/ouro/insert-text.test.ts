import { afterEach, describe, expect, it, vi } from "vitest";
import { insertText } from "@/registry/ouro/lib/ouro/insert-text";

let mounted: HTMLElement[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const node of mounted) node.remove();
  mounted = [];
});

/** A textarea at the bottom of a box that clips and is scrolled to its top. */
function field(value: string) {
  const frame = document.createElement("div");
  frame.style.cssText = "height: 60px; overflow: hidden";
  frame.innerHTML = '<div style="height: 400px"></div><textarea></textarea>';
  document.body.append(frame);
  mounted.push(frame);
  const textarea = frame.querySelector("textarea")!;
  textarea.value = value;
  return { frame, textarea };
}

describe("insertText", () => {
  it("replaces the range as an edit Undo takes back, puts the caret after it, and scrolls no box around the field", () => {
    const { frame, textarea } = field("Hi @jo");
    const input = vi.fn();
    textarea.addEventListener("input", input);
    insertText(textarea, 3, 6, "@Jordan Lee ");
    expect(textarea.value).toBe("Hi @Jordan Lee ");
    expect([textarea.selectionStart, textarea.selectionEnd]).toEqual([15, 15]);
    expect(document.activeElement).toBe(textarea);
    expect(frame.scrollTop).toBe(0);
    expect(input).toHaveBeenCalledTimes(1);
    document.execCommand("undo");
    expect(textarea.value).toBe("Hi @jo");
  });

  it("falls back to setRangeText and an input event where the browser has no insertText command", () => {
    const { textarea } = field("Hi @jo");
    vi.spyOn(document, "execCommand").mockReturnValue(false);
    const input = vi.fn((event: Event) => [(event as InputEvent).inputType, (event as InputEvent).data, event.bubbles]);
    textarea.addEventListener("input", input);
    insertText(textarea, 3, 6, "@Jo ");
    expect(textarea.value).toBe("Hi @Jo ");
    expect(textarea.selectionStart).toBe(7);
    expect(input.mock.results[0]!.value).toEqual(["insertReplacementText", "@Jo ", true]);
  });
});
