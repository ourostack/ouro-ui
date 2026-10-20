import { type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalDate, type LocalDateProps } from "@/registry/ouro/components/ouro/local-date/local-date";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
let mounted: Element[] = [];
const instant = new Date(Date.UTC(2026, 5, 1, 23, 30));

async function render(node: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return { host, root, time: host.querySelector<HTMLTimeElement>('[data-ouro="local-date"]')! };
}

const local = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", options).format(instant);

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

describe("LocalDate", () => {
  it.each([
    ["date", { dateStyle: "medium" }],
    ["month", { month: "short", year: "numeric" }],
    ["datetime", { dateStyle: "medium", timeStyle: "short" }],
    ["time", { timeStyle: "short" }],
  ] as const)("writes the %s in the reader's time zone, in a <time> with the exact instant", async (format, options) => {
    const { time } = await render(<LocalDate value={instant} format={format} locale="en-US" />);
    expect(time.tagName).toBe("TIME");
    expect(time.dateTime).toBe("2026-06-01T23:30:00.000Z");
    expect(time.textContent).toBe(local(options));
  });

  it("shows the date by default, in the reader's language", async () => {
    const { time } = await render(<LocalDate value={instant} />);
    expect(time.textContent).toBe(new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(instant));
  });

  it.each([
    ["an ISO string", "2026-06-01T23:30:00Z"],
    ["a timestamp", instant.getTime()],
  ])("takes %s", async (_name, value) => {
    const { time } = await render(<LocalDate value={value} locale="en-US" />);
    expect(time.dateTime).toBe(instant.toISOString());
    expect(time.textContent).toBe(local({ dateStyle: "medium" }));
  });

  it("writes the UTC date on the server, hydrates without a mismatch, then shows the local date", async () => {
    const node = <LocalDate value={instant} format="datetime" locale="en-US" />;
    const html = renderToString(node);
    const utc = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(instant);
    expect(html).toContain(`>${utc}</time>`);
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.append(host);
    mounted.push(host);
    const onRecoverableError = vi.fn();
    await act(async () => void roots.push(hydrateRoot(host, node, { onRecoverableError })));
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(host.querySelector("time")!.textContent).toBe(local({ dateStyle: "medium", timeStyle: "short" }));
  });

  it("forwards a ref and <time> attributes, and lets app layout classes win", async () => {
    let element: HTMLTimeElement | null = null;
    const { time } = await render(<LocalDate value={instant} id="due" className="ms-2" ref={(node) => void (element = node)} />);
    expect(element).toBe(time);
    expect(time.id).toBe("due");
    expect(getComputedStyle(time).marginInlineStart).toBe("8px");
  });
});

describe("LocalDate development messages", () => {
  it.each([
    ["format", { format: "long" }, 'format="long" is not a format; use "date", "month", "datetime" or "time"', '<LocalDate format="datetime" />'],
    ["value", { value: "soon" }, 'value={"soon"} is not a date', "<LocalDate value={new Date()} />"],
    ["date", { date: instant }, "date is not a prop", "<LocalDate value={date} />"],
    ["dateTime", { dateTime: "2026-06-01" }, "dateTime is not a prop; it is set from value", "<LocalDate value={date} />"],
    ["children", { children: "June 1" }, "LocalDate writes the date itself", "<LocalDate value={date} />"],
  ])("explains %s with the fix", async (_name, extra, problem, fix) => {
    const props = { value: instant, ...extra } as unknown as LocalDateProps;
    const { time } = await render(<LocalDate {...props} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] LocalDate: ${problem}. Fix: ${fix}.`);
    expect(time.hasAttribute("date")).toBe(false);
  });

  it("writes the date for an unknown format, and nothing for a value that is not a date", async () => {
    const { time } = await render(<LocalDate {...({ value: instant, format: "long", locale: "en-US" } as unknown as LocalDateProps)} />);
    expect(time.textContent).toBe(local({ dateStyle: "medium" }));
    const { time: empty } = await render(<LocalDate value="soon" />);
    expect(empty.textContent).toBe("");
    expect(empty.hasAttribute("datetime")).toBe(false);
  });

  it.each([
    ["font-bold", 'remove "font-bold"; style the text around it instead'],
    ["ms-1", ""],
  ])("checks the className %s", async (className, fix) => {
    await render(<LocalDate value={instant} className={className} />);
    if (fix) expect(warn).toHaveBeenCalledWith(`[ouro-ui] LocalDate: "${className}" sets appearance, and className is for layout only. Fix: ${fix}.`);
    else expect(warn).not.toHaveBeenCalled();
  });
});
