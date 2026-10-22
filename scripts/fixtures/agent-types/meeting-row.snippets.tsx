// What agents write with meeting-row: snippets whose cases are in meeting-row.cases.ts.
import { MeetingRow } from "@/registry/ouro/components/ouro/meeting-row/meeting-row";

export const meetingRow01 = <MeetingRow title="Weekly sync" time="10:00" state="upcoming" subject="Weekly sync" />;
export const meetingRow02 = <MeetingRow title="Weekly sync" time="10:00" state="live" />;
export const meetingRowOk01 = <MeetingRow title="Weekly sync" time="10:00" dateTime="2026-06-01T10:00" duration="30 min" state="now" status="Organizer" statusTone="primary" detail="Room 4" actions={null} nowLabel="Now" className="mt-1" />;
