import { useEffect, useRef, useState, type JSX } from "react";
import { Switch } from "@/registry/ouro/components/ouro/switch/switch";
import { SyncStatus, type SyncState } from "@/registry/ouro/components/ouro/sync-status/sync-status";
import { TextArea } from "@/registry/ouro/components/ouro/text-field/text-area";

// The live demo at the top of docs/sync-status/: the component as an app would use it, with its props, nothing else.
// The save is simulated: typing saves after a moment, and the switch stands in for the connection.

export default function SyncStatusDemo(): JSX.Element {
  const [online, setOnline] = useState(true);
  const [status, setStatus] = useState<SyncState>("saved");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const save = (connected: boolean) => {
    clearTimeout(timer.current);
    if (!connected) return setStatus("offline");
    setStatus("saving");
    timer.current = setTimeout(() => setStatus("saved"), 700);
  };
  return (
    <div className="grid max-w-sm gap-3">
      <TextArea label="Trail notes" defaultValue="Ridge path closed past the second bridge." onChange={() => save(online)} />
      <SyncStatus status={status} onRetry={() => save(online)} />
      <Switch
        label="Connected"
        checked={online}
        onCheckedChange={(next) => {
          setOnline(next);
          if (!next) setStatus("offline");
        }}
      />
    </div>
  );
}
