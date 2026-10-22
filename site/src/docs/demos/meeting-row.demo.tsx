import type { JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { MeetingRow } from "@/registry/ouro/components/ouro/meeting-row/meeting-row";

// The live demo at the top of docs/meeting-row/: the component as an app would use it, with its props, nothing else.

export default function MeetingRowDemo(): JSX.Element {
  return (
    <div className="grid max-w-sm gap-1">
      <MeetingRow title="Standup" time="09:00" duration="15 min" state="past" />
      <MeetingRow title="Weekly sync" time="10:00" duration="30 min" state="now" status="Organizer" statusTone="primary" actions={<Button size="sm">Join</Button>} />
      <MeetingRow title="Design review" time="13:30" duration="1 h" state="upcoming" status="Tentative" statusTone="warning" detail="Room 4" />
    </div>
  );
}
