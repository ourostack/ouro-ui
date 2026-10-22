// What agents write with event-chip: snippets whose cases are in event-chip.cases.ts.
import { EventChip } from "@/registry/ouro/components/ouro/event-chip/event-chip";

export const eventChip01 = <EventChip title="Weekly sync" when="in 12 min" soon />;
export const eventChip02 = <EventChip title="Weekly sync" when="in 12 min" onOpen={() => {}} />;
export const eventChipOk01 = <EventChip title="Weekly sync" when="in 12 min" state="soon" status="Ready" statusTone="success" label="Next meeting" href="/meetings/sync" className="max-w-80" />;
