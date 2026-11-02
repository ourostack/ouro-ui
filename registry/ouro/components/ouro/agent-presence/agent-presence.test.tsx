import { useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { AgentPresence, type AgentPresenceProps, type ListeningAgent } from "@/registry/ouro/components/ouro/agent-presence/agent-presence";
import { agentPresenceAx } from "@/registry/ouro/components/ouro/agent-presence/agent-presence-styles";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { watchAnnouncements } from "@/registry/ouro/lib/ouro/testing/announcements";

// Runs in Chromium and WebKit.

const inbox: ListeningAgent = { id: "inbox", name: "inbox agent", doing: "listening for your name, and anything about the empty state" };
const research: ListeningAgent = { id: "research", name: "research agent", doing: "noting every question about pricing" };
const notes: ListeningAgent = { id: "notes", name: "notes agent" };

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.padding = "24px";
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return { host, rerender: (next: ReactNode) => act(async () => root.render(next)) };
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
  await commands.emulateMedia({ reducedMotion: "no-preference", forcedColors: "none" });
});

const messages = () => warn.mock.calls.map((call: unknown[]) => String(call[0]));
const chip = () => document.querySelector<HTMLButtonElement>('[data-ouro-control="agent-presence"][data-ouro-part="trigger"]')!;
const popup = () => document.querySelector<HTMLElement>('[data-ouro="popover"]');
const stops = () => [...document.querySelectorAll<HTMLButtonElement>('[data-ouro-part="stop"]')];
const stopAll = () => document.querySelector<HTMLButtonElement>('[data-ouro-part="stop-all"]');
const base = { label: "Agents listening", onStop: () => {} } satisfies Partial<AgentPresenceProps>;

/** Waits until the open popover has finished its entrance. */
async function settled() {
  await expect
    .poll(() => {
      const element = popup();
      return Boolean(element && !element.hasAttribute("data-starting-style") && element.getAnimations().length === 0);
    })
    .toBe(true);
}

/** An app that stops agents as the person asks, with a control after the chip. */
function Listening({ initial, withStopAll = true, onStopped }: { initial: ListeningAgent[]; withStopAll?: boolean; onStopped?: (id: string) => void }) {
  const [agents, setAgents] = useState(initial);
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <AgentPresence
        label="Agents listening"
        agents={agents}
        onStop={(id) => {
          onStopped?.(id);
          setAgents((now) => now.filter((agent) => agent.id !== id));
        }}
        onStopAll={withStopAll ? () => setAgents([]) : undefined}
      />
      <button type="button" data-test-harness="">
        After
      </button>
    </div>
  );
}

describe("AgentPresence", () => {
  it("is a chip that names one agent, or counts several", async () => {
    const { host, rerender } = await render(<AgentPresence {...base} agents={[inbox]} />);
    expect(host.querySelector('[data-ouro="agent-presence"]')).not.toBeNull();
    await expect.element(page.getByRole("button", { name: "inbox agent listening", exact: true })).toBeVisible();
    expect(chip().getAttribute("aria-haspopup")).toBe("dialog");
    expect(chip().getAttribute("aria-expanded")).toBe("false");
    const sparkle = chip().querySelector("svg")!;
    expect(sparkle.getAttribute("aria-hidden")).toBe("true");
    expect(sparkle.querySelector("path")!.getAttribute("d")).toBe("M6 0Q6.7 5.3 12 6 6.7 6.7 6 12 5.3 6.7 0 6 5.3 5.3 6 0Z");
    expect(chip().textContent).toBe("inbox agent listening");
    await rerender(<AgentPresence {...base} agents={[inbox, research]} />);
    await expect.element(page.getByRole("button", { name: "2 agents listening: inbox agent, research agent", exact: true })).toBeVisible();
    expect(chip().innerText.trim()).toBe("2 agents listening");
  });

  it("renders nothing while no agent listens, and comes back when one does", async () => {
    const { host, rerender } = await render(<AgentPresence {...base} agents={[]} />);
    expect(host.innerHTML).toBe("");
    await rerender(<AgentPresence {...base} agents={[inbox]} />);
    await userEvent.click(chip());
    await settled();
    await rerender(<AgentPresence {...base} agents={[]} />);
    expect(host.innerHTML).toBe("");
    await expect.poll(() => popup()).toBeNull();
    await rerender(<AgentPresence {...base} agents={[inbox]} />);
    // It comes back closed: the popover never opens on its own.
    expect(chip().getAttribute("aria-expanded")).toBe("false");
    expect(popup()).toBeNull();
    await expect.element(page.getByRole("button", { name: "inbox agent listening" })).toBeVisible();
  });

  it("never hides itself while an agent listens: not in a narrow bar, not after its popover closes, not as time passes", async () => {
    const { host } = await render(
      <div style={{ width: 60, display: "flex" }}>
        <AgentPresence {...base} agents={[inbox, research]} />
      </div>,
    );
    const shown = () => {
      const box = chip().getBoundingClientRect();
      return getComputedStyle(chip()).visibility === "visible" && getComputedStyle(chip()).opacity === "1" && box.width > 0 && box.height > 0;
    };
    // In a bar narrower than itself it keeps its words whole rather than collapsing.
    expect(shown()).toBe(true);
    expect(chip().getBoundingClientRect().width).toBeGreaterThan(host.firstElementChild!.getBoundingClientRect().width);
    expect(chip().innerText.trim()).toBe("2 agents listening");
    await userEvent.click(chip());
    await settled();
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => popup()).toBeNull();
    expect(shown()).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(shown()).toBe(true);
  });

  it("opens a popover named by its label, with each agent, what it listens for and a Stop", async () => {
    await render(<AgentPresence {...base} agents={[inbox, notes]} />);
    await userEvent.click(chip());
    await settled();
    expect(chip().getAttribute("aria-expanded")).toBe("true");
    await expect.element(page.getByRole("dialog", { name: "Agents listening" })).toBeVisible();
    const rows = [...popup()!.querySelectorAll("li")];
    expect(rows.map((row) => row.innerText.replace(/\s+/g, " ").trim())).toEqual([
      "IA inbox agent listening for your name, and anything about the empty state Stop",
      "NA notes agent Stop",
    ]);
    // Each agent wears the agent hexagon, read once: its name is written beside it.
    const avatar = rows[0]!.querySelector<HTMLElement>('[data-ouro="avatar"]')!;
    expect(avatar.getAttribute("data-shape")).toBe("hexagon");
    expect(avatar.getAttribute("aria-hidden")).toBe("true");
    expect(stops().map((stop) => stop.textContent)).toEqual(["Stop", "Stop"]);
    expect(stops().map((stop) => stop.getAttribute("aria-label"))).toEqual(["Stop inbox agent", "Stop notes agent"]);
    await expect.element(page.getByRole("button", { name: "Stop inbox agent", exact: true })).toBeVisible();
    await userEvent.click(chip());
    await expect.poll(() => popup()).toBeNull();
  });

  it("opens from the keyboard onto the first Stop, and Escape returns to the chip", async () => {
    await render(<AgentPresence {...base} agents={[inbox, research]} />);
    chip().focus();
    await userEvent.keyboard("{Enter}");
    await settled();
    await expect.poll(() => document.activeElement).toBe(stops()[0]);
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => popup()).toBeNull();
    expect(document.activeElement).toBe(chip());
  });

  it("stops one agent, says so once it has gone, and keeps focus in the list", async () => {
    const announced = watchAnnouncements();
    try {
      const stopped = vi.fn();
      await render(<Listening initial={[inbox, research, notes]} onStopped={stopped} />);
      chip().focus();
      await userEvent.keyboard("{Enter}");
      await settled();
      await expect.poll(() => document.activeElement).toBe(stops()[0]);
      await userEvent.keyboard("{Enter}");
      expect(stopped).toHaveBeenCalledWith("inbox");
      await expect.poll(() => stops().length).toBe(2);
      await expect.poll(() => document.activeElement).toBe(stops()[0]);
      expect(document.activeElement!.getAttribute("aria-label")).toBe("Stop research agent");
      await expect.poll(() => announced.count("inbox agent stopped")).toBe(1);
      // The last row's Stop hands focus back to the row before it.
      stops()[1]!.focus();
      await userEvent.keyboard("{Enter}");
      await expect.poll(() => stops().length).toBe(1);
      await expect.poll(() => document.activeElement).toBe(stops()[0]);
      // Stop all goes with the second agent, and focus stays on the Stop before it.
      expect(stopAll()).toBeNull();
      await expect.poll(() => announced.count("notes agent stopped")).toBe(1);
      expect(announced.count("inbox agent stopped")).toBe(1);
    } finally {
      announced.stop();
    }
  });

  it("hands focus from Stop all to the Stop before it when Stop all goes", async () => {
    const { rerender } = await render(<AgentPresence {...base} agents={[inbox, research]} />);
    await userEvent.click(chip());
    await settled();
    stopAll()!.focus();
    await rerender(<AgentPresence {...base} agents={[inbox]} />);
    await expect.poll(() => document.activeElement).toBe(stops()[0]);
  });

  it("falls back to the chip when a row goes and nothing in the popover can take focus", async () => {
    const { rerender } = await render(<AgentPresence {...base} agents={[inbox]} />);
    await userEvent.click(chip());
    await settled();
    stops()[0]!.focus();
    // The only row goes for another, so the popover holds no control at that moment.
    await rerender(<AgentPresence {...base} agents={[{ ...inbox, id: "inbox-2" }]} />);
    await expect.poll(() => document.activeElement === stops()[0] || document.activeElement === chip()).toBe(true);
  });

  it("stops every agent with Stop all, which shows only with two or more", async () => {
    const onStop = vi.fn();
    const onStopAll = vi.fn();
    const { rerender } = await render(<AgentPresence {...base} onStop={onStop} onStopAll={onStopAll} agents={[inbox]} />);
    await userEvent.click(chip());
    await settled();
    expect(stopAll()).toBeNull();
    await rerender(<AgentPresence {...base} onStop={onStop} onStopAll={onStopAll} agents={[inbox, research]} />);
    expect(stopAll()!.textContent).toBe("Stop all");
    await userEvent.click(stopAll()!);
    expect(onStopAll).toHaveBeenCalledTimes(1);
    expect(onStop).not.toHaveBeenCalled();
  });

  it("calls onStop for each agent from Stop all when there is no onStopAll", async () => {
    const onStop = vi.fn();
    await render(<AgentPresence {...base} onStop={onStop} agents={[inbox, research, notes]} />);
    await userEvent.click(chip());
    await settled();
    await userEvent.click(stopAll()!);
    expect(onStop.mock.calls).toEqual([["inbox"], ["research"], ["notes"]]);
  });

  it("moves focus to the control after the chip when the last agent goes", async () => {
    const announced = watchAnnouncements();
    try {
      await render(<Listening initial={[inbox, research]} />);
      chip().focus();
      await userEvent.keyboard("{Enter}");
      await settled();
      stopAll()!.focus();
      await userEvent.keyboard("{Enter}");
      await expect.poll(() => document.querySelector('[data-ouro="agent-presence"]')).toBeNull();
      await expect.poll(() => document.activeElement?.textContent).toBe("After");
      await expect.poll(() => announced.count("inbox agent stopped. research agent stopped")).toBe(1);
    } finally {
      announced.stop();
    }
  });

  it("moves focus on from the chip when the last agent stops on its own", async () => {
    const { rerender } = await render(
      <div>
        <AgentPresence {...base} agents={[inbox]} />
        <button type="button" data-test-harness="">
          Next
        </button>
      </div>,
    );
    chip().focus();
    await rerender(
      <div>
        <AgentPresence {...base} agents={[]} />
        <button type="button" data-test-harness="">
          Next
        </button>
      </div>,
    );
    await expect.poll(() => document.activeElement?.textContent).toBe("Next");
  });

  it("leaves focus alone when the popover goes while focus is elsewhere", async () => {
    const { rerender } = await render(
      <div>
        <AgentPresence {...base} agents={[inbox]} />
        <input aria-label="Notes" data-test-harness="" />
      </div>,
    );
    await userEvent.click(chip());
    await settled();
    const field = document.querySelector("input")!;
    field.focus();
    await rerender(
      <div>
        <AgentPresence {...base} agents={[]} />
        <input aria-label="Notes" data-test-harness="" />
      </div>,
    );
    expect(document.activeElement).toBe(field);
  });

  it("says once, politely, when an agent starts or stops listening", async () => {
    const announced = watchAnnouncements();
    try {
      const { rerender } = await render(<AgentPresence {...base} agents={[inbox]} />);
      await new Promise((resolve) => setTimeout(resolve, 150));
      // The agents already listening are no news.
      expect(announced.count("inbox agent is now listening")).toBe(0);
      await rerender(<AgentPresence {...base} agents={[inbox, research]} />);
      await expect.poll(() => announced.count("research agent is now listening")).toBe(1);
      // New words for the same agents are not news either.
      await rerender(<AgentPresence {...base} agents={[{ ...inbox, doing: "listening for dates" }, research]} />);
      await rerender(<AgentPresence {...base} agents={[{ ...inbox, name: "mail agent" }, research]} />);
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(announced.count("mail agent")).toBe(0);
      // An agent that stops is named as the person last saw it.
      await rerender(<AgentPresence {...base} agents={[research]} />);
      await expect.poll(() => announced.count("mail agent stopped")).toBe(1);
      await rerender(<AgentPresence {...base} agents={[notes]} />);
      await expect.poll(() => announced.count("research agent stopped. notes agent is now listening")).toBe(1);
      expect(announced.count("research agent is now listening")).toBe(1);
      const region = document.querySelector("[data-ouro-announcer]")!;
      expect(region.getAttribute("aria-live")).toBe("polite");
    } finally {
      announced.stop();
    }
  });

  it("shows only the sparkle and the count when compact, and its name still says who", async () => {
    const { rerender } = await render(<AgentPresence {...base} compact agents={[inbox, research]} />);
    await expect.element(page.getByRole("button", { name: "2 agents listening: inbox agent, research agent", exact: true })).toBeVisible();
    expect(chip().innerText.trim()).toBe("2");
    await rerender(<AgentPresence {...base} compact agents={[inbox]} />);
    await expect.element(page.getByRole("button", { name: "inbox agent listening", exact: true })).toBeVisible();
    expect(chip().innerText.trim()).toBe("1");
    const full = chip().getBoundingClientRect().width;
    await rerender(<AgentPresence {...base} agents={[inbox]} />);
    expect(chip().getBoundingClientRect().width).toBeGreaterThan(full);
  });

  it("shows a dot when an agent left something, and says so in the chip's name", async () => {
    const { rerender } = await render(<AgentPresence {...base} agents={[inbox]} />);
    expect(chip().querySelector("[data-ouro-agent-presence-unread]")).toBeNull();
    await rerender(<AgentPresence {...base} unread agents={[inbox]} />);
    const dot = chip().querySelector<HTMLElement>("[data-ouro-agent-presence-unread]")!;
    expect(dot.getAttribute("aria-hidden")).toBe("true");
    expect(dot.getBoundingClientRect().width).toBe(8);
    const primary = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
    const probe = document.createElement("span");
    probe.style.color = primary;
    document.body.append(probe);
    expect(getComputedStyle(dot).backgroundColor).toBe(getComputedStyle(probe).color);
    probe.remove();
    await expect.element(page.getByRole("button", { name: "inbox agent listening. Something new from your agents", exact: true })).toBeVisible();
    await rerender(<AgentPresence {...base} unread agents={[inbox, research]} />);
    await expect.element(page.getByRole("button", { name: "2 agents listening: inbox agent, research agent. Something new from your agents", exact: true })).toBeVisible();
    await rerender(<AgentPresence {...base} unread compact agents={[inbox]} />);
    await expect.element(page.getByRole("button", { name: "inbox agent listening. Something new from your agents", exact: true })).toBeVisible();
    // It opens nothing by itself.
    expect(popup()).toBeNull();
  });

  it("draws the dot in CanvasText and keeps the chip's edge under forced colours", async () => {
    await render(<AgentPresence {...base} unread agents={[inbox]} />);
    await commands.emulateMedia({ forcedColors: "active" });
    const dot = chip().querySelector<HTMLElement>("[data-ouro-agent-presence-unread]")!;
    const probe = document.createElement("span");
    probe.style.color = "CanvasText";
    document.body.append(probe);
    expect(getComputedStyle(dot).backgroundColor).toBe(getComputedStyle(probe).color);
    probe.remove();
    expect(getComputedStyle(chip()).borderTopStyle).toBe("solid");
  });

  it("is as tall as a Button of its size, sm by default", async () => {
    for (const size of [undefined, "sm", "md", "lg"] as const) {
      const { host } = await render(
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <AgentPresence {...base} size={size} agents={[inbox]} />
          <Button size={size ?? "sm"}>Same</Button>
        </div>,
      );
      const [presence, button] = [...host.querySelectorAll<HTMLElement>('[data-ouro="button"]')];
      expect(presence!.getBoundingClientRect().height).toBe(button!.getBoundingClientRect().height);
    }
  });

  it("takes its words in another language", async () => {
    const announced = watchAnnouncements();
    try {
      const labels = {
        one: (name: string) => `${name} écoute`,
        many: (count: number) => `${count} agents écoutent`,
        started: (name: string) => `${name} écoute désormais`,
        stopped: (name: string) => `${name} arrêté`,
        stop: "Arrêter",
        stopAll: "Tout arrêter",
        unread: "Du nouveau de vos agents",
        close: "Fermer",
      };
      const { rerender } = await render(<AgentPresence {...base} labels={labels} unread agents={[inbox]} />);
      await expect.element(page.getByRole("button", { name: "inbox agent écoute. Du nouveau de vos agents", exact: true })).toBeVisible();
      await rerender(<AgentPresence {...base} labels={labels} agents={[inbox, research]} />);
      await expect.poll(() => announced.count("research agent écoute désormais")).toBe(1);
      expect(chip().innerText.trim()).toBe("2 agents écoutent");
      await userEvent.click(chip());
      await settled();
      expect(stops()[0]!.getAttribute("aria-label")).toBe("Arrêter inbox agent");
      expect(stopAll()!.textContent).toBe("Tout arrêter");
      expect(popup()!.querySelector("[data-ouro-popover-close]")!.textContent).toBe("Fermer");
      await rerender(<AgentPresence {...base} labels={labels} agents={[research]} />);
      await expect.poll(() => announced.count("inbox agent arrêté")).toBe(1);
      // A label left undefined keeps its default.
      await rerender(<AgentPresence {...base} labels={{ stop: undefined }} agents={[research]} />);
      expect(stops()[0]!.getAttribute("aria-label")).toBe("Stop research agent");
    } finally {
      announced.stop();
    }
  });

  it("lays the chip out from the right in a right-to-left page", async () => {
    const { host } = await render(
      <div dir="rtl">
        <AgentPresence {...base} agents={[inbox]} />
      </div>,
    );
    const sparkle = chip().querySelector("svg")!.getBoundingClientRect();
    const words = [...chip().querySelectorAll("span")].find((span) => span.textContent === "inbox agent listening")!.getBoundingClientRect();
    expect(sparkle.left).toBeGreaterThan(words.left);
    expect(host.querySelector('[data-ouro="agent-presence"]')!.getBoundingClientRect().right).toBeLessThanOrEqual(host.getBoundingClientRect().right);
  });

  it("renders the chip in server HTML, and nothing with no agents", () => {
    const html = renderToString(<AgentPresence {...base} agents={[inbox, research]} />);
    expect(html).toContain('data-ouro="agent-presence"');
    expect(html).toContain("2 agents listening");
    expect(html).toContain('aria-label="2 agents listening: inbox agent, research agent"');
    expect(renderToString(<AgentPresence {...base} agents={[]} />)).toBe("");
  });

  it("takes layout classes and its ref, and names the fix for an appearance class", async () => {
    let element: HTMLSpanElement | null = null;
    const { host } = await render(<AgentPresence {...base} className="ms-4 bg-red-500" ref={(node) => void (element = node)} agents={[inbox]} />);
    const root = host.querySelector<HTMLElement>('[data-ouro="agent-presence"]')!;
    expect(element).toBe(root);
    expect(root.className).toContain("ms-4");
    expect(messages()).toContain('[ouro-ui] AgentPresence: "bg-red-500" sets appearance, and className is for layout only. Fix: remove "bg-red-500"; AgentPresence takes its look from the theme, and its height from size.');
  });

  it("names the fix in development for a missing label, an unknown size, a shared id and guessed props", async () => {
    const guessed = { listeners: [inbox], onRemove: () => {}, autoHide: true, variant: "compact" } as unknown as Partial<AgentPresenceProps>;
    await render(<AgentPresence {...base} {...guessed} label="" size={"xs" as "sm"} agents={[inbox, { ...research, id: "inbox" }]} />);
    expect(chip().className).toContain("--ouro-button-h:calc(var(--spacing)*9)");
    expect(messages()).toEqual([
      '[ouro-ui] Popover: title is required; it names the popover for screen readers. Fix: <Popover title="Share recipe">.',
      '[ouro-ui] AgentPresence: label is required; it names the list of agents for screen readers. Fix: <AgentPresence label="Agents listening">.',
      '[ouro-ui] AgentPresence: size="xs" is not a size; use "sm", "md" or "lg". Fix: <AgentPresence size="sm">.',
      '[ouro-ui] AgentPresence: two agents share the id "inbox", so Stop cannot tell them apart. Fix: <AgentPresence agents={[{ id: "inbox-2", name: "research agent" }]}>.',
      '[ouro-ui] AgentPresence: listeners is not a prop. Fix: <AgentPresence agents={[{ id: "inbox", name: "inbox agent" }]}>.',
      "[ouro-ui] AgentPresence: onRemove is not a prop. Fix: <AgentPresence onStop={(id) => stop(id)}>.",
      "[ouro-ui] AgentPresence: autoHide is not a prop; AgentPresence never hides while an agent listens. Fix: <AgentPresence agents={listening}>.",
      "[ouro-ui] AgentPresence: variant is not a prop. Fix: <AgentPresence compact>.",
    ]);
  });

  it("says nothing in development for valid props", async () => {
    await render(<AgentPresence {...base} size="lg" compact unread agents={[inbox, research, notes]} className="ms-auto" />);
    expect(messages()).toEqual([]);
  });
});

describe("AgentPresence agent side", () => {
  it("declares one read and two actions only the person takes, each on a control that names it", async () => {
    expect(agentPresenceAx).toEqual({
      component: "AgentPresence",
      reads: [{ id: "listening", summary: "Which of the person's agents are listening, and what each listens for.", fields: ["agent", "doing"], consent: "none" }],
      actions: [
        { id: "stop", summary: "Stop an agent listening for the person.", effect: "private", personOnly: "You can't decide who listens for the person; only they can." },
        { id: "stop-all", summary: "Stop every agent listening for the person.", effect: "private", personOnly: "You can't decide who listens for the person; only they can." },
      ],
    });
    for (const action of agentPresenceAx.actions) expect(Object.hasOwn(action, "agent")).toBe(false);
    await render(<AgentPresence {...base} agents={[inbox, research]} />);
    expect(chip().hasAttribute("data-ax-action")).toBe(false);
    await userEvent.click(chip());
    await settled();
    const marked = [...document.querySelectorAll<HTMLElement>("[data-ax-action]")];
    expect(marked.map((element) => element.getAttribute("data-ax-action"))).toEqual(["stop", "stop", "stop-all"]);
    expect(marked.map((element) => element.getAttribute("data-ouro-part"))).toEqual(["stop", "stop", "stop-all"]);
  });
});
