import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent, type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Calendar } from "@/registry/ouro/components/ouro/calendar/calendar";
import { Dialog } from "@/registry/ouro/components/ouro/dialog/dialog";
import { Heading } from "@/registry/ouro/components/ouro/text/heading";
import { Moment } from "@/registry/ouro/components/ouro/moment/moment";
import { Popover } from "@/registry/ouro/components/ouro/popover/popover";
import { SegmentedControl } from "@/registry/ouro/components/ouro/segmented-control/segmented-control";
import { Select } from "@/registry/ouro/components/ouro/select/select";
import { Text } from "@/registry/ouro/components/ouro/text/text";
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";
import { TimeGrid, type TimeGridEvent, type TimeGridSlot, type TimeGridView } from "@/registry/ouro/components/ouro/time-grid/time-grid";
import { TimeGridNav } from "@/registry/ouro/components/ouro/time-grid/time-grid-parts";
import { Toaster } from "@/registry/ouro/components/ouro/toast/toaster";
import { toast } from "@/registry/ouro/lib/ouro/toast";
import { CodeBlock } from "../components/code";
import { DocsShell } from "../components/docs-shell";
import { TrayArt } from "./tray-art";

// A whole calendar screen from Ouro's parts with made-up events, as an app would assemble it: a week on TimeGrid with a
// Day, Work week and Week switch, a Calendar in a popover to jump to a date, a New event button and a press on an
// empty slot that open a Dialog (a sheet on a phone), an event that opens a popover with Edit and Delete, a delete that
// can be undone from a toast, an empty week, a loading state, a long title and overlapping events. It ships in no
// registry item; docs/calendar-demo/ shows it. The default export is the whole page (the docs shell and lead included),
// so site/src/pages/docs.tsx can load it as one lazy chunk.

type Stage = "week" | "empty" | "loading";
type Kind = "work" | "personal" | "team";

interface Entry extends TimeGridEvent {
  kind: Kind;
}

const kinds: { value: Kind; label: string; tone: "primary" | "success" | "warning" }[] = [
  { value: "work", label: "Work", tone: "primary" },
  { value: "personal", label: "Personal", tone: "success" },
  { value: "team", label: "Team", tone: "warning" },
];

const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const atTime = (day: string, minutes: number) => {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  return new Date(year, month - 1, date, 0, minutes);
};
const minutesOf = (date: Date) => date.getHours() * 60 + date.getMinutes();
const clock = (minutes: number) => new Date(2000, 0, 1, 0, minutes).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

const startOptions = Array.from({ length: 48 }, (_, slot) => ({ value: String(slot * 30), label: clock(slot * 30) }));
const lengthLabel = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hourPart = hours > 0 ? `${hours} ${hours === 1 ? "hour" : "hours"}` : "";
  const minutePart = rest > 0 ? `${rest} minutes` : "";
  return [hourPart, minutePart].filter(Boolean).join(" ");
};
const lengthOptions = [15, 30, 60, 90, 120].map((minutes) => ({ value: String(minutes), label: lengthLabel(minutes) }));

/** A made-up week around the reader's today, so the now line shows. */
function seed(today: string): Entry[] {
  const monday = atTime(today, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const day = (offset: number) => iso(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + offset));
  const entry = (id: string, title: string, offset: number, from: number, to: number, kind: Kind, description?: string): Entry => ({
    id,
    title,
    kind,
    start: atTime(day(offset), from),
    end: atTime(day(offset), to),
    tone: kinds.find((candidate) => candidate.value === kind)?.tone,
    ...(description ? { description } : {}),
  });
  return [
    entry("standup", "Standup", 0, 9 * 60 + 30, 9 * 60 + 45, "team"),
    entry("planning", "Sprint planning", 0, 10 * 60, 11 * 60 + 30, "work", "Room 4"),
    entry("lunch", "Lunch with Maya", 0, 12 * 60, 13 * 60, "personal", "The noodle place"),
    entry("review", "Design review", 1, 11 * 60, 12 * 60, "work", "Room 2"),
    entry("pairing", "Pairing with Jo", 1, 11 * 60 + 30, 13 * 60, "team"),
    entry("sync", "Weekly cross-team sync about the venue, the catering order and the long table", 1, 11 * 60 + 45, 12 * 60 + 30, "work"),
    entry("interview", "Interview: front-end engineer", 2, 14 * 60, 15 * 60, "work"),
    entry("dentist", "Dentist", 3, 8 * 60 + 30, 9 * 60 + 30, "personal"),
    entry("forum", "Architecture forum", 3, 10 * 60, 11 * 60, "team", "Main auditorium"),
    entry("demo", "Demo day", 4, 13 * 60, 15 * 60, "work"),
  ];
}

const subscribeNever = () => () => {};

interface Draft {
  id: string | null;
  day: string;
  title: string;
  start: number;
  length: number;
  kind: Kind;
}

function CalendarDemo(): JSX.Element {
  // The week is the reader's, from their clock and time zone, which the prerender doesn't have: it draws an empty box the
  // height of the grid, and the browser draws the week once it has hydrated, so the two never disagree.
  const hydrated = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  return hydrated ? <Screen /> : <div className="h-160" />;
}

function Screen(): JSX.Element {
  const today = iso(new Date());
  const [date, setDate] = useState(today);
  const [view, setView] = useState<TimeGridView>(() => (window.matchMedia("(max-width: 639px)").matches ? "day" : "work-week"));
  const [stage, setStage] = useState<Stage>("week");
  const [events, setEvents] = useState<Entry[]>(() => seed(today));
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [open, setOpen] = useState<string | null>(null);
  const [jump, setJump] = useState(false);
  const eventRef = useRef<HTMLElement | null>(null);
  const jumpRef = useRef<HTMLButtonElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [refocus, setRefocus] = useState(0);
  // The deleted event's popover has nothing to return focus to, so focus goes to the grid's event stop once the popover is gone.
  useEffect(() => {
    if (refocus === 0) return;
    let frame = 0;
    let tries = 0;
    const settle = () => {
      const target = rootRef.current?.querySelector<HTMLElement>('[data-ouro="time-grid"] [tabindex="0"]');
      const lost = document.activeElement?.matches('body, div:not([tabindex])') ?? true;
      if (target && lost) target.focus({ preventScroll: true });
      if (++tries < 30) frame = requestAnimationFrame(settle);
    };
    frame = requestAnimationFrame(settle);
    return () => cancelAnimationFrame(frame);
  }, [refocus]);
  const formId = useId();

  const shown = stage === "empty" ? [] : events;
  const current = events.find((candidate) => candidate.id === open) ?? null;

  const begin = useCallback((next: Partial<Draft> & { day: string }) => {
    setError(undefined);
    setOpen(null);
    setDraft({ id: null, title: "", start: 9 * 60, length: 60, kind: "work", ...next });
  }, []);

  const newEvent = () => {
    const now = new Date();
    const upcoming = date === today ? Math.min(Math.ceil((minutesOf(now) + 1) / 30) * 30, 23 * 60) : 9 * 60;
    begin({ day: date, start: upcoming });
  };

  const slotPressed = (slot: TimeGridSlot) => begin({ day: iso(slot.start), start: minutesOf(slot.start), length: Math.max(15, Math.round((slot.end.getTime() - slot.start.getTime()) / 60000)) });

  const edit = (entry: Entry) => {
    const start = new Date(entry.start);
    const end = new Date(entry.end ?? start);
    begin({ id: entry.id, day: iso(start), title: entry.title, start: minutesOf(start), length: Math.round((end.getTime() - start.getTime()) / 60000), kind: entry.kind });
  };

  const save = (event?: FormEvent) => {
    event?.preventDefault();
    if (!draft) return;
    const title = draft.title.trim();
    if (!title) {
      setError("Add a title");
      return;
    }
    const tone = kinds.find((candidate) => candidate.value === draft.kind)?.tone;
    const next: Entry = { id: draft.id ?? `new-${Date.now()}`, title, kind: draft.kind, tone, start: atTime(draft.day, draft.start), end: atTime(draft.day, draft.start + draft.length) };
    setEvents((now) => (draft.id ? now.map((candidate) => (candidate.id === draft.id ? { ...candidate, ...next } : candidate)) : [...now, next]));
    if (stage === "empty") setStage("week");
    toast(draft.id ? "Event updated" : "Event created", { tone: "success", description: `${title}, ${clock(draft.start)}` });
    setDraft(null);
  };

  const remove = (entry: Entry) => {
    const at = events.findIndex((candidate) => candidate.id === entry.id);
    setOpen(null);
    setRefocus((count) => count + 1);
    setEvents((now) => now.filter((candidate) => candidate.id !== entry.id));
    // An Undo toast stays until dismissed, so a slow or screen-reader reader can reach it; the demo leaves room under the grid on a phone for it to rest.
    toast("Event deleted", {
      description: entry.title,
      action: {
        label: "Undo",
        onClick: () =>
          setEvents((now) => (now.some((candidate) => candidate.id === entry.id) ? now : [...now.slice(0, at), entry, ...now.slice(at)])),
      },
    });
  };

  const heading = new Date(`${date}T12:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const label = "Calendar";

  return (
    <div ref={rootRef} className="grid w-full grid-cols-1 gap-3 max-sm:pb-24" data-site-calendar-demo="">
      <div className="min-w-0 overflow-x-auto">
        <SegmentedControl
          label="State"
          value={stage}
          onValueChange={(value) => setStage(value as Stage)}
          items={[
            { value: "week", label: "Full week" },
            { value: "empty", label: "Empty week" },
            { value: "loading", label: "Loading" },
          ]}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <TimeGridNav date={date} view={view} onDateChange={setDate} />
        <Heading level={2} size="md" className="me-auto min-w-0 max-sm:order-first max-sm:basis-full">
          {heading}
        </Heading>
        <Button ref={jumpRef} variant="outline" tone="secondary" aria-haspopup="dialog" aria-expanded={jump} onClick={() => setJump(!jump)}>
          Go to date
        </Button>
        <SegmentedControl
          label="View"
          hideLabel
          value={view}
          onValueChange={(value) => setView(value as TimeGridView)}
          items={[
            { value: "day", label: "Day" },
            { value: "work-week", label: "Work week" },
            { value: "week", label: "Week" },
          ]}
        />
        <Button onClick={newEvent}>New event</Button>
      </div>
      <Popover title="Go to date" open={jump} onOpenChange={setJump} anchor={jumpRef} presentation="auto">
        <Calendar
          label="Date to show"
          value={date}
          onValueChange={(next) => {
            setDate(next);
            setJump(false);
          }}
        />
      </Popover>
      {stage === "empty" ? (
        <Moment kind="empty" art={<TrayArt />} title="Nothing on this week" description="Press an empty slot, or New event, to add something." />
      ) : null}
      <div className="h-160 min-h-0 overflow-hidden">
        {stage === "loading" ? (
          <div role="group" aria-label={label} aria-busy="true" className="flex h-full items-center justify-center p-4">
            <Moment kind="loading" announce title="Loading your week" />
          </div>
        ) : (
          <TimeGrid
            label={label}
            date={date}
            view={view}
            events={shown}
            workingHours={{ start: 8, end: 18 }}
            selectedId={open}
            expandedId={open}
            onDateChange={setDate}
            onEventSelect={(event, details) => {
              eventRef.current = details.element;
              setOpen(event.id);
            }}
            onSlotSelect={slotPressed}
            className="h-full"
          />
        )}
      </div>
      <Popover title={current?.title ?? "Event"} open={current !== null} onOpenChange={(next) => !next && setOpen(null)} anchor={eventRef} presentation="auto">
        {current ? (
          <div className="grid gap-3">
            <Text size="sm" tone="muted">
              {new Date(current.start).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}, {clock(minutesOf(new Date(current.start)))} to{" "}
              {clock(minutesOf(new Date(current.end ?? current.start)))}
            </Text>
            <Text size="sm">{kinds.find((candidate) => candidate.value === current.kind)?.label} calendar{current.description ? `, ${current.description}` : ""}</Text>
            <div className="flex flex-row-reverse justify-start gap-2">
              <Button onClick={() => edit(current)}>Edit</Button>
              <Button variant="outline" tone="destructive" onClick={() => remove(current)}>
                Delete
              </Button>
            </div>
          </div>
        ) : null}
      </Popover>
      <Dialog
        open={draft !== null}
        onOpenChange={(next) => !next && setDraft(null)}
        title={draft?.id ? "Edit event" : "New event"}
        description={draft ? new Date(`${draft.day}T12:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : undefined}
        footer={
          <>
            <Button variant="outline" tone="secondary" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button default type="submit" form={formId}>
              {draft?.id ? "Save" : "Create"}
            </Button>
          </>
        }
      >
        {draft ? (
          <form id={formId} noValidate onSubmit={save} className="grid gap-4">
            <TextField label="Title" required value={draft.title} error={error} onValueChange={(title) => { setError(undefined); setDraft({ ...draft, title }); }} />
            <Select label="Starts" value={String(draft.start)} options={startOptions} onValueChange={(value) => value && setDraft({ ...draft, start: Number(value) })} />
            <Select label="Length" value={String(draft.length)} options={lengthOptions} onValueChange={(value) => value && setDraft({ ...draft, length: Number(value) })} />
            <Select label="Calendar" value={draft.kind} options={kinds} onValueChange={(value) => value && setDraft({ ...draft, kind: value as Kind })} />
          </form>
        ) : null}
      </Dialog>
      <Toaster />
    </div>
  );
}

const shortCalendar = `import { useState } from "react";
import { TimeGrid } from "@/components/ouro/time-grid/time-grid";
import { TimeGridNav } from "@/components/ouro/time-grid/time-grid-parts";
import { Dialog } from "@/components/ouro/dialog/dialog";
import { Popover } from "@/components/ouro/popover/popover";
import { toast } from "@/lib/ouro/toast";

export function Schedule({ events, create, remove, restore }) {
  const [date, setDate] = useState("2026-03-12");
  const [slot, setSlot] = useState(null);
  return (
    <>
      <TimeGridNav date={date} view="week" onDateChange={setDate} />
      <TimeGrid label="Calendar" date={date} view="week" events={events} onDateChange={setDate} onSlotSelect={setSlot} />
      <Dialog open={slot !== null} onOpenChange={() => setSlot(null)} title="New event" footer={<Button onClick={() => create(slot)}>Create</Button>}>
        <TextField label="Title" />
      </Dialog>
    </>
  );
}`;

/** The docs/calendar-demo/ page: the demo behind its own lazy chunk, lead text and shell included. */
export default function CalendarDemoPage(): JSX.Element {
  return (
    <DocsShell current="/docs/calendar-demo/" opener={{ scene: "ouroboros-skills", eyebrow: "Guides", title: "A calendar" }}>
      <Text size="lg" tone="muted" className="mb-10 max-w-2xl text-pretty" data-ouro-measure="">
        The calendar parts together, with made-up events in the week you open the page: a day, work week or week on TimeGrid, a Calendar in a popover to jump to a date, New event
        and a press on an empty slot that open a dialog (a sheet on a phone), an event that opens its details with Edit and Delete, and a delete you can undo from a toast.
        The State switcher shows an empty week and a loading state; the events, the Go to date button, the heading and the form are the demo's own. An app supplies the real ones.
        TimeGrid shows a day or a week, so a month is for the Calendar. Try the keyboard, a narrow window and dark mode.
      </Text>
      <CalendarDemo />
      <Heading level={2} className="mt-12 mb-4">
        A short assembly
      </Heading>
      <CodeBlock label="Calendar" code={shortCalendar} copy />
    </DocsShell>
  );
}
