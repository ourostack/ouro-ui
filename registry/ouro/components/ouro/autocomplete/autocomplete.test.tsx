import { createRef, useState, type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Autocomplete, type AutocompleteItem, type AutocompleteProps, type AutocompleteTrigger } from "@/registry/ouro/components/ouro/autocomplete/autocomplete";
import { caretRect, filterItems, findMatch, matchAt } from "@/registry/ouro/components/ouro/autocomplete/autocomplete-styles";
import { Composer } from "@/registry/ouro/components/ouro/composer/composer";
import { TextArea } from "@/registry/ouro/components/ouro/text-field/text-area";
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.padding = "24px";
  host.style.width = "520px";
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return {
    host,
    rerender: (next: ReactNode) => act(async () => root.render(next)),
    get control() {
      return host.querySelector<HTMLTextAreaElement | HTMLInputElement>("textarea, input:not([type=hidden])")!;
    },
  };
}

const people: AutocompleteItem[] = [
  { value: "avery", label: "Avery Kim", description: "Design", avatar: {} },
  { value: "jordan", label: "Jordan Lee", description: "Engineering", avatar: { initials: "JL" } },
  { value: "priya", label: "Priya Natarajan", avatar: { src: "data:image/gif;base64,R0lGODlhAQABAAAAACw=" } },
  { value: "sasha", label: "Sasha Ortiz" },
];
const emoji: AutocompleteItem[] = [
  { value: "tada", label: "Party popper", glyph: "🎉", insert: "🎉", description: ":tada:" },
  { value: "taco", label: "Taco", glyph: "🌮", insert: "🌮", description: ":taco:" },
];

const filter = (items: AutocompleteItem[]) => (query: string) => items.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()) || item.value.startsWith(query));
const peopleTrigger: AutocompleteTrigger = { char: "@", label: "People", items: filter(people) };
const emojiTrigger: AutocompleteTrigger = { char: ":", label: "Emoji", minQueryLength: 2, items: filter(emoji) };

const listbox = () => document.querySelector<HTMLElement>('[data-ouro="autocomplete"]');
const options = () => [...document.querySelectorAll<HTMLElement>('[data-ouro="autocomplete"] [role="option"]')];
const labels = () => options().map((option) => option.querySelector(".truncate")!.textContent);
const activeLabel = (control: HTMLElement) => document.getElementById(control.getAttribute("aria-activedescendant") ?? "")?.querySelector(".truncate")?.textContent;
const announcer = () => document.querySelector("[data-ouro-announcer]")?.textContent ?? "";

/** Types into the focused control the way a person does. */
async function type(control: HTMLElement, text: string) {
  control.focus();
  await userEvent.keyboard(text);
}

/** Puts the caret at `index` in one step, then lets a key go, as after a jump with a keyboard shortcut. */
async function moveCaret(control: HTMLTextAreaElement | HTMLInputElement, index: number) {
  await act(async () => {
    control.setSelectionRange(index, index);
    control.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
  });
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(async () => {
  await page.viewport(1280, 800);
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
});

describe("Autocomplete", () => {
  it("opens a named listbox at the trigger, and the text keeps focus and points at the active suggestion", async () => {
    const { control } = await render(
      <Autocomplete triggers={[peopleTrigger]}>
        <TextArea label="Message" />
      </Autocomplete>,
    );
    expect(control.getAttribute("aria-autocomplete")).toBe("list");
    expect(control.hasAttribute("aria-haspopup")).toBe(false);
    expect(control.hasAttribute("aria-controls")).toBe(false);
    expect(control.hasAttribute("aria-activedescendant")).toBe(false);
    await type(control, "Thanks @");
    await expect.poll(listbox).not.toBeNull();
    await expect.element(page.getByRole("listbox", { name: "People" })).toBeVisible();
    expect(document.activeElement).toBe(control);
    expect(control.getAttribute("aria-controls")).toBe(listbox()!.id);
    expect(labels()).toEqual(["Avery Kim", "Jordan Lee", "Priya Natarajan", "Sasha Ortiz"]);
    expect(options().map((option) => option.getAttribute("aria-selected"))).toEqual(["true", "false", "false", "false"]);
    expect(activeLabel(control)).toBe("Avery Kim");
    expect(options().map((option) => option.getAttribute("data-ouro-control"))).toEqual(Array(4).fill("autocomplete"));
    expect(options().map((option) => option.getAttribute("data-ouro-part"))).toEqual(Array(4).fill("option"));
    // The list sits just below the trigger character.
    const at = caretRect(control as HTMLTextAreaElement, control.value.indexOf("@"));
    await expect.poll(() => !listbox()!.hasAttribute("data-starting-style") && listbox()!.getAnimations().length === 0).toBe(true);
    const box = listbox()!.getBoundingClientRect();
    expect(Math.abs(box.left - at.left)).toBeLessThan(2);
    expect(Math.abs(box.top - (at.bottom + 4))).toBeLessThan(2);
  });

  it("shows an avatar with initials or a picture, a glyph, and a description", async () => {
    const { control } = await render(
      <Autocomplete triggers={[peopleTrigger, emojiTrigger]}>
        <TextArea label="Message" />
      </Autocomplete>,
    );
    await type(control, "@");
    await expect.poll(() => options().length).toBe(4);
    const [avery, jordan, priya, sasha] = options();
    expect(avery!.querySelector('[data-ouro="avatar"]')!.textContent).toBe("AK");
    expect(jordan!.querySelector('[data-ouro="avatar"]')!.textContent).toBe("JL");
    expect(priya!.querySelector('[data-ouro="avatar"]')).not.toBeNull();
    expect(sasha!.querySelector('[data-ouro="avatar"]')).toBeNull();
    // With neither an avatar nor a glyph, the row is the label alone.
    expect(sasha!.querySelector('[aria-hidden="true"]')).toBeNull();
    expect(sasha!.children).toHaveLength(1);
    // Nothing typed after the trigger, so nothing is bold.
    expect(listbox()!.querySelector('[data-ouro-autocomplete-match]')).toBeNull();
    expect(avery!.lastElementChild!.textContent).toBe("Design");
    // The avatar is not read: the label is written beside it.
    await expect.element(page.getByRole("option", { name: "Avery Kim Design" })).toBeVisible();
    await userEvent.keyboard("{Escape} :ta");
    await expect.poll(labels).toEqual(["Party popper", "Taco"]);
    const glyph = options()[0]!.querySelector('[aria-hidden="true"]')!;
    expect(glyph.textContent).toBe("🎉");
  });

  it("filters by what follows the trigger, and closes when nothing matches", async () => {
    const { control } = await render(
      <Autocomplete triggers={[peopleTrigger]}>
        <TextArea label="Message" />
      </Autocomplete>,
    );
    await type(control, "@jo");
    await expect.poll(labels).toEqual(["Jordan Lee"]);
    // The typed part of the name is bold.
    expect(options()[0]!.querySelector('[data-ouro-autocomplete-match]')!.textContent).toBe("Jo");
    await userEvent.keyboard("x");
    await expect.poll(listbox).toBeNull();
    expect(control.hasAttribute("aria-activedescendant")).toBe(false);
    await userEvent.keyboard("{Backspace}");
    await expect.poll(labels).toEqual(["Jordan Lee"]);
  });

  it("moves with the arrow keys, round from either end", async () => {
    const { control } = await render(
      <Autocomplete triggers={[peopleTrigger]}>
        <TextArea label="Message" />
      </Autocomplete>,
    );
    await type(control, "@");
    await expect.poll(() => options().length).toBe(4);
    await userEvent.keyboard("{ArrowDown}");
    expect(activeLabel(control)).toBe("Jordan Lee");
    expect(options().map((option) => option.getAttribute("data-highlighted"))).toEqual([null, "", null, null]);
    // A new query starts again at the top.
    await userEvent.keyboard("a");
    await expect.poll(labels).toEqual(["Avery Kim", "Jordan Lee", "Priya Natarajan", "Sasha Ortiz"]);
    expect(activeLabel(control)).toBe("Avery Kim");
    await userEvent.keyboard("{Backspace}");
    await expect.poll(() => options().length).toBe(4);
    await userEvent.keyboard("{ArrowDown}");
    expect(activeLabel(control)).toBe("Jordan Lee");
    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    expect(activeLabel(control)).toBe("Sasha Ortiz");
    await userEvent.keyboard("{ArrowDown}");
    expect(activeLabel(control)).toBe("Avery Kim");
    // The caret stayed where it was.
    expect([control.selectionStart, control.selectionEnd]).toEqual([1, 1]);
  });

  it("inserts the pick with Enter in place of the trigger and query, runs the field's change handlers and onPick, and closes", async () => {
    const onPick = vi.fn();
    function Controlled() {
      const [text, setText] = useState("Ask ");
      return (
        <>
          <Autocomplete triggers={[{ ...peopleTrigger, onPick }]}>
            <TextArea label="Message" value={text} onValueChange={setText} />
          </Autocomplete>
          <output>{text}</output>
        </>
      );
    }
    const { host, control } = await render(<Controlled />);
    control.focus();
    control.setSelectionRange(4, 4);
    await userEvent.keyboard("@jor");
    await expect.poll(labels).toEqual(["Jordan Lee"]);
    await userEvent.keyboard("{Enter}");
    expect(control.value).toBe("Ask @Jordan Lee ");
    expect(host.querySelector("output")!.textContent).toBe("Ask @Jordan Lee ");
    expect([control.selectionStart, control.selectionEnd]).toEqual([16, 16]);
    expect(onPick).toHaveBeenCalledWith(people[1], "jor");
    await expect.poll(listbox).toBeNull();
    expect(document.activeElement).toBe(control);
  });

  it("picks with Enter in a Composer without sending, and leaves the next Enter to send", async () => {
    const onSend = vi.fn();
    const { control } = await render(
      <Autocomplete triggers={[peopleTrigger]}>
        <Composer label="Message" onSend={onSend} />
      </Autocomplete>,
    );
    await type(control, "Hi @sa");
    await expect.poll(labels).toEqual(["Sasha Ortiz"]);
    await userEvent.keyboard("{Enter}");
    expect(control.value).toBe("Hi @Sasha Ortiz ");
    expect(onSend).not.toHaveBeenCalled();
    await expect.poll(listbox).toBeNull();
    await userEvent.keyboard("{Enter}");
    expect(onSend).toHaveBeenCalledWith("Hi @Sasha Ortiz ", expect.anything());
  });

  it("picks with Tab, and leaves Shift+Tab and modified keys to the field", async () => {
    const onKeyDown = vi.fn();
    const { control } = await render(
      <Autocomplete triggers={[peopleTrigger]}>
        <TextArea label="Message" onKeyDown={onKeyDown} />
      </Autocomplete>,
    );
    await type(control, "@s");
    await expect.poll(labels).toEqual(["Sasha Ortiz"]);
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    expect(onKeyDown.mock.calls.at(-1)![0].key).toBe("Enter");
    expect(listbox()).not.toBeNull();
    await userEvent.keyboard("{Shift>}{ArrowDown}{/Shift}");
    expect(onKeyDown.mock.calls.at(-1)![0].key).toBe("ArrowDown");
    onKeyDown.mockClear();
    // Tab picks here rather than moving focus, so the test sends the key to the field itself:
    // pressTab() presses Option+Tab in WebKit on a Mac, which the list leaves to the field.
    const tab = new KeyboardEvent("keydown", { key: "Tab", code: "Tab", bubbles: true, cancelable: true });
    control.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(onKeyDown).not.toHaveBeenCalled();
    expect(control.value).toBe("@Sasha Ortiz ");
    expect(document.activeElement).toBe(control);
  });

  it("filters a plain list of items itself", async () => {
    const { control } = await render(
      <Autocomplete triggers={[{ char: "#", label: "Channels", items: [{ value: "general", label: "general" }, { value: "launch", label: "launch" }] }]}>
        <TextField label="Search" />
      </Autocomplete>,
    );
    await type(control, "#");
    await expect.poll(labels).toEqual(["general", "launch"]);
    await userEvent.keyboard("la");
    await expect.poll(labels).toEqual(["launch"]);
    await userEvent.keyboard("{Enter}");
    expect(control.value).toBe("#launch ");
  });

  it("uses the item's insert text, as for an emoji", async () => {
    const { control } = await render(
      <Autocomplete triggers={[peopleTrigger, emojiTrigger]}>
        <TextField label="Status" />
      </Autocomplete>,
    );
    expect(control.tagName).toBe("INPUT");
    await type(control, "Shipped :t");
    // Emoji wait for two characters.
    expect(listbox()).toBeNull();
    await userEvent.keyboard("a");
    await expect.poll(labels).toEqual(["Party popper", "Taco"]);
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(control.value).toBe("Shipped 🌮");
  });

  it("closes on Escape without passing it on, stays closed in that trigger, and opens on the next one", async () => {
    const onKeyDown = vi.fn();
    const outer = vi.fn();
    const { control } = await render(
      <div onKeyDown={outer}>
        <Autocomplete triggers={[peopleTrigger]}>
          <TextArea label="Message" onKeyDown={onKeyDown} />
        </Autocomplete>
      </div>,
    );
    await type(control, "@a");
    await expect.poll(listbox).not.toBeNull();
    onKeyDown.mockClear();
    outer.mockClear();
    await userEvent.keyboard("{Escape}");
    await expect.poll(listbox).toBeNull();
    expect(onKeyDown).not.toHaveBeenCalled();
    expect(outer).not.toHaveBeenCalled();
    await userEvent.keyboard("v");
    await expect.poll(() => control.value).toBe("@av");
    expect(listbox()).toBeNull();
    expect(control.hasAttribute("aria-controls")).toBe(false);
    // With the list closed, Escape is the field's again.
    await userEvent.keyboard("{Escape}");
    expect(onKeyDown).toHaveBeenCalled();
    await userEvent.keyboard(" @jor");
    await expect.poll(labels).toEqual(["Jordan Lee"]);
    // Once the caret has left a closed trigger, the same place opens again.
    await userEvent.keyboard("{Escape}");
    await expect.poll(listbox).toBeNull();
    await userEvent.keyboard("{Backspace}{Backspace}{Backspace}{Backspace}@j");
    await expect.poll(() => control.value).toBe("@av @j");
    await expect.poll(labels).toEqual(["Jordan Lee", "Priya Natarajan"]);
  });

  it("follows the pointer and picks on click, keeping focus in the text", async () => {
    const { control } = await render(
      <Autocomplete triggers={[peopleTrigger]}>
        <TextArea label="Message" />
      </Autocomplete>,
    );
    await type(control, "@");
    await expect.poll(() => options().length).toBe(4);
    await userEvent.hover(options()[2]!);
    expect(activeLabel(control)).toBe("Priya Natarajan");
    await userEvent.hover(options()[2]!);
    await userEvent.click(options()[1]!);
    expect(control.value).toBe("@Jordan Lee ");
    expect(document.activeElement).toBe(control);
  });

  it("opens only at the start, after a space or after an opening bracket, and never across a line break", async () => {
    const { control } = await render(
      <Autocomplete triggers={[peopleTrigger]}>
        <TextArea label="Message" />
      </Autocomplete>,
    );
    await type(control, "mail me@");
    expect(listbox()).toBeNull();
    await userEvent.keyboard(" (@");
    await expect.poll(listbox).not.toBeNull();
    await userEvent.keyboard("{Shift>}{Enter}{/Shift}");
    await expect.poll(listbox).toBeNull();
  });

  it("closes at a space unless allowSpaces, and keeps a first and last name together with it", async () => {
    const errors = vi.fn();
    window.addEventListener("error", errors);
    onTestFinished(() => window.removeEventListener("error", errors));
    const { control, rerender } = await render(
      <Autocomplete triggers={[peopleTrigger]}>
        <TextArea label="Message" />
      </Autocomplete>,
    );
    await type(control, "@Avery ");
    await expect.poll(listbox).toBeNull();
    expect(errors).not.toHaveBeenCalled();
    await userEvent.keyboard("{Backspace}");
    await expect.poll(labels).toEqual(["Avery Kim"]);
    await rerender(
      <Autocomplete triggers={[{ ...peopleTrigger, allowSpaces: true }]}>
        <TextArea label="Message" />
      </Autocomplete>,
    );
    await userEvent.keyboard(" K");
    await expect.poll(labels).toEqual(["Avery Kim"]);
    await userEvent.keyboard("{Enter}");
    expect(control.value).toBe("@Avery Kim ");
    // The pick ends in a space, which would match again with allowSpaces: it stays closed.
    expect(control.hasAttribute("aria-controls")).toBe(false);
    await userEvent.keyboard("x");
    await expect.poll(listbox).toBeNull();
    expect(control.value).toBe("@Avery Kim x");
  });

  it("closes while text is selected, when the field loses focus, and on a press outside", async () => {
    const { control, host } = await render(
      <>
        <button type="button" data-test-harness="">
          Elsewhere
        </button>
        <Autocomplete triggers={[peopleTrigger]}>
          <TextArea label="Message" />
        </Autocomplete>
      </>,
    );
    await type(control, "@a");
    await expect.poll(listbox).not.toBeNull();
    await userEvent.keyboard("{Shift>}{ArrowLeft}{/Shift}");
    await expect.poll(listbox).toBeNull();
    await userEvent.keyboard("{ArrowRight}");
    await expect.poll(listbox).not.toBeNull();
    // A press in the text only moves the caret.
    await userEvent.click(control);
    await expect.poll(listbox).not.toBeNull();
    await userEvent.click(host.querySelector("button")!);
    await expect.poll(listbox).toBeNull();
  });

  it("closes on blur and opens again on focus", async () => {
    const { control } = await render(
      <Autocomplete triggers={[peopleTrigger]}>
        <TextArea label="Message" />
      </Autocomplete>,
    );
    await type(control, "@a");
    await expect.poll(listbox).not.toBeNull();
    await userEvent.keyboard("{ArrowDown}");
    await act(async () => control.blur());
    await expect.poll(listbox).toBeNull();
    await act(async () => control.focus());
    await expect.poll(listbox).not.toBeNull();
    // The caret reads the same trigger again, so the same suggestion stays active.
    await moveCaret(control, 2);
    expect(activeLabel(control)).toBe("Jordan Lee");
  });

  it("stays closed after a pick whose text the trigger would match again", async () => {
    const { control } = await render(
      <Autocomplete triggers={[{ char: "@", label: "People", items: [{ value: "avery", label: "Avery Kim", insert: "@Avery" }] }]}>
        <TextArea label="Message" />
      </Autocomplete>,
    );
    await type(control, "@av");
    await expect.poll(labels).toEqual(["Avery Kim"]);
    await userEvent.keyboard("{Enter}");
    expect(control.value).toBe("@Avery");
    expect(control.hasAttribute("aria-controls")).toBe(false);
  });

  it("stays closed while the field does not have focus, even when its text changes", async () => {
    const { control } = await render(
      <Autocomplete triggers={[peopleTrigger]}>
        <TextArea label="Message" />
      </Autocomplete>,
    );
    await act(async () => {
      control.value = "@a";
      control.setSelectionRange(2, 2);
      control.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(control.hasAttribute("aria-controls")).toBe(false);
    expect(listbox()).toBeNull();
  });

  it("follows the caret to another trigger with the same query, and a trigger character changed in place", async () => {
    const { control } = await render(
      <Autocomplete triggers={[peopleTrigger, emojiTrigger]}>
        <TextArea label="Message" />
      </Autocomplete>,
    );
    await type(control, "@jo and @jo");
    await expect.poll(labels).toEqual(["Jordan Lee"]);
    // The caret jumps straight to the first trigger, whose query is the same.
    await moveCaret(control, 3);
    await userEvent.keyboard("{Enter}");
    expect(control.value).toBe("@Jordan Lee  and @jo");
    // An edit that swaps the trigger character, caret and query unchanged, reads the new trigger.
    await moveCaret(control, 20);
    await expect.poll(labels).toEqual(["Jordan Lee"]);
    await act(async () => {
      control.setRangeText(":", 17, 18, "preserve");
      control.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect.poll(listbox).toBeNull();
    expect(control.hasAttribute("aria-controls")).toBe(false);
  });

  it("keeps the active suggestion in the list when its items shrink, and closes when its trigger goes", async () => {
    const { control, rerender } = await render(
      <Autocomplete triggers={[{ char: "@", label: "People", items: people }]}>
        <TextArea label="Message" />
      </Autocomplete>,
    );
    await type(control, "@");
    await expect.poll(() => options().length).toBe(4);
    await userEvent.keyboard("{ArrowUp}");
    expect(activeLabel(control)).toBe("Sasha Ortiz");
    await rerender(
      <Autocomplete triggers={[{ char: "@", label: "People", items: people.slice(0, 2) }]}>
        <TextArea label="Message" />
      </Autocomplete>,
    );
    await expect.poll(() => options().length).toBe(2);
    expect(activeLabel(control)).toBe("Jordan Lee");
    await rerender(
      <Autocomplete triggers={[]}>
        <TextArea label="Message" />
      </Autocomplete>,
    );
    await expect.poll(listbox).toBeNull();
  });

  it("tells screen readers how many suggestions there are, when it opens and when the count changes", async () => {
    const { control } = await render(
      <Autocomplete triggers={[peopleTrigger]}>
        <TextArea label="Message" />
      </Autocomplete>,
    );
    await type(control, "@");
    await expect.poll(announcer).toBe("4 suggestions");
    await userEvent.keyboard("jo");
    await expect.poll(announcer).toBe("1 suggestion");
    // Closing says nothing new.
    await userEvent.keyboard("{Escape}");
    await expect.poll(listbox).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(announcer()).toBe("1 suggestion");
  });

  it("speaks the count in the app's words with resultsLabel", async () => {
    const resultsLabel = vi.fn((count: number, trigger: AutocompleteTrigger) => `${count} ${trigger.label.toLowerCase()}`);
    const { control } = await render(
      <Autocomplete triggers={[peopleTrigger]} resultsLabel={resultsLabel}>
        <TextArea label="Message" />
      </Autocomplete>,
    );
    await type(control, "@a");
    await expect.poll(announcer).toBe("4 people");
    expect(resultsLabel).toHaveBeenLastCalledWith(4, peopleTrigger);
  });

  it("keeps the active suggestion in view in a long list", async () => {
    const many = Array.from({ length: 30 }, (_, index) => ({ value: `p${index}`, label: `Person ${index + 1}` }));
    const { control } = await render(
      <Autocomplete triggers={[{ char: "@", label: "People", items: () => many }]}>
        <TextArea label="Message" />
      </Autocomplete>,
    );
    await type(control, "@");
    await expect.poll(() => options().length).toBe(30);
    // A suggestion already in view does not scroll the list.
    await userEvent.keyboard("{ArrowDown}");
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(listbox()!.scrollTop).toBe(0);
    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    const list = listbox()!.getBoundingClientRect();
    await expect.poll(() => options().at(-1)!.getBoundingClientRect().bottom <= list.bottom + 1).toBe(true);
  });

  it("warns when its open list renders outside every landmark of a page that has a main", async () => {
    const main = document.body.appendChild(document.createElement("main"));
    mounted.push(main);
    const { control } = await render(
      <Autocomplete triggers={[peopleTrigger]}>
        <TextArea label="Message" />
      </Autocomplete>,
    );
    await type(control, "@");
    await expect.poll(listbox).not.toBeNull();
    expect(warn.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      "[ouro-ui] Autocomplete: the open popup renders outside every landmark, so screen reader users who move by landmark miss it. Fix: <OuroProvider portalContainer={popups}> around the app, with <div ref={popups} /> inside <main>.",
    ]);
  });

  it("passes the field's own handlers and ref through", async () => {
    const ref = createRef<HTMLTextAreaElement>();
    const onFocus = vi.fn();
    const onBlur = vi.fn();
    const onInput = vi.fn();
    const onSelect = vi.fn();
    const onKeyDown = vi.fn();
    const { control } = await render(
      <Autocomplete triggers={[peopleTrigger]}>
        <textarea aria-label="Message" ref={ref} onFocus={onFocus} onBlur={onBlur} onInput={onInput} onSelect={onSelect} onKeyDown={onKeyDown} />
      </Autocomplete>,
    );
    expect(ref.current).toBe(control);
    await type(control, "a");
    expect(onFocus).toHaveBeenCalled();
    expect(onInput).toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalled();
    expect(onKeyDown).toHaveBeenCalled();
    await act(async () => control.blur());
    expect(onBlur).toHaveBeenCalled();
  });

  it("ignores keys while an input method is composing", async () => {
    const { control } = await render(
      <Autocomplete triggers={[peopleTrigger]}>
        <TextArea label="Message" />
      </Autocomplete>,
    );
    await type(control, "@");
    await expect.poll(() => options().length).toBe(4);
    await act(async () => {
      control.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true, isComposing: true }));
    });
    expect(activeLabel(control)).toBe("Avery Kim");
  });

  it("can be undone with the browser's Undo", async () => {
    const { control } = await render(
      <Autocomplete triggers={[peopleTrigger]}>
        <TextArea label="Message" />
      </Autocomplete>,
    );
    await type(control, "@sa");
    await expect.poll(labels).toEqual(["Sasha Ortiz"]);
    await userEvent.keyboard("{Enter}");
    expect(control.value).toBe("@Sasha Ortiz ");
    await act(async () => {
      document.execCommand("undo");
    });
    // Chromium undoes the insertion alone; WebKit undoes it with the typing before it.
    expect(["@sa", ""]).toContain(control.value);
  });

  it("grows an autoGrow TextArea with the inserted text", async () => {
    const long: AutocompleteItem[] = [{ value: "long", label: "Long", insert: "word ".repeat(40) }];
    const { control } = await render(
      <Autocomplete triggers={[{ char: "@", label: "People", items: () => long }]}>
        <TextArea label="Message" autoGrow rows={1} />
      </Autocomplete>,
    );
    const before = control.getBoundingClientRect().height;
    await type(control, "@");
    await expect.poll(listbox).not.toBeNull();
    await userEvent.keyboard("{Enter}");
    await expect.poll(() => control.getBoundingClientRect().height).toBeGreaterThan(before * 2);
  });
});

describe("Autocomplete text helpers", () => {
  const triggers = [{ char: "@" }, { char: ":", minQueryLength: 2 }, { char: "#", allowSpaces: true }];

  it("finds the nearest trigger before the caret, with its query", () => {
    expect(findMatch("hi @av", 6, triggers)).toEqual({ trigger: 0, start: 3, query: "av" });
    expect(findMatch("@", 1, triggers)).toEqual({ trigger: 0, start: 0, query: "" });
    expect(findMatch("(@x", 3, triggers)).toEqual({ trigger: 0, start: 1, query: "x" });
    expect(findMatch("“@x", 3, triggers)).toEqual({ trigger: 0, start: 1, query: "x" });
    expect(findMatch("a :tad", 6, triggers)).toEqual({ trigger: 1, start: 2, query: "tad" });
    expect(findMatch("#two words", 10, triggers)).toEqual({ trigger: 2, start: 0, query: "two words" });
    // The caret's position decides, not the end of the text.
    expect(findMatch("@ab cd", 3, triggers)).toEqual({ trigger: 0, start: 0, query: "ab" });
  });

  it("finds none inside a word, across a line break or a space, before the shortest query, or after a space at the start", () => {
    expect(findMatch("me@x", 4, triggers)).toBeNull();
    expect(findMatch("@a\nb", 4, triggers)).toBeNull();
    expect(findMatch("@a b", 4, triggers)).toBeNull();
    expect(findMatch(":t", 2, triggers)).toBeNull();
    expect(findMatch("# x", 3, triggers)).toBeNull();
    expect(findMatch("plain", 5, triggers)).toBeNull();
    expect(findMatch("", 0, triggers)).toBeNull();
    // Text after the caret, a trigger or a line break, plays no part.
    expect(findMatch("a @b", 1, triggers)).toBeNull();
    expect(findMatch("@a\nb", 2, triggers)).toEqual({ trigger: 0, start: 0, query: "a" });
    // A line break ends a query even where spaces do not.
    expect(findMatch("#a\nb", 4, triggers)).toBeNull();
  });

  it("finds where a query starts a label or a word of it, ignoring case, for the bold part", () => {
    expect(matchAt("Avery Kim", "av")).toBe(0);
    expect(matchAt("Avery Kim", "AVERY K")).toBe(0);
    expect(matchAt("Avery Kim", "ki")).toBe(6);
    expect(matchAt("Priya Natarajan", "n")).toBe(6);
    expect(matchAt("Avery Kim", "ery")).toBe(-1);
    expect(matchAt("Avery Kim", "kim lee")).toBe(-1);
    expect(matchAt("Avery Kim", "")).toBe(-1);
  });

  it("filters a list by the start of the value, the label or a word of it, ignoring case", () => {
    const list = [
      { value: "design-reviews", label: "Design reviews" },
      { value: "launch", label: "Launch team" },
      { value: "eng", label: "Avery Kim" },
    ];
    expect(filterItems(list, "").map((item) => item.value)).toEqual(["design-reviews", "launch", "eng"]);
    expect(filterItems(list, "REV").map((item) => item.value)).toEqual(["design-reviews"]);
    expect(filterItems(list, "lau").map((item) => item.value)).toEqual(["launch"]);
    expect(filterItems(list, "en").map((item) => item.value)).toEqual(["eng"]);
    expect(filterItems(list, "avery k").map((item) => item.value)).toEqual(["eng"]);
    expect(filterItems(list, "eam").map((item) => item.value)).toEqual([]);
  });

  it("measures the caret on a wrapped line and in a scrolled field", async () => {
    const { control } = await render(<textarea aria-label="Notes" data-test-harness="" rows={2} style={{ width: 120, font: "16px/20px sans-serif", padding: 0, border: 0 }} defaultValue={"one two three four five six seven eight nine ten"} />);
    const textarea = control as HTMLTextAreaElement;
    const first = caretRect(textarea, 0);
    const last = caretRect(textarea, textarea.value.length);
    expect(first.width).toBe(0);
    expect(first.height).toBeGreaterThan(0);
    expect(last.top).toBeGreaterThan(first.top + 19);
    textarea.scrollTop = 20;
    expect(caretRect(textarea, 0).top).toBeCloseTo(first.top - textarea.scrollTop, 0);
    expect(document.body.lastElementChild).not.toHaveProperty("style.left", "-9999px");
  });

  const field = { font: "16px/20px sans-serif", padding: 0, border: 0 } as const;

  it("measures from the control's own box, one line tall, past its line breaks and a long word", async () => {
    const { control } = await render(<textarea aria-label="Notes" data-test-harness="" rows={4} style={{ ...field, width: 120 }} defaultValue={"one\ntwo\n"} />);
    const textarea = control as HTMLTextAreaElement;
    const box = textarea.getBoundingClientRect();
    const first = caretRect(textarea, 0);
    // An inline marker's box sits a pixel or two inside its 20px line.
    expect(Math.abs(first.top - box.top)).toBeLessThan(3);
    expect(first.left).toBeCloseTo(box.left, 0);
    expect(first.height).toBeLessThan(30);
    expect(caretRect(textarea, 2).left).toBeGreaterThan(box.left + 10);
    // After a line break, and at the very end after one, the caret is a line further down.
    expect(caretRect(textarea, 4).top).toBeCloseTo(first.top + 20, 0);
    expect(caretRect(textarea, 8).top).toBeCloseTo(first.top + 40, 0);
    // A word longer than the line breaks onto the next.
    textarea.value = "x".repeat(40);
    expect(caretRect(textarea, 39).top).toBeGreaterThan(first.top + 19);
  });

  it("puts the caret where a wrapping word goes, and keeps an input's text on one line", async () => {
    const { control } = await render(<textarea aria-label="Notes" data-test-harness="" rows={3} style={{ ...field, width: 160 }} defaultValue="" />);
    const textarea = control as HTMLTextAreaElement;
    const top = caretRect(textarea, 0).top;
    // "@" fits on the first line, but the name after it does not, so the name wraps and takes it along.
    textarea.value = "Ask " + "m".repeat(6) + " @Averykimberlyson";
    const at = textarea.value.indexOf("@");
    expect(caretRect(textarea, at).top).toBeCloseTo(top + 20, 0);
    expect(caretRect(textarea, at).left).toBeCloseTo(textarea.getBoundingClientRect().left, 0);
    const input = (await render(<input aria-label="Name" data-test-harness="" style={{ ...field, width: 80 }} defaultValue={"one two three four five six seven"} />)).control as HTMLInputElement;
    const start = caretRect(input, 0);
    const end = caretRect(input, input.value.length);
    expect(end.top).toBeCloseTo(start.top, 0);
    expect(end.left).toBeGreaterThan(start.left + 80);
    input.scrollLeft = 50;
    expect(input.scrollLeft).toBe(50);
    expect(caretRect(input, input.value.length).left).toBeCloseTo(end.left - 50, 0);
  });
});

describe("Autocomplete development messages", () => {
  const messages = () => warn.mock.calls.map((call: unknown[]) => String(call[0]));

  it.each<[string, Record<string, unknown>, string]>([
    ["no triggers", { triggers: [] }, '[ouro-ui] Autocomplete: triggers is empty, so nothing opens suggestions. Fix: <Autocomplete triggers={[{ char: "@", label: "People", items }]}>.'],
    [
      "a trigger of two characters",
      { triggers: [{ char: "::", label: "People", items: () => [] }] },
      '[ouro-ui] Autocomplete: char "::" is not one character. Fix: { char: ":", label: "People", items }.',
    ],
    [
      "an empty char",
      { triggers: [{ char: "", label: "People", items: () => [] }] },
      '[ouro-ui] Autocomplete: char "" is not one character. Fix: { char: "@", label: "People", items }.',
    ],
    [
      "two triggers on one character",
      { triggers: [peopleTrigger, { ...emojiTrigger, char: "@" }] },
      '[ouro-ui] Autocomplete: two triggers use "@". Fix: give each trigger its own char.',
    ],
    [
      "a trigger with no label",
      { triggers: [{ char: "#", label: "", items: () => [] }] },
      "[ouro-ui] Autocomplete: the \"#\" trigger's label is empty, so its list has no name. Fix: { char: \"#\", label: \"People\", items }.",
    ],
    ["trigger", { trigger: "@" }, '[ouro-ui] Autocomplete: trigger is not a prop; Autocomplete takes a list. Fix: <Autocomplete triggers={[{ char: "@", label: "People", items }]}>.'],
    ["suggestions", { suggestions: [] }, '[ouro-ui] Autocomplete: suggestions is not a prop; a trigger\'s items holds them. Fix: { char: "@", label: "People", items: (query) => […] }.'],
    ["onSelect", { onSelect: () => {} }, '[ouro-ui] Autocomplete: onSelect is not a prop; a trigger takes onPick. Fix: { char: "@", label: "People", items, onPick: (item) => … }.'],
  ])("names the fix for %s", async (_case, extra, message) => {
    await render(<Autocomplete {...({ triggers: [peopleTrigger], children: <TextArea label="Message" />, ...extra } as AutocompleteProps)} />);
    expect(messages()).toContain(message);
  });

  it("throws with the fix when children is not one element", () => {
    expect(() => renderToString(<Autocomplete triggers={[peopleTrigger]}>{"Message" as never}</Autocomplete>)).toThrow(
      '[ouro-ui] Autocomplete: children is not one element, so there is no text control to watch. Fix: <Autocomplete triggers={…}><TextArea label="Message" /></Autocomplete>.',
    );
  });

  it("is quiet for a valid autocomplete", async () => {
    const { control } = await render(
      <Autocomplete triggers={[peopleTrigger, emojiTrigger]}>
        <TextArea label="Message" />
      </Autocomplete>,
    );
    await type(control, "@a");
    await expect.poll(listbox).not.toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("Autocomplete server rendering", () => {
  it("renders the field with the list's ARIA on the server and hydrates with no warning", async () => {
    const error = vi.spyOn(console, "error");
    const node = (
      <Autocomplete triggers={[peopleTrigger]}>
        <TextArea label="Message" />
      </Autocomplete>
    );
    const html = renderToString(node);
    expect(html).toContain('aria-autocomplete="list"');
    expect(html).not.toContain("aria-haspopup");
    expect(html).not.toContain('role="listbox"');
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.append(host);
    mounted.push(host);
    const recoverable = vi.fn();
    let root!: Root;
    await act(async () => {
      root = hydrateRoot(host, node, { onRecoverableError: recoverable });
    });
    roots.push(root);
    expect(recoverable).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
