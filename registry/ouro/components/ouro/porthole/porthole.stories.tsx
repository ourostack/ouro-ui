import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState, type CSSProperties } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Porthole, type PortholeFixed } from "@/registry/ouro/components/ouro/porthole/porthole";
import { Switch } from "@/registry/ouro/components/ouro/switch/switch";
import type { PortholeArea, PortholeItem, PortholeSnapshot, PortholeSource } from "@/registry/ouro/lib/ouro/porthole-view";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

const SECOND = 1_000;
const MINUTE = 60 * SECOND;

/** A fixed status, its times counted back from now, so each story reads the same whenever it renders. */
function fixed(items: PortholeItem[], ages: Record<string, number | null>, beatAgo = 0, trouble: Record<string, number> = {}): PortholeFixed {
  const now = Date.now();
  const areas: Record<string, PortholeArea> = {};
  for (const [id, age] of Object.entries(ages)) {
    areas[id] = { label: id[0]!.toUpperCase() + id.slice(1), lastVerifiedAt: age === null ? null : now - age, troubleSince: id in trouble ? now - trouble[id]! : null };
  }
  return { snapshot: { version: 1, items: items.map((item) => ({ ...item, since: now - item.since })), areas }, lastBeatAt: now - beatAgo };
}

const fresh = { chats: 8 * SECOND, activity: 20 * SECOND, calendar: 35 * SECOND };
const sync: PortholeItem = { id: "sync", priority: "working", label: "Catching up… 40%", progress: 0.4, detail: ["Catching up on 120 messages"], since: 2 * SECOND };
const offline: PortholeItem = { id: "offline", priority: "error", label: "Can't reach the service", detail: ["Trying again every 30 seconds"], since: 40 * SECOND };
const update: PortholeItem = { id: "update", priority: "action", label: "Version 2.4 is ready", action: { id: "restart", label: "Restart" }, detail: ["Restart to finish updating"], since: MINUTE };
const upToDate: PortholeItem = { id: "update", priority: "rest", label: "Up to date", dismissable: true, detail: ["Version 2.4"], since: 3 * SECOND };

const column: CSSProperties = { display: "grid", gap: 16, justifyItems: "start", color: "var(--foreground)" };

const meta = {
  title: "Feedback/Porthole",
  component: Porthole,
  parameters: { layout: "padded" },
  args: { label: "Status", source: fixed([], fresh), onAction: () => {}, onDismiss: () => {} },
} satisfies Meta<typeof Porthole>;
export default meta;

type Story = StoryObj<typeof meta>;

/** At rest, every area verified within the last minute. */
export const RestFresh: Story = { render: (args) => <Porthole {...args} source={fixed([], fresh)} /> };

/** At rest, with the calendar last verified four minutes ago: the real age, not "just now". */
export const RestStale: Story = { render: (args) => <Porthole {...args} source={fixed([], { ...fresh, calendar: 4 * MINUTE + 10 * SECOND })} /> };

/** The service's heartbeat stopped 40 seconds ago, so nothing it said can be vouched for. */
export const Unknown: Story = { render: (args) => <Porthole {...args} source={fixed([], fresh, 40 * SECOND)} /> };

/** Working, with its progress. */
export const Working: Story = { render: (args) => <Porthole {...args} source={fixed([sync], fresh)} /> };

/** A problem, which outranks working. */
export const ErrorItem: Story = { render: (args) => <Porthole {...args} source={fixed([offline, sync], fresh)} /> };

/** Something waits for the person, which outranks everything else. */
export const Action: Story = { render: (args) => <Porthole {...args} source={fixed([update, offline], fresh)} /> };

/** News that needs nothing, which the person may dismiss. */
export const UpToDate: Story = { render: (args) => <Porthole {...args} source={fixed([upToDate], fresh)} /> };

/** Every state, top to bottom: rest and fresh, rest and stale, unknown, working, error, and an action. */
export const States: Story = {
  parameters: { screenshot: { name: "porthole-states" } },
  render: (args) => (
    <div style={column}>
      <Porthole {...args} label="Rest, fresh" source={fixed([], fresh)} />
      <Porthole {...args} label="Rest, stale" source={fixed([], { ...fresh, calendar: 4 * MINUTE + 10 * SECOND })} />
      <Porthole {...args} label="Unknown" source={fixed([], fresh, 40 * SECOND)} />
      <Porthole {...args} label="Working" source={fixed([sync], fresh)} />
      <Porthole {...args} label="Error" source={fixed([offline], fresh)} />
      <Porthole {...args} label="Action" source={fixed([update], fresh)} />
    </div>
  ),
};

/** Open: the facts behind the line, with the calendar's read in trouble for a minute. */
export const Open: Story = {
  parameters: { screenshot: { name: "porthole-open" } },
  render: (args) => (
    <div style={{ minHeight: 180 }}>
      <Porthole {...args} defaultOpen source={fixed([], { ...fresh, calendar: 3 * MINUTE }, 0, { calendar: MINUTE })} />
    </div>
  ),
};

/** A pretend service: it beats every second, verifies its areas every 30 seconds, and lets you break it. */
function useService() {
  const [service] = useState(() => {
    const now = Date.now();
    let snapshot: PortholeSnapshot = {
      version: 1,
      items: [],
      areas: {
        chats: { label: "Chats", lastVerifiedAt: now, troubleSince: null },
        calendar: { label: "Calendar", lastVerifiedAt: now, troubleSince: null },
      },
    };
    let beat = now;
    let beating = true;
    const listeners = new Set<() => void>();
    const set = (next: PortholeSnapshot) => {
      snapshot = next;
      for (const listener of listeners) listener();
    };
    const source: PortholeSource = {
      getSnapshot: () => snapshot,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      lastBeatAt: () => beat,
    };
    const tick = () => {
      if (beating) beat = Date.now();
    };
    const verify = () => {
      const at = Date.now();
      const areas = Object.fromEntries(Object.entries(snapshot.areas).map(([id, area]) => [id, area.troubleSince === null ? { ...area, lastVerifiedAt: at } : area]));
      set({ ...snapshot, areas });
    };
    const without = (id: string) => snapshot.items.filter((item) => item.id !== id);
    return {
      source,
      tick,
      verify,
      setBeating: (on: boolean) => {
        beating = on;
        tick();
      },
      setHung: (id: string, hung: boolean) => set({ ...snapshot, areas: { ...snapshot.areas, [id]: { ...snapshot.areas[id]!, troubleSince: hung ? Date.now() : null } } }),
      setOffline: (on: boolean) => set({ ...snapshot, items: on ? [...without("offline"), { ...offline, since: Date.now() }] : without("offline") }),
      offerUpdate: () => set({ ...snapshot, items: [...without("update"), { ...update, since: Date.now() }] }),
      act: (item: PortholeItem) => set({ ...snapshot, items: [...without(item.id), { ...upToDate, since: Date.now() }] }),
      dismiss: (item: PortholeItem) => set({ ...snapshot, items: without(item.id) }),
    };
  });
  useEffect(() => {
    const beats = setInterval(service.tick, SECOND);
    const checks = setInterval(service.verify, 30 * SECOND);
    return () => {
      clearInterval(beats);
      clearInterval(checks);
    };
  }, [service]);
  return service;
}

/**
 * Live, against a pretend service. Stop the heartbeat and it says "Status unknown" within six seconds; hang the
 * calendar and it stops saying "just now" within five; take the service offline for an error, or offer an update.
 */
export const Live: Story = {
  render: function Live(args) {
    const service = useService();
    const [beating, setBeating] = useState(true);
    const [hung, setHung] = useState(false);
    const [down, setDown] = useState(false);
    return (
      <div style={{ ...column, minHeight: 260 }}>
        <Porthole {...args} source={service.source} onAction={service.act} onDismiss={service.dismiss} />
        <Switch label="Heartbeat" checked={beating} onCheckedChange={(on) => (setBeating(on), service.setBeating(on))} />
        <Switch label="Calendar read hangs" checked={hung} onCheckedChange={(on) => (setHung(on), service.setHung("calendar", on))} />
        <Switch label="Service offline" checked={down} onCheckedChange={(on) => (setDown(on), service.setOffline(on))} />
        <Button variant="outline" onClick={service.offerUpdate}>
          Offer an update
        </Button>
      </div>
    );
  },
};
