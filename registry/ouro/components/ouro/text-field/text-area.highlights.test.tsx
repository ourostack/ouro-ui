import { useState, type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, userEvent } from "vitest/browser";
import { TextArea, type TextAreaHighlight, type TextAreaProps } from "@/registry/ouro/components/ouro/text-field/text-area";
import { moveHighlights } from "@/registry/ouro/components/ouro/text-field/text-area-styles";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
let mounted: HTMLElement[] = [];

async function render(node: ReactNode, width = 360) {
  const host = document.createElement("div");
  host.style.padding = "24px";
  host.style.width = `${width}px`;
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return {
    host,
    rerender: (next: ReactNode) => act(async () => root.render(next)),
    get textarea() {
      return host.querySelector<HTMLTextAreaElement>("textarea")!;
    },
    get layer() {
      return host.querySelector<HTMLElement>("[data-ouro-highlights-layer]")!;
    },
    get marks() {
      return [...host.querySelectorAll<HTMLElement>("[data-ouro-highlight]")].map((mark) => mark.textContent);
    },
  };
}

/** The texts of the elements `aria-describedby` names, in order. */
const descriptions = (element: Element) =>
  (element.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent);

/** Types at a place in the text, as a person does: the caret there, then the keys. */
async function typeAt(textarea: HTMLTextAreaElement, at: number, keys: string, end = at) {
  textarea.focus();
  textarea.setSelectionRange(at, end);
  await userEvent.keyboard(keys);
}

/** A controlled TextArea whose highlights the app stores from onHighlightsChange. */
function Stored({ text, highlights, onHighlightsChange, ...props }: { text: string; highlights: TextAreaHighlight[]; onHighlightsChange?: (highlights: TextAreaHighlight[]) => void } & Partial<TextAreaProps>) {
  const [value, setValue] = useState(text);
  const [marks, setMarks] = useState(highlights);
  return (
    <TextArea
      label="Reply"
      {...props}
      value={value}
      onValueChange={setValue}
      highlights={marks}
      onHighlightsChange={(next) => {
        setMarks(next);
        onHighlightsChange?.(next);
      }}
    />
  );
}

const suggested = "Suggested by your assistant";

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
});

describe("TextArea highlights", () => {
  it("marks each range over its words, in a layer with the textarea's box and type, and lets the pointer through", async () => {
    const { textarea, layer, marks } = await render(
      <TextArea label="Reply" defaultValue="Thanks for the notes. See you Saturday." highlights={[{ start: 0, end: 21, label: suggested }]} />,
    );
    expect(marks).toEqual(["Thanks for the notes."]);
    expect(layer.getAttribute("aria-hidden")).toBe("true");
    expect(layer.textContent).toBe(`${textarea.value}\n\u200b`);
    const area = getComputedStyle(textarea);
    const drawn = getComputedStyle(layer);
    for (const name of ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "borderTopWidth", "borderLeftWidth", "fontFamily", "fontSize", "lineHeight", "letterSpacing"] as const) {
      expect(drawn[name], name).toBe(area[name]);
    }
    expect(drawn.visibility).toBe("visible");
    expect(drawn.pointerEvents).toBe("none");
    expect(drawn.webkitTextFillColor).toBe("rgba(0, 0, 0, 0)");
    expect(drawn.color).toBe(area.color);
    const box = textarea.getBoundingClientRect();
    const over = layer.getBoundingClientRect();
    expect([over.left, over.top, over.width, over.height]).toEqual([box.left, box.top, box.width, box.height]);
    const mark = layer.querySelector<HTMLElement>("[data-ouro-highlight]")!.getBoundingClientRect();
    expect(mark.top).toBeGreaterThanOrEqual(box.top);
    expect(mark.left).toBeGreaterThanOrEqual(box.left);
  });

  it("wraps a mark with its words onto the next line", async () => {
    const text = "One two three four five six seven eight nine ten eleven twelve thirteen fourteen";
    const { layer } = await render(<TextArea label="Reply" defaultValue={text} autoGrow highlights={[{ start: 0, end: text.length, label: suggested }]} />, 240);
    expect(layer.querySelector("[data-ouro-highlight]")!.getClientRects().length).toBeGreaterThan(1);
  });

  it.each([
    ["primary", "dotted", "--primary", true],
    ["secondary", "dotted", "--muted-foreground", true],
    ["success", "dotted", "--success", true],
    ["destructive", "wavy", "--destructive", false],
    ["warning", "wavy", "--warning", false],
  ] as const)("draws a %s mark as a %s underline in its tone", async (tone, style, token, tinted) => {
    const { host } = await render(
      <>
        <span data-probe="" style={{ color: `var(${token})` }} />
        <TextArea label="Reply" defaultValue="A word" highlights={[{ start: 2, end: 6, label: "Marked", tone }]} />
      </>,
    );
    const mark = host.querySelector<HTMLElement>("[data-ouro-highlight]")!;
    expect(mark.getAttribute("data-ouro-highlight")).toBe(tone);
    const look = getComputedStyle(mark);
    expect(look.textDecorationLine).toBe("underline");
    expect(look.textDecorationStyle).toBe(style);
    expect(look.textDecorationColor).toBe(getComputedStyle(host.querySelector("[data-probe]")!).color);
    expect(look.backgroundColor === "rgba(0, 0, 0, 0)").toBe(!tinted);
  });

  it("draws a mark with no tone in primary", async () => {
    const { host } = await render(<TextArea label="Reply" defaultValue="A word" highlights={[{ start: 2, end: 6, label: "Marked" }]} />);
    expect(host.querySelector("[data-ouro-highlight]")!.getAttribute("data-ouro-highlight")).toBe("primary");
  });

  it("underlines in the system's text colour under forced colours, and keeps the layer's text transparent", async () => {
    await commands.emulateMedia({ forcedColors: "active" });
    try {
      const { host, layer } = await render(
        <>
          <span data-probe="" style={{ color: "CanvasText" }} />
          <TextArea label="Reply" defaultValue="A word" highlights={[{ start: 2, end: 6, label: "Marked" }]} />
        </>,
      );
      expect(getComputedStyle(host.querySelector("[data-ouro-highlight]")!).textDecorationColor).toBe(getComputedStyle(host.querySelector("[data-probe]")!).color);
      expect(getComputedStyle(layer).webkitTextFillColor).toBe("rgba(0, 0, 0, 0)");
    } finally {
      await commands.emulateMedia({ forcedColors: "none" });
    }
  });

  it("shows the later mark where two overlap", async () => {
    const { host, marks } = await render(
      <TextArea label="Reply" defaultValue="abcdef" highlights={[{ start: 0, end: 4, label: "First" }, { start: 2, end: 6, label: "Second", tone: "warning" }]} />,
    );
    expect(marks).toEqual(["ab", "cdef"]);
    expect(host.querySelectorAll("[data-ouro-highlight]")).toHaveLength(2);
    expect([...host.querySelectorAll("[data-ouro-highlight]")].map((mark) => mark.getAttribute("data-ouro-highlight"))).toEqual(["primary", "warning"]);
  });

  it("clamps marks to the text and leaves out those that mark nothing", async () => {
    const { marks } = await render(
      <TextArea
        label="Reply"
        defaultValue="Hello there"
        highlights={[
          { start: -3, end: 2, label: "Before" },
          { start: 6, end: 40, label: "After" },
          { start: 4, end: 4, label: "Empty" },
          { start: 5, end: 3, label: "Backwards" },
          { start: Number.NaN, end: 3, label: "Not a number" },
          { start: 1.6, end: 3.2, label: "Fractional" },
        ]}
      />,
    );
    expect(marks).toEqual(["H", "el", "there"]);
  });

  it("describes the marks after the field's own description: each label once, with the words it marks", async () => {
    const text = "Thanks for the notes. I can bring the sourdough starter and a jar of honey from the market on Saturday. See you tehn.";
    const { textarea } = await render(
      <TextArea
        label="Reply"
        description="Only you see this."
        aria-describedby="outside"
        defaultValue={text}
        highlights={[
          { start: 0, end: 21, label: suggested },
          { start: 21, end: 22, label: "Blank" },
          { start: 112, end: 116, label: "Possible spelling mistake", tone: "destructive" },
          { start: 28, end: 103, label: suggested },
        ]}
      />,
    );
    const describedBy = textarea.getAttribute("aria-describedby")!.split(" ");
    expect(describedBy[1]).toBe("outside");
    expect(descriptions(textarea).filter((text) => text !== undefined)).toEqual([
      "Only you see this.",
      `${suggested}: \u201cThanks for the notes.\u201d, \u201cbring the sourdough starter and a jar of\u2026\u201d. Possible spelling mistake: \u201ctehn\u201d.`,
    ]);
  });

  it("adds nothing to the description without marks, and keeps the app's description", async () => {
    const { textarea, layer } = await render(<TextArea label="Reply" aria-describedby="outside" defaultValue="Hi" highlights={[]} />);
    expect(textarea.getAttribute("aria-describedby")).toBe("outside");
    expect(layer).not.toBeNull();
  });

  it("renders no layer and no box around the textarea without highlights", async () => {
    const { host, textarea } = await render(<TextArea label="Reply" defaultValue="Hi" />);
    expect(host.querySelector("[data-ouro-highlights]")).toBeNull();
    expect(textarea.hasAttribute("aria-describedby")).toBe(false);
  });
});

describe("TextArea highlights as the person edits", () => {
  it("never marks what the person types, before, after or inside a mark, and splits a mark they type inside", async () => {
    const onHighlightsChange = vi.fn();
    const { textarea, marks } = await render(<Stored text="one two three" highlights={[{ start: 4, end: 7, label: suggested, id: "two" }]} onHighlightsChange={onHighlightsChange} />);
    expect(marks).toEqual(["two"]);
    await typeAt(textarea, 7, "!");
    expect(textarea.value).toBe("one two! three");
    expect(onHighlightsChange).not.toHaveBeenCalled();
    await typeAt(textarea, 4, "my ");
    expect(onHighlightsChange).toHaveBeenLastCalledWith([{ start: 7, end: 10, label: suggested, id: "two" }]);
    await typeAt(textarea, 8, "--");
    expect(textarea.value).toBe("one my t--wo! three");
    expect(onHighlightsChange).toHaveBeenLastCalledWith([
      { start: 7, end: 8, label: suggested, id: "two" },
      { start: 10, end: 12, label: suggested, id: "two" },
    ]);
    const { host } = { host: textarea.closest("div")! };
    expect([...host.querySelectorAll("[data-ouro-highlight]")].map((mark) => mark.textContent)).toEqual(["t", "wo"]);
  });

  it("drops a mark whose words the person deletes, and trims one they delete part of", async () => {
    const onHighlightsChange = vi.fn();
    const { textarea } = await render(
      <Stored text="one two three" highlights={[{ start: 0, end: 3, label: "A" }, { start: 4, end: 7, label: "B" }, { start: 8, end: 13, label: "C" }]} onHighlightsChange={onHighlightsChange} />,
    );
    await typeAt(textarea, 2, "{Backspace}", 9);
    expect(textarea.value).toBe("onhree");
    expect(onHighlightsChange).toHaveBeenLastCalledWith([
      { start: 0, end: 2, label: "A" },
      { start: 2, end: 6, label: "C" },
    ]);
  });

  it("places an edit where the person made it when the text around it reads the same", async () => {
    const onHighlightsChange = vi.fn();
    const { textarea } = await render(<Stored text="aa" highlights={[{ start: 1, end: 2, label: "Second" }]} onHighlightsChange={onHighlightsChange} />);
    await typeAt(textarea, 1, "a");
    expect(onHighlightsChange).toHaveBeenLastCalledWith([{ start: 2, end: 3, label: "Second" }]);
  });

  it("brings the marks back when the person undoes an edit, and takes them away again on redo", async () => {
    const onHighlightsChange = vi.fn();
    const { textarea, host } = await render(<Stored text="one two three" highlights={[{ start: 4, end: 7, label: suggested }]} onHighlightsChange={onHighlightsChange} />);
    await typeAt(textarea, 5, "X");
    const marks = () => [...host.querySelectorAll("[data-ouro-highlight]")].map((mark) => mark.textContent);
    expect(marks()).toEqual(["t", "wo"]);
    await act(async () => void document.execCommand("undo"));
    expect(textarea.value).toBe("one two three");
    expect(marks()).toEqual(["two"]);
    expect(onHighlightsChange).toHaveBeenLastCalledWith([{ start: 4, end: 7, label: suggested }]);
    await act(async () => void document.execCommand("redo"));
    expect(textarea.value).toBe("one tXwo three");
    expect(marks()).toEqual(["t", "wo"]);
  });

  it("moves the marks for an undo to a text it has not seen, as for any edit", async () => {
    const onHighlightsChange = vi.fn();
    const { textarea } = await render(<Stored text="one two" highlights={[{ start: 4, end: 7, label: "B" }]} onHighlightsChange={onHighlightsChange} />);
    textarea.focus();
    await act(async () => {
      setNativeValue(textarea, "zero one two");
      textarea.setSelectionRange(5, 5);
      textarea.dispatchEvent(new InputEvent("input", { inputType: "historyUndo", bubbles: true }));
    });
    expect(onHighlightsChange).toHaveBeenLastCalledWith([{ start: 9, end: 12, label: "B" }]);
  });

  it("moves the marks by comparing the texts when a change comes with no input event", async () => {
    const onHighlightsChange = vi.fn();
    const { textarea } = await render(<Stored text="one two" highlights={[{ start: 4, end: 7, label: "B" }]} onHighlightsChange={onHighlightsChange} />);
    await act(async () => {
      setNativeValue(textarea, "one, two");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onHighlightsChange).toHaveBeenLastCalledWith([{ start: 5, end: 8, label: "B" }]);
  });

  it("moves the marks of an uncontrolled field as the person types, with or without a starting text", async () => {
    const onHighlightsChange = vi.fn();
    const { host } = await render(
      <>
        <TextArea label="One" defaultValue="one two" highlights={[{ start: 4, end: 7, label: "B" }]} onHighlightsChange={onHighlightsChange} />
        <TextArea label="Two" highlights={[{ start: 0, end: 3, label: "Nothing yet" }]} />
      </>,
    );
    const [one, two] = [...host.querySelectorAll("textarea")];
    await typeAt(one!, 0, "zero ");
    expect(onHighlightsChange).toHaveBeenLastCalledWith([{ start: 9, end: 12, label: "B" }]);
    expect(host.querySelector("[data-ouro-highlight]")!.textContent).toBe("two");
    await typeAt(two!, 0, "abc");
    expect(two!.value).toBe("abc");
    expect(host.querySelectorAll("[data-ouro-highlight]")).toHaveLength(1);
  });

  it("moves the marks with the text when the app changes the value, and keeps them for the same highlights in a new array", async () => {
    const view = (value: string) => <TextArea label="Reply" value={value} onValueChange={() => {}} highlights={[{ start: 4, end: 7, label: "B" }]} />;
    const { rerender, host } = await render(view("one two three"));
    await rerender(view("zero one two three"));
    expect(host.querySelector("[data-ouro-highlight]")!.textContent).toBe("two");
  });

  it("takes new highlights as they are given", async () => {
    const view = (highlights: TextAreaHighlight[]) => <TextArea label="Reply" value="one two three" onValueChange={() => {}} highlights={highlights} />;
    const { rerender, marks } = await render(view([{ start: 4, end: 7, label: "B" }]));
    expect(marks).toEqual(["two"]);
    await rerender(view([{ start: 8, end: 13, label: "C" }]));
    expect([...document.querySelectorAll("[data-ouro-highlight]")].map((mark) => mark.textContent)).toEqual(["three"]);
  });

  it("keeps undo working after many edits, remembering the latest hundred texts", async () => {
    const view = (value: string) => <TextArea label="Reply" value={value} onValueChange={() => {}} highlights={[{ start: 0, end: 1, label: "A" }]} />;
    const { rerender, host } = await render(view("a"));
    for (let count = 1; count <= 102; count++) await rerender(view(`a${"b".repeat(count)}`));
    expect(host.querySelector("[data-ouro-highlight]")!.textContent).toBe("a");
  });
});

describe("TextArea highlights' edit placement", () => {
  const mark = { start: 0, end: 1, label: "A" };

  it("places an edit by comparing the texts when the selection does not fit the text before it", () => {
    // A caret after "b" in "ba" cannot come from an edit after "a" in "a": the texts decide, and "b" was typed before the mark.
    expect(moveHighlights([mark], "a", "ba", { before: { start: 1, end: 1 }, caret: 2 })).toEqual([{ ...mark, start: 1, end: 2 }]);
  });

  it("places an edit by comparing the texts when the selection does not fit the text after it", () => {
    expect(moveHighlights([{ ...mark, start: 2, end: 3 }], "abc", "abXc", { before: { start: 0, end: 0 }, caret: 1 })).toEqual([{ ...mark, start: 3, end: 4 }]);
  });
});

/** Sets a textarea's value as the browser does, past React's tracker, so the next input event reads as a change. */
function setNativeValue(textarea: HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, value);
}

describe("TextArea highlights layout", () => {
  it("scrolls the marks with the text once autoGrow stops at maxRows", async () => {
    const text = Array.from({ length: 12 }, (_, line) => `line ${line}`).join("\n");
    const { textarea, layer } = await render(<TextArea label="Reply" defaultValue={text} autoGrow rows={1} maxRows={3} highlights={[{ start: text.length - 7, end: text.length, label: "Last" }]} />);
    textarea.scrollTop = 60;
    await expect.poll(() => (layer.firstElementChild as HTMLElement).style.transform).toBe(`translateY(-${textarea.scrollTop}px)`);
  });

  it("follows the textarea when its width changes", async () => {
    const { host, textarea, layer } = await render(<TextArea label="Reply" defaultValue="A few words to wrap" autoGrow highlights={[{ start: 0, end: 5, label: "A" }]} />);
    host.style.width = "200px";
    await expect.poll(() => layer.getBoundingClientRect().width).toBe(textarea.getBoundingClientRect().width);
  });

  it.each([
    ["ltr", "paddingRight", "paddingLeft"],
    ["rtl", "paddingLeft", "paddingRight"],
  ] as const)("leaves room for a classic scrollbar at the inline end, %s", async (dir, end, start) => {
    // Headless browsers draw overlay scrollbars, which take no width; this textarea reports a classic one, 12px wide.
    const text = Array.from({ length: 12 }, (_, line) => `line ${line}`).join("\n");
    const { textarea, layer } = await render(
      <div dir={dir}>
        <TextArea label="Reply" defaultValue={text} rows={2} highlights={[{ start: 0, end: 4, label: "A" }]} />
      </div>,
    );
    const style = getComputedStyle(textarea);
    const borders = parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
    Object.defineProperty(textarea, "clientWidth", { configurable: true, get: () => textarea.offsetWidth - borders - 12 });
    textarea.dispatchEvent(new Event("scroll"));
    expect(parseFloat(layer.style[end])).toBeCloseTo(parseFloat(style[end]) + 12, 1);
    expect(layer.style[start]).toBe(style[start]);
  });
});

describe("TextArea highlights development messages", () => {
  it.each([
    [[{ start: 0, end: 2, label: "" }], "highlights[0] has no label, so screen readers cannot say what it marks", '<TextArea highlights={[{ start: 0, end: 5, label: "Suggested by your assistant" }]}>'],
    [[{ start: 0, end: 2, label: "A" }, { start: 0, end: 2 }], "highlights[1] has no label, so screen readers cannot say what it marks", '<TextArea highlights={[{ start: 0, end: 5, label: "Suggested by your assistant" }]}>'],
    [[{ start: 3, end: 3, label: "A" }], "highlights[0] ends where it starts or before, so it marks nothing", "<TextArea highlights={[{ start: 0, end: 5, label }]}> with end after start"],
    [[{ start: 0, end: 2, label: "A", tone: "danger" }], 'highlights[0] has tone="danger", which is not a tone', '<TextArea highlights={[{ start: 0, end: 5, label: "Possible spelling mistake", tone: "destructive" }]}>'],
    [[{ start: 0, end: 2, label: "A" }, { start: 0, end: 2, label: "B", tone: "red" }], 'highlights[1] has tone="red", which is not a tone; use "primary", "secondary", "success", "destructive", "warning"', '<TextArea highlights={[{ start: 0, end: 5, label: "Possible spelling mistake", tone: "destructive" }]}>'],
  ])("says what is wrong with %j", async (highlights, problem, fix) => {
    await render(<TextArea label="Reply" defaultValue="Hello" highlights={highlights as TextAreaHighlight[]} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] TextArea: ${problem}. Fix: ${fix}.`);
  });

  it("renders a mark whose tone is not one in primary", async () => {
    const { host } = await render(<TextArea label="Reply" defaultValue="Hello" highlights={[{ start: 0, end: 2, label: "A", tone: "red" } as unknown as TextAreaHighlight]} />);
    expect(host.querySelector("[data-ouro-highlight]")!.getAttribute("data-ouro-highlight")).toBe("primary");
  });

  it("points marks to highlights", async () => {
    const props = { label: "Reply", marks: [] } as unknown as TextAreaProps;
    const { textarea } = await render(<TextArea {...props} />);
    expect(warn).toHaveBeenCalledWith('[ouro-ui] TextArea: marks is not a prop. Fix: <TextArea highlights={[{ start: 0, end: 5, label: "Suggested" }]}>.');
    expect(textarea.hasAttribute("marks")).toBe(false);
  });

  it("says nothing for valid highlights", async () => {
    await render(<TextArea label="Reply" defaultValue="Hello there" highlights={[{ start: 0, end: 5, label: "A", tone: "warning", id: "a" }]} />);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("TextArea highlights server rendering", () => {
  const node = (
    <div>
      <TextArea label="Reply" defaultValue="Thanks for the notes." highlights={[{ start: 0, end: 6, label: suggested }]} />
    </div>
  );

  it("writes the marks' description and a hidden layer on the server", () => {
    const doc = new DOMParser().parseFromString(renderToString(node), "text/html");
    const textarea = doc.querySelector("textarea")!;
    expect(textarea.getAttribute("aria-describedby")!.split(" ").map((id) => doc.getElementById(id)!.textContent)).toEqual([`${suggested}: \u201cThanks\u201d.`]);
    expect(doc.querySelector("[data-ouro-highlights-layer]")!.className).toContain("invisible");
  });

  it("hydrates with no hydration error, then shows the marks", async () => {
    const host = document.createElement("div");
    host.innerHTML = renderToString(node);
    document.body.append(host);
    mounted.push(host);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const recoverable = vi.fn();
    let root!: Root;
    await act(async () => {
      root = hydrateRoot(host, node, { onRecoverableError: recoverable });
    });
    roots.push(root);
    expect(recoverable).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(getComputedStyle(host.querySelector("[data-ouro-highlights-layer]")!).visibility).toBe("visible");
  });
});
