import type { JSX } from "react";
import { EventChip } from "@/registry/ouro/components/ouro/event-chip/event-chip";

// The live demo at the top of docs/event-chip/: the component as an app would use it, with its props, nothing else.

export default function EventChipDemo(): JSX.Element {
  return (
    <div className="flex flex-wrap gap-3">
      <EventChip label="Next meeting" when="in 12 min" title="Weekly sync" state="soon" status="Needs you" statusTone="warning" href="#weekly-sync" />
      <EventChip label="Later" when="Tomorrow 9:00" title="Design review" status="Ready" statusTone="success" href="#design-review" />
    </div>
  );
}
