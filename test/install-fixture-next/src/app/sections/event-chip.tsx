import { EventChip } from "@/components/ouro/event-chip/event-chip";

// expect: data-ouro-event-chip
// expect: data-state="soon"
// expect: Ouro weekly sync
export default function EventChipSection() {
  return <EventChip label="Next meeting" when="in 12 min" title="Ouro weekly sync" state="soon" status="Ready" href="/meetings/sync" />;
}
