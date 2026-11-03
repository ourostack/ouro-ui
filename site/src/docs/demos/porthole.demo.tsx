import { useEffect, useState, type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Porthole } from "@/registry/ouro/components/ouro/porthole/porthole";
import { Switch } from "@/registry/ouro/components/ouro/switch/switch";
import type { PortholeItem, PortholeSnapshot, PortholeSource } from "@/registry/ouro/lib/ouro/porthole-view";

// The live demo at the top of docs/porthole/: the status spot against a pretend service that beats every second.
// Stop the heartbeat, hang a read, or offer an update, and watch what it says.

function pretendService() {
  let snapshot: PortholeSnapshot = {
    version: 1,
    items: [],
    areas: { chats: { label: "Chats", lastVerifiedAt: Date.now(), troubleSince: null }, calendar: { label: "Calendar", lastVerifiedAt: Date.now(), troubleSince: null } },
  };
  let beat = Date.now();
  let beating = true;
  const listeners = new Set<() => void>();
  const send = (next: PortholeSnapshot) => {
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
  const others = (id: string) => snapshot.items.filter((item) => item.id !== id);
  return {
    source,
    tick: () => {
      if (beating) beat = Date.now();
    },
    setBeating: (on: boolean) => {
      beating = on;
      beat = Date.now();
    },
    setHung: (on: boolean) => send({ ...snapshot, areas: { ...snapshot.areas, calendar: { label: "Calendar", lastVerifiedAt: snapshot.areas["calendar"]!.lastVerifiedAt, troubleSince: on ? Date.now() : null } } }),
    offerUpdate: () => send({ ...snapshot, items: [...others("update"), { id: "update", priority: "action", label: "Version 2.4 is ready", action: { id: "restart", label: "Restart" }, since: Date.now() }] }),
    restart: () => send({ ...snapshot, items: [...others("update"), { id: "update", priority: "rest", label: "Up to date", dismissable: true, since: Date.now() }] }),
    dismiss: (item: PortholeItem) => send({ ...snapshot, items: others(item.id) }),
  };
}

export default function PortholeDemo(): JSX.Element {
  const [service] = useState(pretendService);
  const [beating, setBeating] = useState(true);
  const [hung, setHung] = useState(false);
  useEffect(() => {
    const beats = setInterval(service.tick, 1_000);
    return () => clearInterval(beats);
  }, [service]);
  return (
    <div className="grid min-h-56 justify-items-start gap-3">
      <Porthole source={service.source} label="Status" onAction={service.restart} onDismiss={service.dismiss} />
      <Switch label="Heartbeat" checked={beating} onCheckedChange={(on) => (setBeating(on), service.setBeating(on))} />
      <Switch label="Calendar read hangs" checked={hung} onCheckedChange={(on) => (setHung(on), service.setHung(on))} />
      <Button variant="outline" onClick={service.offerUpdate}>
        Offer an update
      </Button>
    </div>
  );
}
