import { type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RelativeTime, type RelativeTimeProps } from "@/registry/ouro/components/ouro/relative-time/relative-time";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
let mounted: Element[] = [];
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const DAY = 24 * 60 * MINUTE;

async function render(node: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return { host, root, time: host.querySelector<HTMLTimeElement>('[data-ouro="relative-time"]')! };
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
});

describe("RelativeTime", () => {
  it.each([
    [-3 * DAY, "auto", "3 days ago"],
    [-1 * DAY, "auto", "yesterday"],
    [-1 * DAY, "always", "1 day ago"],
    [5 * MINUTE + 10 * SECOND, "auto", "in 5 minutes"],
    [-10 * SECOND, "auto", "now"],
    [-50 * SECOND, "auto", "50 seconds ago"],
    [-2 * 3600 * SECOND, "auto", "2 hours ago"],
    [-14 * DAY, "auto", "2 weeks ago"],
    [-62 * DAY, "auto", "2 months ago"],
    [-800 * DAY, "auto", "2 years ago"],
  ] as const)("says %ims from now as %s: %s", async (offset, numeric, words) => {
    const { time } = await render(<RelativeTime value={Date.now() + offset} numeric={numeric} locale="en-US" />);
    expect(time.textContent).toBe(words);
  });

  it("is a <time> with the exact instant, titled with the full local date and time", async () => {
    const value = new Date(Date.now() - 3 * DAY);
    const { time } = await render(<RelativeTime value={value.toISOString()} locale="en-US" />);
    expect(time.tagName).toBe("TIME");
    expect(time.dateTime).toBe(value.toISOString());
    expect(time.title).toBe(new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(value));
  });

  it("keeps a title of the app's own", async () => {
    const { time } = await render(<RelativeTime value={Date.now()} title="Posted" />);
    expect(time.title).toBe("Posted");
  });

  it("keeps itself current on one shared clock, and stops the clock when none shows", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    vi.setSystemTime(new Date(Date.UTC(2026, 5, 1, 12)));
    const every = vi.spyOn(globalThis, "setInterval");
    const stop = vi.spyOn(globalThis, "clearInterval");
    const value = Date.now() - 20 * SECOND;
    const { host, root } = await render(
      <>
        <RelativeTime value={value} locale="en-US" />
        <RelativeTime value={value} numeric="always" locale="en-US" />
      </>,
    );
    const [auto, always] = host.querySelectorAll("time");
    expect(auto!.textContent).toBe("now");
    expect(always!.textContent).toBe("in 0 seconds");
    expect(every).toHaveBeenCalledOnce();
    await act(async () => vi.advanceTimersByTime(30 * SECOND));
    expect(auto!.textContent).toBe("50 seconds ago");
    await act(async () => vi.advanceTimersByTime(30 * SECOND));
    expect(always!.textContent).toBe("1 minute ago");
    await act(async () => root.unmount());
    expect(stop).toHaveBeenCalledOnce();
  });

  it("writes the UTC date on the server, hydrates without a mismatch, then says how long ago", async () => {
    const value = new Date(Date.now() - 2 * DAY);
    const node = <RelativeTime value={value} locale="en-US" />;
    const html = renderToString(node);
    expect(html).toContain(`>${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(value)}</time>`);
    expect(html).not.toContain("title=");
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.append(host);
    mounted.push(host);
    const onRecoverableError = vi.fn();
    await act(async () => void roots.push(hydrateRoot(host, node, { onRecoverableError })));
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(host.querySelector("time")!.textContent).toBe("2 days ago");
  });

  it("forwards a ref and <time> attributes, and lets app layout classes win", async () => {
    let element: HTMLTimeElement | null = null;
    const { time } = await render(<RelativeTime value={Date.now()} id="posted" className="ms-2" ref={(node) => void (element = node)} />);
    expect(element).toBe(time);
    expect(time.id).toBe("posted");
    expect(getComputedStyle(time).marginInlineStart).toBe("8px");
  });
});

describe("RelativeTime development messages", () => {
  it.each([
    ["numeric", { numeric: "never" }, 'numeric="never" is not an option; use "auto" or "always"', '<RelativeTime numeric="always" />'],
    ["value", { value: "soon" }, 'value={"soon"} is not a date', "<RelativeTime value={new Date()} />"],
    ["date", { date: new Date() }, "date is not a prop", "<RelativeTime value={date} />"],
    ["now", { now: Date.now() }, "now is not a prop; RelativeTime keeps itself current", "<RelativeTime value={date} />"],
  ])("explains %s with the fix", async (_name, extra, problem, fix) => {
    const props = { value: Date.now(), ...extra } as unknown as RelativeTimeProps;
    const { time } = await render(<RelativeTime {...props} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] RelativeTime: ${problem}. Fix: ${fix}.`);
    expect(time.hasAttribute("now")).toBe(false);
  });

  it("says nothing for a value that is not a date", async () => {
    const { time } = await render(<RelativeTime value="soon" />);
    expect(time.textContent).toBe("");
    expect(time.hasAttribute("datetime")).toBe(false);
    expect(time.hasAttribute("title")).toBe(false);
  });

  it.each([
    ["text-muted-foreground", 'remove "text-muted-foreground"; style the text around it instead'],
    ["ms-1", ""],
  ])("checks the className %s", async (className, fix) => {
    await render(<RelativeTime value={Date.now()} className={className} />);
    if (fix) expect(warn).toHaveBeenCalledWith(`[ouro-ui] RelativeTime: "${className}" sets appearance, and className is for layout only. Fix: ${fix}.`);
    else expect(warn).not.toHaveBeenCalled();
  });
});
