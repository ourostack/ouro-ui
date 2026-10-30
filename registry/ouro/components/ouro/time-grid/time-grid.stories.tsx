import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type CSSProperties, type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { SegmentedControl } from "@/registry/ouro/components/ouro/segmented-control/segmented-control";
import { TimeGrid, type TimeGridEvent, type TimeGridView } from "@/registry/ouro/components/ouro/time-grid/time-grid";
import { addDays } from "@/registry/ouro/components/ouro/calendar/calendar-styles";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names). The stories show
// a made-up team's week in March 2026, in New York's time zone with the clock held at 10:41 on
// Thursday the 12th, so the now line and today's mark never move a screenshot.

const zone = "America/New_York";
const now = "2026-03-12T10:41:00-04:00";
const at = (day: number, time: string) => `2026-03-${String(day).padStart(2, "0")}T${time}:00-04:00`;

/** A made-up team's week: overlaps, short meetings, every status, all-day and multi-day events. */
const week: TimeGridEvent[] = [
  { id: "offsite", title: "Team offsite", start: "2026-03-10", end: "2026-03-11", tone: "success", description: "Harbour Hall" },
  { id: "holiday", title: "Office closed", start: "2026-03-13", tone: "secondary" },
  { id: "standup-9", title: "Standup", start: at(9, "09:30"), end: at(9, "09:45") },
  { id: "plan", title: "Sprint planning", start: at(9, "10:00"), end: at(9, "11:30"), description: "Room 4" },
  { id: "lunch-9", title: "Lunch with Maya", start: at(9, "12:00"), end: at(9, "13:00"), status: "free", tone: "secondary" },
  { id: "standup-10", title: "Standup", start: at(10, "09:30"), end: at(10, "09:45") },
  { id: "interview", title: "Interview: front-end engineer", start: at(10, "14:00"), end: at(10, "15:00"), tone: "warning", description: "Video call" },
  { id: "standup-11", title: "Standup", start: at(11, "09:30"), end: at(11, "09:45") },
  { id: "design", title: "Design review: onboarding flow", start: at(11, "11:00"), end: at(11, "12:00"), description: "Room 2" },
  { id: "pairing", title: "Pairing with Sam", start: at(11, "11:30"), end: at(11, "13:00"), status: "tentative" },
  { id: "budget", title: "Budget check-in", start: at(11, "12:00"), end: at(11, "12:30"), tone: "destructive" },
  { id: "standup-12", title: "Standup", start: at(12, "09:30"), end: at(12, "09:45") },
  { id: "forum", title: "Architecture forum", start: at(12, "10:00"), end: at(12, "11:00"), status: "unanswered", description: "Main auditorium" },
  { id: "focus", title: "Focus time", start: at(12, "10:30"), end: at(12, "12:00"), tone: "secondary" },
  { id: "launch", title: "Launch rehearsal", start: at(12, "13:00"), end: at(12, "14:30"), tone: "success", description: "Room 4" },
  { id: "retro", title: "Retro", start: at(12, "15:00"), end: at(12, "16:00"), status: "cancelled" },
  { id: "late", title: "Call with the Sydney office", start: at(12, "18:30"), end: at(12, "19:15"), status: "tentative" },
  { id: "demo", title: "Demo day", start: at(13, "13:00"), end: at(13, "15:00"), tone: "success" },
];

const meta = {
  title: "Data/TimeGrid",
  component: TimeGrid,
  parameters: { layout: "padded" },
  args: { label: "Team calendar", date: "2026-03-12", events: week, timeZone: zone, now, className: "h-[36rem]" },
  argTypes: {
    view: { control: "inline-radio", options: ["day", "work-week", "week"] },
    locale: { control: "inline-radio", options: ["en-US", "en-GB", "de-DE", "ja-JP"] },
  },
} satisfies Meta<typeof TimeGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A week: overlapping meetings side by side, all-day events on top, and the now line across Thursday. */
export const Playground: Story = {
  parameters: { screenshot: { name: "time-grid" } },
};

const caption: CSSProperties = { margin: "8px 0 0", fontSize: "12px", lineHeight: "16px", color: "var(--muted-foreground)" };

/** The work week, with a pressed event selected: the app keeps the selection and shows what it opens. */
export const WorkWeek: Story = {
  render: function Render(args) {
    const [selected, setSelected] = useState<TimeGridEvent | null>(null);
    return (
      <div>
        <TimeGrid {...args} view="work-week" selectedId={selected?.id ?? null} onEventSelect={setSelected} />
        <p style={caption}>{selected ? `Opened ${selected.title}` : "Press an event, or Tab to the grid and use the arrow keys"}</p>
      </div>
    );
  },
};

/** One day. A press on an empty slot adds an event there; a mouse shows the slot first. */
export const Day: Story = {
  render: function Render(args) {
    const [events, setEvents] = useState<TimeGridEvent[]>(week);
    return (
      <TimeGrid
        {...args}
        view="day"
        events={events}
        onSlotSelect={({ start, end }) => setEvents((list) => [...list, { id: `new-${list.length}`, title: "New event", start, end, status: "tentative" }])}
      />
    );
  },
};

/** Every status, in each tone. Screen readers hear the status after the title. */
export const Statuses: Story = {
  args: {
    view: "day",
    workingHours: { start: 9, end: 18 },
    events: (["busy", "tentative", "free", "unanswered", "cancelled"] as const).flatMap((status, row) =>
      (["primary", "secondary", "success", "warning", "destructive"] as const).map((tone, column) => ({
        id: `${status}-${tone}`,
        title: `${status} ${tone}`,
        start: at(12, `${String(9 + row * 2).padStart(2, "0")}:00`),
        end: at(12, `${String(10 + row * 2).padStart(2, "0")}:${column === 0 ? "30" : "00"}`),
        status,
        tone,
      })),
    ),
  },
};

/** Events with `href` are links to their pages. */
export const Links: Story = {
  args: {
    view: "day",
    events: [
      { id: "forum", title: "Architecture forum", start: at(12, "10:00"), end: at(12, "11:00"), href: "#forum", description: "Main auditorium" },
      { id: "launch", title: "Launch rehearsal", start: at(12, "13:00"), end: at(12, "14:30"), href: "#launch", tone: "success" },
    ],
  },
  parameters: { mode: "link" },
};

/** The locale sets the day names, the hours and the first day of the week; a right-to-left page mirrors the grid. */
export const Locales: Story = {
  render: (args) => (
    <div style={{ display: "grid", gap: 24 }}>
      <TimeGrid {...args} label="Teamkalender" locale="de-DE" allDayLabel="Ganztägig" className="h-[20rem]" />
      <TimeGrid {...args} label="チームの予定" locale="ja-JP" view="work-week" allDayLabel="終日" className="h-[20rem]" />
      <div dir="rtl">
        <TimeGrid {...args} label="تقويم الفريق" locale="ar-EG" view="work-week" allDayLabel="طوال اليوم" className="h-[20rem]" />
      </div>
    </div>
  ),
};

/** A sun rides the now line in the hours column. */
export const NowAdornment: Story = {
  args: {
    view: "day",
    nowAdornment: (
      <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ color: "var(--warning)", display: "block" }}>
        <circle cx="8" cy="8" r="3" />
        <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" />
      </svg>
    ),
  },
};

/** A chevron drawn in the text colour, mirrored in a right-to-left page. */
function Chevron({ d }: { d: string }): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="rtl:-scale-x-100">
      <path d={d} />
    </svg>
  );
}

const toolbar: CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 12, color: "var(--foreground)" };

/** The app's own toolbar around the grid: Today, Previous and Next move `date`; the segmented control sets `view`. */
export const WithToolbar: Story = {
  render: function Render(args): JSX.Element {
    const [date, setDate] = useState("2026-03-12");
    const [view, setView] = useState<TimeGridView>("work-week");
    const stepDays = view === "day" ? 1 : 7;
    return (
      <div>
        <div style={toolbar}>
          <Button variant="outline" size="sm" onClick={() => setDate("2026-03-12")}>
            Today
          </Button>
          <Button variant="plain" tone="secondary" size="sm" aria-label={view === "day" ? "Previous day" : "Previous week"} onClick={() => setDate((day) => addDays(day, -stepDays))}>
            <Chevron d="M10 3.5L5.5 8l4.5 4.5" />
          </Button>
          <Button variant="plain" tone="secondary" size="sm" aria-label={view === "day" ? "Next day" : "Next week"} onClick={() => setDate((day) => addDays(day, stepDays))}>
            <Chevron d="M6 3.5L10.5 8 6 12.5" />
          </Button>
          <SegmentedControl
            label="View"
            hideLabel
            items={[
              { value: "day", label: "Day" },
              { value: "work-week", label: "Work week" },
              { value: "week", label: "Week" },
            ]}
            value={view}
            onValueChange={(value) => setView(value as TimeGridView)}
          />
        </div>
        <TimeGrid {...args} date={date} view={view} />
      </div>
    );
  },
};
