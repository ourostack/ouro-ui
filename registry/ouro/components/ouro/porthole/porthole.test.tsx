import { Profiler, type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, userEvent } from "vitest/browser";
import { bindAx, expectAxRendered } from "@/registry/ouro/ax/component";
import { Porthole, type PortholeFixed, type PortholeProps } from "@/registry/ouro/components/ouro/porthole/porthole";
import { PORTHOLE_ANNOUNCE_GAP_MS, portholeAx } from "@/registry/ouro/components/ouro/porthole/porthole-styles";
import type { PortholeArea, PortholeItem, PortholeSnapshot, PortholeSource } from "@/registry/ouro/lib/ouro/porthole-view";
import { announce } from "@/registry/ouro/lib/ouro/announce";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { watchAnnouncements } from "@/registry/ouro/lib/ouro/testing/announcements";
import { expectMotion, parseDuration } from "@/registry/ouro/lib/ouro/testing/motion";

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const START = Date.UTC(2026, 10, 3, 18, 40);

const roots: Root[] = [];
let mounted: Element[] = [];
let commits = 0;

async function render(node: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  const counted = (child: ReactNode) => (
    <Profiler id="porthole" onRender={() => void commits++}>
      {child}
    </Profiler>
  );
  await act(async () => root.render(counted(node)));
  commits = 0;
  return {
    host,
    root,
    rerender: (next: ReactNode) => act(async () => root.render(counted(next))),
    get porthole() {
      return host.querySelector<HTMLElement>('[data-ouro="porthole"]')!;
    },
    get state() {
      return host.querySelector<HTMLElement>('[data-ouro="porthole"]')!.getAttribute("data-porthole-state");
    },
    get spot() {
      return host.querySelector<HTMLButtonElement>('[data-ouro-part="spot"]')!;
    },
    /** The words the spot says now, without the old words fading out. */
    get line() {
      return host.querySelector<HTMLElement>('[data-ouro-part="spot"] span.block')!.textContent;
    },
    get panel() {
      return host.querySelector<HTMLElement>('[data-ouro-part="panel"]');
    },
    get act() {
      return host.querySelector<HTMLButtonElement>('[data-ouro-part="act"]');
    },
    get dismiss() {
      return host.querySelector<HTMLButtonElement>('[data-ouro-part="dismiss"]');
    },
  };
}

const area = (lastVerifiedAt: number | null, troubleSince: number | null = null, label?: string): PortholeArea => ({
  lastVerifiedAt,
  troubleSince,
  ...(label === undefined ? {} : { label }),
});
const item = (id: string, priority: PortholeItem["priority"], extra: Partial<PortholeItem> = {}): PortholeItem => ({ id, priority, label: `${id} label`, since: Date.now(), ...extra });
const snapshot = (items: PortholeItem[] = [], areas: Record<string, PortholeArea> = { chats: area(Date.now()) }): PortholeSnapshot => ({ version: 1, items, areas });
const fixed = (items: PortholeItem[] = [], areas?: Record<string, PortholeArea>, lastBeatAt = Date.now()): PortholeFixed => ({ snapshot: snapshot(items, areas), lastBeatAt });

/** A service's mirror the test drives: new snapshots, and beats that only move `lastBeatAt`. */
function service(initial: PortholeSnapshot = snapshot()) {
  let current = initial;
  let beat = Date.now();
  const listeners = new Set<() => void>();
  const source: PortholeSource = {
    getSnapshot: () => current,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    lastBeatAt: () => beat,
  };
  return {
    source,
    listeners,
    send: (next: PortholeSnapshot) =>
      act(() => {
        current = next;
        for (const listener of listeners) listener();
      }),
    beat: () => {
      beat = Date.now();
    },
  };
}

const base = (source: PortholeProps["source"], props: Partial<PortholeProps> = {}) => <Porthole label="Status" source={source} {...props} />;

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.useRealTimers();
  // The mouse leaves where the next test's spot renders, or it would open it.
  const away = document.createElement("div");
  away.style.cssText = "position: fixed; right: 0; bottom: 0; width: 8px; height: 8px";
  document.body.append(away);
  await userEvent.hover(away);
  away.remove();
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
  await commands.emulateMedia({ reducedMotion: "no-preference" });
});

describe("Porthole", () => {
  it("shows the most urgent item, and the rest line when there is none", async () => {
    const view = await render(base(fixed([item("sync", "working"), item("offline", "error"), item("current", "rest")])));
    expect(view.porthole.getAttribute("role")).toBe("group");
    expect(view.porthole.getAttribute("aria-label")).toBe("Status");
    expect(view.state).toBe("error");
    expect(view.line).toBe("offline label");
    await view.rerender(base(fixed([item("sync", "working")])));
    expect(view.state).toBe("working");
    await view.rerender(base(fixed()));
    expect(view.state).toBe("rest-fresh");
    expect(view.line).toBe("Updated just now");
    await view.rerender(base(fixed([], { chats: area(Date.now() - 4 * MINUTE) })));
    expect(view.state).toBe("rest-stale");
    expect(view.line).toBe("Updated 4 min ago");
    await view.rerender(base(fixed([], undefined, Date.now() - MINUTE)));
    expect(view.state).toBe("unknown");
    expect(view.line).toBe("Status unknown");
    await view.rerender(base(fixed([item("update", "action")])));
    expect(view.state).toBe("action");
  });

  it("shows a working item's progress as a ring, and turns while the amount is unknown", async () => {
    const view = await render(base(fixed([item("sync", "working", { progress: 0.4 })])));
    const ring = view.host.querySelector('[data-porthole-part="progress"]')!;
    expect(ring.querySelectorAll("circle")[1]!.getAttribute("stroke-dasharray")).toBe("40 100");
    await view.rerender(base(fixed([item("sync", "working", { progress: 3 })])));
    expect(view.host.querySelectorAll('[data-porthole-part="progress"] circle')[1]!.getAttribute("stroke-dasharray")).toBe("100 100");
    await view.rerender(base(fixed([item("sync", "working", { progress: -1 })])));
    expect(view.host.querySelectorAll('[data-porthole-part="progress"] circle')[1]!.getAttribute("stroke-dasharray")).toBe("0 100");
    await view.rerender(base(fixed([item("sync", "working")])));
    const spinner = view.host.querySelector('[data-porthole-part="progress"]')!;
    expect(spinner.querySelector("circle")).toBeNull();
    expect(spinner.getAttribute("class")).toContain("motion-safe:animate-[ouro-spin_1s_linear_infinite]");
    await view.rerender(base(fixed()));
    expect(view.host.querySelector('[data-porthole-part="progress"]')).toBeNull();
    expect(view.host.querySelector('[data-porthole-part="light"]')).not.toBeNull();
  });

  it("opens on a press into the detail lines, closes on a second press or Escape, and keeps focus on the spot", async () => {
    const onKeyDown = vi.fn();
    const view = await render(base(fixed([], { chats: area(Date.now(), null, "Chats"), calendar: area(Date.now() - 4 * MINUTE, null, "Calendar") }), { onKeyDown }));
    expect(view.spot.getAttribute("aria-expanded")).toBe("false");
    expect(view.spot.hasAttribute("aria-controls")).toBe(false);
    expect(view.panel).toBeNull();
    await userEvent.click(view.spot);
    expect(view.spot.getAttribute("aria-expanded")).toBe("true");
    expect(view.spot.getAttribute("aria-controls")).toBe(view.panel!.id);
    expect([...view.panel!.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["Chats: verified just now", "Calendar: verified 4 min ago"]);
    expect(document.activeElement).toBe(view.spot);
    await userEvent.click(view.spot);
    expect(view.panel).toBeNull();
    await userEvent.click(view.spot);
    await userEvent.keyboard("{Escape}");
    expect(view.panel).toBeNull();
    expect(document.activeElement).toBe(view.spot);
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    await userEvent.keyboard("{Escape}");
    expect(onKeyDown).toHaveBeenCalledTimes(2);
    expect(view.panel).toBeNull();
    await userEvent.keyboard("{Enter}");
    expect(view.panel).not.toBeNull();
  });

  it("leaves Escape to the app when the app handled it", async () => {
    const view = await render(base(fixed(), { defaultOpen: true, onKeyDown: (event) => event.preventDefault() }));
    view.spot.focus();
    await userEvent.keyboard("{Escape}");
    expect(view.panel).not.toBeNull();
  });

  it("opens while a mouse is over it and closes as it leaves, and a touch does not open it", async () => {
    const onPointerEnter = vi.fn();
    const onPointerLeave = vi.fn();
    const view = await render(base(fixed(), { onPointerEnter, onPointerLeave }));
    await userEvent.hover(view.spot);
    await expect.poll(() => view.panel).not.toBeNull();
    expect(document.activeElement).not.toBe(view.spot);
    await userEvent.unhover(view.spot);
    await expect.poll(() => view.panel).toBeNull();
    expect(onPointerEnter).toHaveBeenCalled();
    expect(onPointerLeave).toHaveBeenCalled();
    await act(() => view.porthole.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "touch" })));
    expect(view.panel).toBeNull();
    // A mouse is over the spot when it presses, so the press pins it open past the mouse leaving, and a second closes it.
    await userEvent.hover(view.spot);
    await expect.poll(() => view.spot.getAttribute("aria-expanded")).toBe("true");
    expect(view.spot.getAttribute("data-ax-action")).toBe("expand");
    await userEvent.click(view.spot);
    expect(view.panel).not.toBeNull();
    expect(view.spot.getAttribute("data-ax-action")).toBe("collapse");
    await userEvent.unhover(view.spot);
    await act(async () => {});
    expect(view.panel).not.toBeNull();
    await userEvent.click(view.spot);
    expect(view.panel).toBeNull();
    expect(view.spot.getAttribute("aria-expanded")).toBe("false");
  });

  it("puts pinned lines away at a press anywhere else, and keeps them at a press inside", async () => {
    const outside = document.createElement("button");
    outside.textContent = "Elsewhere";
    document.body.append(outside);
    mounted.push(outside);
    const view = await render(base(fixed([item("update", "action", { action: { id: "restart", label: "Restart" } })]), { onAction: () => {} }));
    await act(() => view.spot.click());
    await act(() => view.act!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
    expect(view.panel).not.toBeNull();
    await act(() => outside.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
    expect(view.panel).toBeNull();
    expect(view.spot.getAttribute("aria-expanded")).toBe("false");
  });

  it("starts open with defaultOpen", async () => {
    const view = await render(base(fixed(), { defaultOpen: true }));
    expect(view.panel).not.toBeNull();
    expect(view.spot.getAttribute("aria-expanded")).toBe("true");
    expect(view.porthole.getAttribute("data-open")).toBe("");
  });

  it("fades the detail lines in and lowers them a little as it opens, and with reduced motion only fades them", async () => {
    const view = await render(base(fixed()));
    const token = (name: string) => parseDuration(getComputedStyle(document.documentElement).getPropertyValue(name));
    for (const reduced of [false, true]) {
      await commands.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
      // A loaded WebKit can take the setting a moment after the command returns; open only once the page has it.
      await expect.poll(() => matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(reduced);
      expect(view.porthole.hasAttribute("data-open")).toBe(false);
      await act(() => view.spot.click());
      const opacity = token(reduced ? "--ouro-duration-fast" : "--ouro-duration-base");
      await expectMotion(view.panel!, { stem: "porthole", state: "data-open", properties: reduced ? { opacity } : { opacity, translate: opacity }, reduced });
      await act(() => view.spot.click());
      expect(view.panel).toBeNull();
    }
  });

  it("presses the item's action and dismisses news through the app, and never changes an item itself", async () => {
    const onAction = vi.fn();
    const onDismiss = vi.fn();
    const update = item("update", "action", { label: "Version 2.4 is ready", action: { id: "restart", label: "Restart" } });
    const view = await render(base(fixed([update]), { onAction, onDismiss }));
    expect(view.act!.textContent).toBe("Restart");
    await userEvent.click(view.act!);
    expect(onAction).toHaveBeenCalledWith(update, "restart");
    expect(view.line).toBe("Version 2.4 is ready");
    expect(view.dismiss).toBeNull();
    const current = item("current", "rest", { label: "Up to date", dismissable: true });
    await view.rerender(base(fixed([current]), { onAction, onDismiss }));
    expect(view.act).toBeNull();
    expect(view.dismiss!.getAttribute("aria-label")).toBe("Dismiss");
    await userEvent.click(view.dismiss!);
    expect(onDismiss).toHaveBeenCalledWith(current);
    expect(view.line).toBe("Up to date");
  });

  it("hides the action without onAction, saying so in development, and dismiss without onDismiss or a dismissable item", async () => {
    const view = await render(base(fixed([item("update", "action", { action: { id: "restart", label: "Restart" }, dismissable: true })])));
    expect(view.act).toBeNull();
    expect(view.dismiss).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] Porthole: the item "update" offers an action, but onAction is not set, so its button is hidden. Fix: <Porthole onAction={(item, actionId) => service.act(item.id, actionId)} />.',
    );
    await view.rerender(base(fixed([item("current", "rest")]), { onDismiss: () => {} }));
    expect(view.dismiss).toBeNull();
  });

  it("never takes focus when it changes, and gives it back to the spot when a pressed button leaves", async () => {
    const live = service(snapshot());
    const outside = document.createElement("input");
    document.body.append(outside);
    mounted.push(outside);
    const update = item("update", "action", { action: { id: "restart", label: "Restart" } });
    const view = await render(base(live.source, { onAction: () => {}, onDismiss: () => {} }));
    outside.focus();
    await live.send(snapshot([update]));
    await live.send(snapshot([item("offline", "error")]));
    await live.send(snapshot([item("current", "rest", { dismissable: true })]));
    expect(document.activeElement).toBe(outside);
    view.dismiss!.focus();
    await live.send(snapshot());
    expect(document.activeElement).toBe(view.spot);
    await live.send(snapshot([update]));
    view.act!.focus();
    await live.send(snapshot([item(update.id, update.priority)]));
    expect(document.activeElement).toBe(view.spot);
    // A button that leaves without focus moves nothing.
    outside.focus();
    await live.send(snapshot([update]));
    await live.send(snapshot());
    expect(document.activeElement).toBe(outside);
  });

  it("speaks when it changes into an action or an error, at most once every ten seconds", async () => {
    vi.useFakeTimers({ now: START, toFake: ["setTimeout", "clearTimeout", "Date"] });
    const announced = watchAnnouncements();
    try {
      const live = service(snapshot([item("offline", "error", { label: "Can't reach the service" })]));
      await render(base(live.source, { heartbeatTimeoutMs: MINUTE * 10 }));
      await act(() => vi.advanceTimersByTimeAsync(200));
      // Not on the first render: the person did not see it change.
      expect(announced.count("Can't reach the service")).toBe(0);
      await live.send(snapshot());
      await live.send(snapshot([item("update", "action", { label: "Restart to update" })]));
      await act(() => vi.advanceTimersByTimeAsync(200));
      expect(announced.count("Restart to update")).toBe(1);
      // Working is never spoken.
      await live.send(snapshot([item("sync", "working", { label: "Catching up" })]));
      await act(() => vi.advanceTimersByTimeAsync(200));
      expect(announced.count("Catching up")).toBe(0);
      // A second change inside the gap waits for its end.
      await live.send(snapshot([item("offline", "error", { label: "Can't reach the service" })]));
      await act(() => vi.advanceTimersByTimeAsync(PORTHOLE_ANNOUNCE_GAP_MS - 1_000));
      expect(announced.count("Can't reach the service")).toBe(0);
      await act(() => vi.advanceTimersByTimeAsync(1_000));
      expect(announced.count("Can't reach the service")).toBe(1);
      // The same urgent thing sent again is not news.
      await live.send(snapshot([item("offline", "error", { label: "Can't reach the service", detail: ["more"] })]));
      await act(() => vi.advanceTimersByTimeAsync(PORTHOLE_ANNOUNCE_GAP_MS));
      expect(announced.count("Can't reach the service")).toBe(1);
      // One that clears before its turn is never spoken.
      await live.send(snapshot([item("update", "action", { label: "Restart now" })]));
      await act(() => vi.advanceTimersByTimeAsync(200));
      expect(announced.count("Restart now")).toBe(1);
      await live.send(snapshot([item("late", "error", { label: "Late problem" })]));
      await live.send(snapshot());
      await act(() => vi.advanceTimersByTimeAsync(PORTHOLE_ANNOUNCE_GAP_MS));
      expect(announced.count("Late problem")).toBe(0);
    } finally {
      announced.stop();
    }
  });

  it("takes words in another language, the dismiss button's name too", async () => {
    const labels = { fresh: "Gerade aktualisiert", dismiss: "Ausblenden" };
    const view = await render(base(fixed(), { labels }));
    expect(view.line).toBe("Gerade aktualisiert");
    await view.rerender(base(fixed([item("current", "rest", { dismissable: true })]), { labels, onDismiss: () => {} }));
    expect(view.dismiss!.getAttribute("aria-label")).toBe("Ausblenden");
  });

  it("fades the new words in over the old, and keeps the old only to fade them out", async () => {
    const view = await render(base(fixed()));
    expect(view.host.querySelector('[data-ouro-part="spot"] span[aria-hidden="true"].absolute')).toBeNull();
    expect(view.host.querySelector('[data-ouro-part="spot"] span.block')!.className).not.toContain("starting:opacity-0");
    await view.rerender(base(fixed([item("sync", "working", { label: "Catching up" })])));
    const was = view.host.querySelector('[data-ouro-part="spot"] span[aria-hidden="true"].absolute')!;
    expect(was.textContent).toBe("Updated just now");
    expect(getComputedStyle(was).pointerEvents).toBe("none");
    expect(was.className).toContain("starting:opacity-100");
    expect(view.host.querySelector('[data-ouro-part="spot"] span.block')!.className).toContain("starting:opacity-0");
    expect(view.line).toBe("Catching up");
    // Each change is a new pair of elements, so the fades start again rather than carry on.
    const is = view.host.querySelector('[data-ouro-part="spot"] span.block')!;
    await view.rerender(base(fixed([item("offline", "error", { label: "Can't reach the service" })])));
    expect(view.host.querySelector('[data-ouro-part="spot"] span.block')).not.toBe(is);
    expect(view.host.querySelector('[data-ouro-part="spot"] span[aria-hidden="true"].absolute')).not.toBe(was);
    expect(view.host.querySelector('[data-ouro-part="spot"] span[aria-hidden="true"].absolute')!.textContent).toBe("Catching up");
  });

  it("eases its width to fit the line, and with reduced motion changes it at once", async () => {
    const view = await render(base(fixed()));
    const pill = view.host.querySelector<HTMLElement>('[data-porthole-part="pill"]')!;
    const content = pill.firstElementChild as HTMLElement;
    await expect.poll(() => pill.style.width).toBe(`${content.offsetWidth + pill.offsetWidth - pill.clientWidth}px`);
    expect(getComputedStyle(pill).transitionProperty).toBe("width");
    await view.rerender(base(fixed([item("sync", "working", { label: "Catching up on a great many messages" })])));
    await expect.poll(() => pill.style.width).toBe(`${content.offsetWidth + pill.offsetWidth - pill.clientWidth}px`);
    await commands.emulateMedia({ reducedMotion: "reduce" });
    expect(getComputedStyle(pill).transitionProperty).toBe("none");
  });

  it("sets its width as it mounts, before the size observer first reports", async () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    try {
      const view = await render(base(fixed()));
      const pill = view.host.querySelector<HTMLElement>('[data-porthole-part="pill"]')!;
      const content = pill.firstElementChild as HTMLElement;
      expect(pill.style.width).toBe(`${content.offsetWidth + pill.offsetWidth - pill.clientWidth}px`);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("colours its words and its light by what they mean: an error in the destructive tone, rest and unknown muted, working and an action in the foreground", async () => {
    const old = Date.now() - 2 * MINUTE;
    const states = {
      "rest-fresh": fixed(),
      "rest-stale": fixed([], { chats: area(old) }),
      unknown: fixed([], undefined, old),
      working: fixed([item("sync", "working")]),
      error: fixed([item("offline", "error")]),
      action: fixed([item("update", "action")]),
    };
    const words: Record<string, string> = {};
    const lights: Record<string, CSSStyleDeclaration> = {};
    for (const [state, source] of Object.entries(states)) {
      const view = await render(base(source));
      expect(view.state).toBe(state);
      words[state] = getComputedStyle(view.spot).color;
      lights[state] = getComputedStyle(view.host.querySelector(state === "working" ? '[data-porthole-part="progress"]' : '[data-porthole-part="light"]')!);
    }
    expect(words["rest-stale"]).toBe(words["rest-fresh"]);
    expect(words.unknown).toBe(words["rest-fresh"]);
    expect(words.action).toBe(words.working);
    expect(new Set([words["rest-fresh"], words.working, words.error]).size).toBe(3);
    const transparent = "rgba(0, 0, 0, 0)";
    for (const state of ["rest-fresh", "rest-stale", "error", "action"]) expect(lights[state]!.backgroundColor, state).not.toBe(transparent);
    expect(new Set(["rest-fresh", "rest-stale", "error", "action"].map((state) => lights[state]!.backgroundColor)).size).toBe(4);
    // Unknown is an empty ring: no fill, only an edge.
    expect(lights.unknown!.backgroundColor).toBe(transparent);
    expect(lights.unknown!.boxShadow).not.toBe("none");
  });

  it("says nothing in development when it is used as documented", async () => {
    await render(base(fixed([item("update", "action", { action: { id: "restart", label: "Restart" }, dismissable: true })]), { onAction: () => {}, onDismiss: () => {}, className: "ms-auto" }));
    expect(warn).not.toHaveBeenCalled();
  });

  it("puts its lines away on Escape and keeps that key from the page, and leaves every other key alone", async () => {
    const view = await render(base(fixed()));
    const press = async (key: string) => {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      await act(() => view.spot.dispatchEvent(event));
      return event.defaultPrevented;
    };
    await act(() => view.spot.click());
    expect(await press("a")).toBe(false);
    expect(view.panel).not.toBeNull();
    expect(await press("Escape")).toBe(true);
    expect(view.panel).toBeNull();
    // Closed, Escape is the page's.
    expect(await press("Escape")).toBe(false);
  });

  it("passes its own attributes through, and warns about appearance classes", async () => {
    const view = await render(base(fixed(), { id: "status", className: "ms-auto bg-red-500" }));
    expect(view.porthole.id).toBe("status");
    expect(view.porthole.className).toContain("ms-auto");
    expect(warn).toHaveBeenCalledWith('[ouro-ui] Porthole: "bg-red-500" sets appearance, and className is for layout only. Fix: remove "bg-red-500"; Porthole takes its colors from the theme.');
  });

  it("names the fix for items and status, which are not props", async () => {
    const guessed = { items: [], status: "error" } as unknown as Partial<PortholeProps>;
    const view = await render(base(fixed(), guessed));
    expect(view.porthole.hasAttribute("items")).toBe(false);
    expect(view.porthole.hasAttribute("status")).toBe(false);
    expect(warn).toHaveBeenCalledWith("[ouro-ui] Porthole: items is not a prop; Porthole reads them from source. Fix: <Porthole source={{ snapshot: { version: 1, items, areas }, lastBeatAt }} />.");
    expect(warn).toHaveBeenCalledWith("[ouro-ui] Porthole: status is not a prop; Porthole decides it from source. Fix: <Porthole source={statusSource} />.");
  });

  it("renders on the server with its line and state in the HTML", () => {
    const html = renderToString(base(fixed([item("offline", "error", { label: "Can't reach the service" })])));
    expect(html).toContain('data-porthole-state="error"');
    expect(html).toContain("Can&#x27;t reach the service");
  });

  it("renders on the server as of its last beat, hydrates later without a mismatch, then judges against the clock", async () => {
    vi.useFakeTimers({ now: START, toFake: ["setTimeout", "clearTimeout", "Date"] });
    const source = fixed([], { chats: area(START - SECOND) }, START - SECOND);
    const html = renderToString(base(source));
    expect(html).toContain('data-porthole-state="rest-fresh"');
    // The page is read a minute later, from a cache, long after the beat timed out.
    vi.setSystemTime(START + MINUTE);
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.append(host);
    mounted.push(host);
    const onRecoverableError = vi.fn();
    await act(async () => void roots.push(hydrateRoot(host, base(source), { onRecoverableError })));
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(host.querySelector('[data-ouro="porthole"]')!.getAttribute("data-porthole-state")).toBe("unknown");
    expect(host.querySelector('[data-ouro-part="spot"] span.block')!.textContent).toBe("Status unknown");
  });

  it("stops listening and looking when it leaves the page", async () => {
    vi.useFakeTimers({ now: START, toFake: ["setTimeout", "clearTimeout", "Date"] });
    const live = service();
    const removed = vi.spyOn(document, "removeEventListener");
    const view = await render(base(live.source));
    expect(live.listeners.size).toBe(1);
    await act(async () => view.root.unmount());
    expect(live.listeners.size).toBe(0);
    expect(removed).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("Porthole timing", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: START, toFake: ["setTimeout", "clearTimeout", "Date"] });
  });

  const run = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

  it("renders nothing for 60 beats over 60 s at rest, then once when fresh runs out", async () => {
    const live = service(snapshot([], { chats: area(START), calendar: area(START) }));
    const view = await render(base(live.source));
    for (let beat = 0; beat < 60; beat += 1) {
      await run(SECOND);
      live.beat();
    }
    expect(commits).toBe(0);
    expect(view.line).toBe("Updated just now");
    await run(1);
    expect(commits).toBe(1);
    expect(view.state).toBe("rest-stale");
    expect(view.line).toBe("Updated 1 min ago");
    // The words next change at two minutes, and nothing renders before.
    for (let beat = 0; beat < 59; beat += 1) {
      await run(SECOND);
      live.beat();
    }
    expect(commits).toBe(1);
    await run(SECOND);
    expect(commits).toBe(2);
    expect(view.line).toBe("Updated 2 min ago");
  });

  it("says Status unknown once at the heartbeat's timeout when the beats stop, and recovers on the next beat", async () => {
    const live = service();
    const view = await render(base(live.source, { freshWithinMs: 10 * MINUTE }));
    await run(5 * SECOND);
    expect(commits).toBe(0);
    expect(view.state).toBe("rest-fresh");
    await run(1);
    expect(commits).toBe(1);
    expect(view.state).toBe("unknown");
    // While it waits for a beat it looks each second, and renders nothing until one comes.
    await run(10 * SECOND);
    expect(commits).toBe(1);
    live.beat();
    await run(SECOND);
    expect(commits).toBe(2);
    expect(view.state).toBe("rest-fresh");
  });

  it("stops saying just now once, five seconds into an area's trouble", async () => {
    const live = service(snapshot([], { chats: area(START, START) }));
    const view = await render(base(live.source, { heartbeatTimeoutMs: 10 * MINUTE }));
    await run(5 * SECOND - 1);
    expect(commits).toBe(0);
    expect(view.state).toBe("rest-fresh");
    await run(1);
    expect(commits).toBe(1);
    expect(view.state).toBe("rest-stale");
    expect(view.line).toBe("Updated less than a minute ago");
  });

  it("judges again with its own times when the clock reaches them", async () => {
    const live = service(snapshot([], { chats: area(START) }));
    const view = await render(base(live.source, { freshWithinMs: 10 * SECOND }));
    for (let beat = 0; beat < 10; beat += 1) {
      await run(SECOND);
      live.beat();
    }
    expect(view.state).toBe("rest-fresh");
    await run(1);
    expect(view.state).toBe("rest-stale");
  });

  it("listens to the new source when it is given another", async () => {
    const first = service();
    const second = service();
    const view = await render(base(first.source, { heartbeatTimeoutMs: 10 * MINUTE }));
    await view.rerender(base(second.source, { heartbeatTimeoutMs: 10 * MINUTE }));
    expect(first.listeners.size).toBe(0);
    expect(second.listeners.size).toBe(1);
    await second.send(snapshot([item("offline", "error")]));
    expect(view.state).toBe("error");
  });

  it("while the heartbeat is stopped, still changes its words at the very moment they change, between its checks for a beat", async () => {
    const live = service(snapshot([], { chats: area(START) }));
    const view = await render(base(live.source, { defaultOpen: true }));
    await run(5 * SECOND + 1);
    expect(view.state).toBe("unknown");
    // A snapshot 0.4 s later moves the once-a-second checks off the minute.
    await run(399);
    await live.send(snapshot([], { chats: area(START) }));
    await run(MINUTE - 5_400 - 1);
    const lines = () => [...view.panel!.querySelectorAll("li")].map((li) => li.textContent);
    const before = commits;
    expect(lines()).toContain("No heartbeat for less than a minute");
    await run(1);
    expect(commits).toBe(before + 1);
    expect(lines()).toContain("No heartbeat for 1 min");
  });

  it("speaks at once when nothing was spoken within the gap, at the gap's very end too, and never as it settles to rest", async () => {
    const live = service();
    await render(base(live.source, { heartbeatTimeoutMs: 10 * MINUTE }));
    announce("");
    await run(200);
    const region = document.querySelector<HTMLElement>("[data-ouro-announcer]")!;
    // announce() empties the region at once and fills it a moment later, so an emptied region was spoken to now.
    region.textContent = "before";
    await live.send(snapshot([item("offline", "error", { label: "Can't reach the service" })]));
    expect(region.textContent).toBe("");
    await run(PORTHOLE_ANNOUNCE_GAP_MS);
    expect(region.textContent).toBe("Can't reach the service");
    region.textContent = "before";
    await live.send(snapshot([item("update", "action", { label: "Restart to update" })]));
    expect(region.textContent).toBe("");
    await run(PORTHOLE_ANNOUNCE_GAP_MS);
    region.textContent = "before";
    await live.send(snapshot());
    await run(PORTHOLE_ANNOUNCE_GAP_MS);
    expect(region.textContent).toBe("before");
    // The same update back again, after it went away, is not news.
    await live.send(snapshot([item("update", "action", { label: "Restart to update" })]));
    await run(PORTHOLE_ANNOUNCE_GAP_MS);
    expect(region.textContent).toBe("before");
  });

  it("looks again from each new snapshot", async () => {
    const live = service(snapshot([], { chats: area(START) }));
    const view = await render(base(live.source, { heartbeatTimeoutMs: 10 * MINUTE }));
    await run(30 * SECOND);
    await live.send(snapshot([], { chats: area(Date.now()) }));
    commits = 0;
    await run(40 * SECOND);
    expect(commits).toBe(0);
    expect(view.state).toBe("rest-fresh");
    await run(20 * SECOND + 1);
    expect(commits).toBe(1);
    expect(view.state).toBe("rest-stale");
  });

  it("looks no more once nothing it shows can change with time, but looks each second for a live service's first beat", async () => {
    const view = await render(base(fixed([], { chats: area(null) }, Number.NaN)));
    expect(view.state).toBe("unknown");
    expect(vi.getTimerCount()).toBe(0);
    const live = service(snapshot([], { chats: area(null) }));
    live.source.lastBeatAt = () => Number.NaN;
    await view.rerender(base(live.source));
    expect(vi.getTimerCount()).toBe(1);
    await run(SECOND);
    expect(vi.getTimerCount()).toBe(1);
    expect(commits).toBe(1);
  });

  it("waits while the page is hidden, and looks again as it shows", async () => {
    let hidden = false;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    const live = service();
    const view = await render(base(live.source, { freshWithinMs: 10 * MINUTE }));
    hidden = true;
    await act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(vi.getTimerCount()).toBe(0);
    await run(30 * SECOND);
    expect(commits).toBe(0);
    expect(view.state).toBe("rest-fresh");
    hidden = false;
    await act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(commits).toBe(1);
    expect(view.state).toBe("unknown");
    // Shown and current again, a timer waits for the next moment.
    live.beat();
    await run(SECOND);
    expect(view.state).toBe("rest-fresh");
    expect(vi.getTimerCount()).toBe(1);
  });

  it("waits on a hidden page from its first render", async () => {
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    await render(base(service().source));
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("Porthole agent side", () => {
  it("declares one status read and only person-only actions, each rendered on its control", async () => {
    expect(portholeAx.component).toBe("Porthole");
    expect(portholeAx.reads.map((read) => [read.id, read.consent])).toEqual([["status", "none"]]);
    expect(portholeAx.reads[0]!.summary).toMatch(/^What the status spot shows and why: /);
    expect(portholeAx.actions.map((action) => action.summary)).toEqual([
      "Open the status spot's detail lines.",
      "Close the status spot's detail lines.",
      "Dismiss news the person has seen, such as Up to date.",
    ]);
    expect(portholeAx.reads[0]!.fields).toEqual(["asOf", "state", "headline", "fresh", "alive", "heartbeatAt", "heartbeatAgeMs", "areas", "priority", "shown"]);
    expect(portholeAx.actions.map((action) => action.id)).toEqual(["expand", "collapse", "dismiss"]);
    for (const action of portholeAx.actions) {
      expect(action.agent).toBeUndefined();
      expect(action.personOnly).toMatch(/^You can't .+; only (the person|they) .+\.$/);
      expect(action.effect).toBe("private");
    }
    const refuseAs = { expand: "app status open", collapse: "app status close", dismiss: "app status dismiss" };
    expect(() => bindAx(portholeAx, { reads: { status: "app status --json" }, actions: { dismiss: "app status dismiss" }, refuseAs })).toThrow(/it is the person's, so it has no twin/);
    const entries = bindAx(portholeAx, { reads: { status: "app status --json" }, refuseAs });
    expect(entries.filter((entry) => entry.kind === "action").every((entry) => entry.personOnly !== undefined && entry.twin === undefined)).toBe(true);
    const both = item("update", "action", { action: { id: "restart", label: "Restart" }, dismissable: true });
    const view = await render(base(fixed([both]), { onAction: () => {}, onDismiss: () => {} }));
    expectAxRendered(portholeAx, view.host, { ids: ["expand", "dismiss"] });
    expect(() => expectAxRendered(portholeAx, view.host, { ids: ["collapse"] })).toThrow();
    expect(view.host.querySelector('[data-ouro-part="act"]')!.getAttribute("data-ax-action")).toBe("restart");
    await userEvent.click(view.spot);
    expectAxRendered(portholeAx, view.host, { ids: ["collapse", "dismiss"] });
  });
});
