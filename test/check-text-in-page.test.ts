import { afterEach, describe, expect, it } from "vitest";
import { findTextIssues } from "@/registry/ouro/check/text-check";

// Ouro check's text rules, leaked-value and odd-timestamp, in a real browser: for each kind a page that fails and the
// near misses that pass, and the opt-outs. scripts/check/check.test.mts runs the whole check on their fixture pages.

const state = window as unknown as { __ouroCheckRef?: number };
let host: HTMLDivElement;

afterEach(() => {
  host?.remove();
  delete state.__ouroCheckRef;
});

function render(html: string): HTMLDivElement {
  host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  return host;
}

const of = (rule: string) => findTextIssues().filter((issue) => issue.rule === rule);
// Each line in a paragraph of its own; the details the rule gives, in order.
const details = (rule: string, lines: string[]) => {
  render(lines.map((line) => `<p>${line}</p>`).join(""));
  return of(rule).map((issue) => issue.detail);
};

describe("findTextIssues: leaked-value", () => {
  it("finds each kind of value the program meant for itself, quoting what it shows", () => {
    expect(
      details("leaked-value", [
        "Owner: [object Object]",
        "Hello {{firstName}}",
        "Total ${total}",
        "Chat 3f2504e0-4f89-11d3-9a0c-0305e82c3301",
        "Message 5f8d0d55b54764421b7156c3 failed",
        "settings.profile.saveButton",
        "chat:list.empty_state.title",
        "Lorem ipsum dolor sit amet",
        "TODO wire this up",
        "FIXME",
        "console.log(here)",
        "3 of NaN done",
      ]),
    ).toEqual([
      `shows an object's default string: "[object Object]"`,
      `shows an unfilled template: "{{firstName}}"`,
      `shows an unfilled template: "\${total}"`,
      `shows a GUID: "3f2504e0-4f89-11d3-9a0c-0305e82c3301"`,
      `shows an id: "5f8d0d55b54764421b7156c3"`,
      `shows a translation key: "settings.profile.saveButton"`,
      `shows a translation key: "chat:list.empty_state.title"`,
      `shows lorem ipsum: "Lorem ipsum"`,
      `shows a TODO: "TODO"`,
      `shows a TODO: "FIXME"`,
      `shows debug output: "console.log"`,
      `shows NaN: "NaN"`,
    ]);
  });

  it("finds undefined and null where a value goes: alone, after a label, twice, after a greeting, beside a number", () => {
    expect(
      details("leaked-value", ["undefined", "(null)", "Owner: null", "size=undefined", "undefined undefined", "Hello, undefined!", "Due $null", "undefined%", "3 null", "null 4", "#undefined"]),
    ).toEqual([
      `shows undefined: "undefined"`,
      `shows null: "null"`,
      `shows null: "null"`,
      `shows undefined: "undefined"`,
      `shows undefined: "undefined undefined"`,
      `shows undefined: "undefined"`,
      `shows null: "$null"`,
      `shows undefined: "undefined"`,
      `shows null: "3 null"`,
      `shows null: "null 4"`,
      `shows undefined: "#undefined"`,
    ]);
  });

  it("names the element by its words and says when the value is in a title or an aria-label", () => {
    render(`
      <button id="save" class="a b c d" aria-label="settings.profile.saveButton">Save</button>
      <span title="Owner: undefined">Owner</span>
      <p class="long">The report for this week came back as [object Object] and nothing else at all</p>
      <button aria-label="chat.compose.sendButton"></button>
      <span title="Seen: null"></span>`);
    const issues = of("leaked-value");
    expect(issues.map(({ element, detail }) => [element, detail])).toEqual([
      ['p.long "The report for this week came back as [o…"', `shows an object's default string: "[object Object]"`],
      ['button#save.a.b.c "Save"', `shows a translation key in its aria-label: "settings.profile.saveButton"`],
      ['span "Owner"', `shows undefined in its title: "undefined"`],
      ['button "chat.compose.sendButton"', `shows a translation key in its aria-label: "chat.compose.sendButton"`],
      ['span "Seen: null"', `shows null in its title: "null"`],
    ]);
    expect(issues.map((issue) => issue.ref)).toEqual(["t1", "t2", "t3", "t4", "t5"]);
    expect(host.querySelector("#save")!.getAttribute("data-ouro-check-ref")).toBe("t2");
  });

  it("finds each element once a rule, and adds its mark to one already there", () => {
    state.__ouroCheckRef = 7;
    render(`<p data-ouro-check-ref="d1" title="NaN">undefined<br>null</p>`);
    expect(of("leaked-value").map(({ ref, detail }) => [ref, detail])).toEqual([["t8", `shows undefined: "undefined"`]]);
    expect(host.querySelector("p")!.getAttribute("data-ouro-check-ref")).toBe("d1 t8");
  });

  it("passes words in a sentence, names, versions, domains and file names, code, hidden text and allowed elements, and an allow needs its reason", () => {
    render(`
      <p>The lookup returns null when nothing matches, and undefined is left unset.</p>
      <p>Null and void. A nullable field.</p>
      <p>Read docs.example.com and github.io, version v1.3.10, file notes.final.md and Report.Q3.Final.docx, e.g. this.</p>
      <p>Its short hash is 3f2504e and its order is 4815162342.</p>
      <p>{ name } and $5 and 50%</p>
      <p>Bring the slides todo list</p>
      <p><code>format(undefined)</code> <kbd>{{x}}</kbd> <samp>NaN</samp> <var>null</var></p>
      <pre>[object Object]</pre>
      <textarea>TODO</textarea>
      <div contenteditable="true">Hello, undefined</div>
      <div contenteditable="false"><span>A label</span></div>
      <p style="display:none">undefined</p>
      <p style="visibility:hidden">undefined</p>
      <p data-ouro-allow="leaked-value" data-ouro-allow-why="a message in the sender's own words">Bring <b>TODO</b> slides</p>
      <p data-ouro-allow="all" data-ouro-allow-why="a page about JavaScript">NaN</p>
      <p data-ouro-allow="leaked-value" data-ouro-allow-why=" ">FIXME</p>
      <p data-ouro-allow="leaked-value">NaN</p>
      <span title="">Untitled</span>
      <p>   </p>`);
    expect(of("leaked-value").map((issue) => issue.detail)).toEqual([`shows a TODO: "FIXME"`, `shows NaN: "NaN"`]);
  });
});

describe("findTextIssues: odd-timestamp", () => {
  it("finds each kind of time no person should read, quoting what it shows", () => {
    expect(
      details("odd-timestamp", [
        "Sent Invalid Date",
        "Joined 1 January 1970",
        "Jan 1, 1970",
        "31 Dec 1969",
        "December 31 1969",
        "1970-01-01",
        "12/31/1969",
        "31/12/1969",
        "1/1/1970",
        "Due 9999-12-31",
        "Since 0001-01-01",
        "Born 1/1/0001",
        "Ends Dec 31, 9999",
        "Updated 1731186000",
        "Updated 1731186000000",
        "Edited 2026-11-09T13:17:00.000Z",
        "Mon Nov 09 2026 13:17:00 GMT-0800 (Pacific Standard Time)",
        "Seen -3 minutes ago",
        "Seen −2h ago",
        "Due in -2 days",
      ]),
    ).toEqual([
      `shows an invalid date: "Invalid Date"`,
      `shows the Unix epoch: "1 January 1970"`,
      `shows the Unix epoch: "Jan 1, 1970"`,
      `shows the Unix epoch: "31 Dec 1969"`,
      `shows the Unix epoch: "December 31 1969"`,
      `shows the Unix epoch: "1970-01-01"`,
      `shows the Unix epoch: "12/31/1969"`,
      `shows the Unix epoch: "31/12/1969"`,
      `shows the Unix epoch: "1/1/1970"`,
      `shows a year no one lives in: "9999-12-31"`,
      `shows a year no one lives in: "0001-01-01"`,
      `shows a year no one lives in: "1/1/0001"`,
      `shows a year no one lives in: "Dec 31, 9999"`,
      `shows a raw epoch number: "1731186000"`,
      `shows a raw epoch number: "1731186000000"`,
      `shows a machine timestamp: "2026-11-09T13:17"`,
      `shows Date's own string: "GMT-0800 (Pacific Standard Time)"`,
      `shows a negative age: "-3 minutes ago"`,
      `shows a negative age: "−2h ago"`,
      `shows a negative age: "in -2"`,
    ]);
  });

  it("finds a leaked value and an odd time in the same element, once each", () => {
    render(`<p>undefined Invalid Date</p>`);
    expect(findTextIssues().map((issue) => issue.rule)).toEqual(["odd-timestamp"]);
    host.remove();
    render(`<p title="Invalid Date">NaN</p>`);
    expect(findTextIssues().map(({ rule, detail }) => [rule, detail])).toEqual([
      ["leaked-value", `shows NaN: "NaN"`],
      ["odd-timestamp", `shows an invalid date in its title: "Invalid Date"`],
    ]);
  });

  it("passes times for people, numbers that aren't times, dates far from the epoch, code and allowed elements", () => {
    render(`
      <p>Sent 9 November 2026 at 1:17 PM, 2026-11-09, 11/9/2026</p>
      <p>Seen 3 minutes ago, due in 2 days, -3 °C, page 3-5</p>
      <p>Call 1-800-555-0100, quote order 4815162342, or ref 1731186000.5 and 17311860001234</p>
      <p>Since 1970, in 2000, the year 9999 BC</p>
      <p><code>2026-11-09T13:17:00Z</code></p>
      <p data-ouro-allow="odd-timestamp" data-ouro-allow-why="a page about the Unix epoch">Unix time starts at 1 January 1970.</p>`);
    expect(of("odd-timestamp")).toEqual([]);
  });
});
