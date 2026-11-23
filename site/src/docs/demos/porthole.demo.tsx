import { useState, type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Porthole } from "@/registry/ouro/components/ouro/porthole/porthole";
import { Switch } from "@/registry/ouro/components/ouro/switch/switch";
import type { PortholeItem, PortholeSnapshot, PortholeSource } from "@/registry/ouro/lib/ouro/porthole-view";

// The live demo at the top of docs/porthole/: the status spot against a pretend service that beats every second.
// Stop the heartbeat, hang a read, or offer an update, and watch what it says.

// An area that is not hung is always "verified now": like the heartbeat below, it needs no interval to stay fresh,
// so a page an automated sweep revisits, or a build slow enough to let real seconds pass between a hover picture's
// two takes, never catches an age that grew past a minute and flipped its line only there (ourostack/ouro-ui#3021).
function verifiedArea(label: string, troubleSince: number | null = null) {
  return {
    label,
    get lastVerifiedAt() {
      return Date.now();
    },
    troubleSince,
  };
}

function pretendService() {
  let snapshot: PortholeSnapshot = {
    version: 1,
    items: [],
    areas: { chats: verifiedArea("Chats"), calendar: verifiedArea("Calendar") },
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
    // A live heartbeat is always "now": it needs no interval to keep it fresh, so a page an automated sweep
    // revisits (or a build slow enough to let real seconds pass between a hover picture's two takes) never
    // catches a beat that fell behind and only later caught up (ourostack/ouro-ui#2879).
    lastBeatAt: () => (beating ? Date.now() : beat),
  };
  const others = (id: string) => snapshot.items.filter((item) => item.id !== id);
  return {
    source,
    setBeating: (on: boolean) => {
      beating = on;
      if (!on) beat = Date.now();
    },
    setHung: (on: boolean) => send({ ...snapshot, areas: { ...snapshot.areas, calendar: verifiedArea("Calendar", on ? Date.now() : null) } }),
    offerUpdate: () => send({ ...snapshot, items: [...others("update"), { id: "update", priority: "action", label: "Version 2.4 is ready", action: { id: "restart", label: "Restart" }, since: Date.now() }] }),
    restart: () => send({ ...snapshot, items: [...others("update"), { id: "update", priority: "rest", label: "Updated to version 2.4", dismissable: true, since: Date.now() }] }),
    dismiss: (item: PortholeItem) => send({ ...snapshot, items: others(item.id) }),
  };
}

export default function PortholeDemo(): JSX.Element {
  const [service] = useState(pretendService);
  const [beating, setBeating] = useState(true);
  const [hung, setHung] = useState(false);
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
