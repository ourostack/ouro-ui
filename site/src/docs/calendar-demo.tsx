import { useCallback, useEffect, useLayoutEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type JSX, type RefObject } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Calendar } from "@/registry/ouro/components/ouro/calendar/calendar";
import { Dialog } from "@/registry/ouro/components/ouro/dialog/dialog";
import { Heading } from "@/registry/ouro/components/ouro/text/heading";
import { Moment } from "@/registry/ouro/components/ouro/moment/moment";
import { Popover } from "@/registry/ouro/components/ouro/popover/popover";
import { SegmentedControl } from "@/registry/ouro/components/ouro/segmented-control/segmented-control";
import { Skeleton } from "@/registry/ouro/components/ouro/skeleton/skeleton";
import { Select } from "@/registry/ouro/components/ouro/select/select";
import { Text } from "@/registry/ouro/components/ouro/text/text";
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";
import { TimeGrid, type TimeGridEvent, type TimeGridSlot, type TimeGridView } from "@/registry/ouro/components/ouro/time-grid/time-grid";
import { TimeGridNav } from "@/registry/ouro/components/ouro/time-grid/time-grid-parts";
import { Toaster } from "@/registry/ouro/components/ouro/toast/toaster";
import { toast } from "@/registry/ouro/lib/ouro/toast";
import { useMediaQuery } from "@/registry/ouro/lib/ouro/use-media-query";
import { CodeBlock } from "../components/code";
import { DocsShell } from "../components/docs-shell";
import { SpotArt } from "./spot-art";

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
const presetLengths = [15, 30, 60, 90, 120];
// A dragged range can be any length, so the Select lists it with the presets instead of showing a bare number.
const lengthChoices = (current: number) =>
  (presetLengths.includes(current) ? presetLengths : [...presetLengths, current].sort((a, b) => a - b)).map((minutes) => ({ value: String(minutes), label: lengthLabel(minutes) }));

/** Weeks start on Monday in both the week view and the date picker, as the work week does. */
const weekLocale = "en-US-u-fw-mon";

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

const stateItems = [
  { value: "week", label: "Full week" },
  { value: "empty", label: "Empty week" },
  { value: "loading", label: "Loading" },
];
const viewItems = [
  { value: "day", label: "Day" },
  { value: "work-week", label: "Work week" },
  { value: "week", label: "Week" },
];

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
  const phone = useMediaQuery("(max-width: 639px)", false);
  const coarse = useMediaQuery("(pointer: coarse)", false);
  const [stage, setStage] = useState<Stage>("week");
  const [events, setEvents] = useState<Entry[]>(() => seed(today));
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [open, setOpen] = useState<string | null>(null);
  const [jump, setJump] = useState(false);
  const eventRef = useRef<HTMLElement | null>(null);
  const jumpRef = useRef<HTMLButtonElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [fit, setFit] = useState(0);
  const tight = fit > 0;
  // Below 18rem the State control becomes a Select; below 13.5rem the View control goes and the grid shows a day, as on a phone.
  const narrow = phone || fit > 1;
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => {
      const rem = root.clientWidth / parseFloat(getComputedStyle(document.documentElement).fontSize);
      setFit(rem < 13.5 ? 2 : rem < 18 ? 1 : 0);
    };
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(root);
    return () => watch.disconnect();
  }, []);
  // A delete, a save or a date pick hands focus to the grid's event stop as its overlay closes; any other close returns focus to where it was opened from.
  const toGrid = useRef(false);
  const stopOfGrid = () => rootRef.current?.querySelector<HTMLElement>('[data-ouro="time-grid"] [tabindex="0"]') ?? null;
  const eventReturn = useMemo<RefObject<HTMLElement | null>>(() => ({ get current() { return toGrid.current ? stopOfGrid() : eventRef.current; } }), []);
  const jumpReturn = useMemo<RefObject<HTMLElement | null>>(() => ({ get current() { return toGrid.current ? stopOfGrid() : jumpRef.current; } }), []);
  const formId = useId();
  // At large text the message below the input sits past the scrolled body's edge, under the footer, so it scrolls in once it is drawn and again whenever the sheet or its footer changes size, as they do while the sheet settles.
  useEffect(() => {
    if (!error) return;
    const form = document.getElementById(formId);
    const show = () => form?.querySelector("input")?.getAttribute("aria-describedby")?.split(" ").forEach((id) => {
      const message = document.getElementById(id);
      // A whole pixel of margin, because scrolling stops on whole pixels and a fractional line height would leave the last sliver under the footer.
      if (message) message.style.scrollMarginBlockEnd = "1px";
      message?.scrollIntoView({ block: "nearest" });
    });
    show();
    const observer = new ResizeObserver(show);
    const popup = form?.closest("[role=dialog]");
    if (popup) observer.observe(popup, { box: "border-box" });
    const footer = popup?.querySelector("[data-ouro-footer]");
    if (footer) observer.observe(footer, { box: "border-box" });
    // A slide or scale moves the message without resizing anything, so a settle that ends later needs its own scroll.
    popup?.addEventListener("transitionend", show);
    return () => {
      observer.disconnect();
      popup?.removeEventListener("transitionend", show);
    };
  }, [error, formId]);

  const shown = stage === "empty" ? [] : events;
  const current = events.find((candidate) => candidate.id === open) ?? null;

  const begin = useCallback((next: Partial<Draft> & { day: string }) => {
    setError(undefined);
    setOpen(null);
    setDraft({ id: null, title: "", start: 9 * 60, length: 60, kind: "work", ...next });
  }, []);

  const newEvent = () => {
    toast.dismiss();
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
      const input = document.getElementById(formId)?.querySelector<HTMLElement>("input");
      input?.focus();
      return;
    }
    const tone = kinds.find((candidate) => candidate.value === draft.kind)?.tone;
    const next: Entry = { id: draft.id ?? `new-${Date.now()}`, title, kind: draft.kind, tone, start: atTime(draft.day, draft.start), end: atTime(draft.day, draft.start + draft.length) };
    setEvents((now) => (draft.id ? now.map((candidate) => (candidate.id === draft.id ? { ...candidate, ...next } : candidate)) : [...now, next]));
    if (stage === "empty") setStage("week");
    toast.dismiss();
    toast(draft.id ? "Event updated" : "Event created", { tone: "success", description: `${title}, ${clock(draft.start)}` });
    toGrid.current = true;
    setDraft(null);
  };

  const lastRemoved = useRef<{ entry: Entry; at: number } | null>(null);
  const restore = (entry: Entry, at: number) => {
    lastRemoved.current = null;
    setEvents((now) => (now.some((candidate) => candidate.id === entry.id) ? now : [...now.slice(0, at), entry, ...now.slice(at)]));
    setRestored({ id: entry.id });
  };
  const [restored, setRestored] = useState<{ id: string } | null>(null);
  // The restored event is drawn on the next render, so focus waits for it.
  useEffect(() => {
    if (!restored) return;
    let frame = 0;
    let tries = 0;
    const settle = () => {
      const target = rootRef.current?.querySelector<HTMLElement>(`[data-ouro-event-key$=":${CSS.escape(restored.id)}"]`);
      if (target) target.focus({ preventScroll: true });
      else if (++tries < 30) frame = requestAnimationFrame(settle);
    };
    frame = requestAnimationFrame(settle);
    return () => cancelAnimationFrame(frame);
  }, [restored]);

  const remove = (entry: Entry) => {
    const at = events.findIndex((candidate) => candidate.id === entry.id);
    lastRemoved.current = { entry, at };
    // With the details open, its overlay hands focus to the grid as it closes; from the keyboard there is no overlay, so the grid takes it once the event is gone.
    if (current === null) requestAnimationFrame(() => stopOfGrid()?.focus({ preventScroll: true }));
    toGrid.current = current !== null;
    setOpen(null);
    setEvents((now) => now.filter((candidate) => candidate.id !== entry.id));
    // One toast at a time, so a second delete replaces the first. It lasts 8 s, longer than the default, and hovering or focusing it holds the countdown; the demo leaves room under the grid on a phone for it to rest.
    toast.dismiss();
    toast("Event deleted", {
      description: coarse ? entry.title : `${entry.title}. Ctrl or Cmd+Z also undoes it.`,
      duration: 8000,
      action: {
        label: "Undo",
        onClick: () => restore(entry, at),
      },
    });
  };

  const heading = new Date(`${date}T12:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const label = "Calendar";

  return (
    <div
      ref={rootRef}
      className="grid w-full grid-cols-1 gap-3 max-sm:pb-24"
      data-site-calendar-demo=""
      onKeyDown={(event) => {
        const target = event.target as HTMLElement;
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && lastRemoved.current && !target.closest("input, textarea")) {
          event.preventDefault();
          restore(lastRemoved.current.entry, lastRemoved.current.at);
          return;
        }
        const key = target.dataset.ouroEventKey;
        if ((event.key === "Delete" || event.key === "Backspace") && key && !target.matches('[data-ouro-part="more"]')) {
          const entry = events.find((candidate) => candidate.id === key.slice(key.lastIndexOf(":") + 1));
          if (entry) {
            event.preventDefault();
            remove(entry);
          }
        }
      }}
    >
      <div className="min-w-0">
        {tight ? (
          <Select label="State" className="w-full" value={stage} onValueChange={(value) => setStage(value as Stage)} options={stateItems} />
        ) : (
          <SegmentedControl label="State" value={stage} onValueChange={(value) => setStage(value as Stage)} items={stateItems} />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <TimeGridNav className="max-w-full flex-wrap" date={date} view={narrow ? "day" : view} onDateChange={setDate} disabled={stage === "loading"} />
        <Heading level={2} size="md" className="me-auto min-w-0 max-sm:order-first max-sm:basis-full">
          {heading}
        </Heading>
        <div className="flex max-w-full min-w-0 flex-wrap items-center gap-2" data-slot="calendar-demo-actions">
        <Button ref={jumpRef} variant="outline" tone="secondary" size="sm" aria-haspopup="dialog" aria-expanded={jump} onClick={() => {
            toGrid.current = false;
            setJump(!jump);
          }}>
          Go to date
        </Button>
        {narrow ? null : (
          <div className="max-w-full min-w-0">
            <SegmentedControl label="View" hideLabel value={view} onValueChange={(value) => setView(value as TimeGridView)} items={viewItems} />
          </div>
        )}
        <Button size="sm" onClick={newEvent}>New event</Button>
        </div>
      </div>
      <Popover title="Go to date" open={jump} onOpenChange={setJump} anchor={jumpRef} finalFocus={jumpReturn} presentation="auto">
        <Calendar
          label="Date to show"
          locale={weekLocale}
          value={date}
          onValueChange={(next) => {
            setDate(next);
            setJump(false);
            toGrid.current = true;
          }}
        />
      </Popover>
      {stage === "empty" ? (
        <Moment kind="empty" size="hero" art={<SpotArt name="empty-week" />} title="Nothing on this week" description="Press an empty slot, or New event, to add something." />
      ) : null}
      <span role="status" className="sr-only">{stage === "loading" ? "Loading your week" : ""}</span>
      <div className="h-160 min-h-0 overflow-hidden" style={{ overflowX: "auto" }}>
        {stage === "loading" ? (
          <div role="group" aria-label={label} aria-busy="true" data-site-week-skeleton="" className="grid h-full content-start gap-3 p-4" style={{ gridTemplateColumns: `repeat(${phone ? 1 : view === "day" ? 1 : view === "week" ? 7 : 5}, minmax(0, 1fr))` }}>
            {Array.from({ length: phone ? 1 : view === "day" ? 1 : view === "week" ? 7 : 5 }, (_, day) => (
              <div key={day} className="grid content-start gap-3">
                <Skeleton shape="text" size="sm" />
                <Skeleton className="h-16" />
                <Skeleton className="h-24" />
                <Skeleton className="h-12" />
              </div>
            ))}
          </div>
        ) : (
          <div className="h-full [--ouro-scroller-surface:var(--accent)]" style={narrow ? undefined : { minWidth: "36rem" }}>
          <TimeGrid
            label={label}
            date={date}
            view={narrow ? "day" : view}
            locale={weekLocale}
            // An empty week has nothing to mark the time against, so the now line stays off it.
            now={stage === "empty" ? "1970-01-01T00:00:00Z" : undefined}
            events={shown}
            workingHours={{ start: 8, end: 18 }}
            selectedId={open}
            expandedId={open}
            onDateChange={setDate}
            onEventSelect={(event, details) => {
              eventRef.current = details.element;
              toGrid.current = false;
              setOpen(event.id);
            }}
            onSlotSelect={slotPressed}
            className="h-full"
          />
          </div>
        )}
      </div>
      <Popover title={current?.title ?? "Event"} open={current !== null} onOpenChange={(next) => !next && setOpen(null)} anchor={eventRef} finalFocus={eventReturn} presentation="auto">
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
        onOpenChangeComplete={(next) => {
          if (next || !toGrid.current) return;
          toGrid.current = false;
          stopOfGrid()?.focus({ preventScroll: true });
        }}
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
            <Select label="Length" value={String(draft.length)} options={lengthChoices(draft.length)} onValueChange={(value) => value && setDraft({ ...draft, length: Number(value) })} />
            <Select label="Calendar" value={draft.kind} options={kinds} onValueChange={(value) => value && setDraft({ ...draft, kind: value as Kind })} />
          </form>
        ) : null}
      </Dialog>
      {/* The Go to date sheet fills the phone's lower half, so the toast hangs from the top while it is open and Undo stays visible and clear of the date rows. */}
      <Toaster className={jump && phone ? "top-4 bottom-auto" : undefined} />
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
