import { createContext, memo, startTransition, use, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition, type FormEvent, type JSX, type ReactNode, type Ref } from "react";
import { Avatar } from "@/registry/ouro/components/ouro/avatar/avatar";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Checkbox } from "@/registry/ouro/components/ouro/checkbox/checkbox";
import { Checklist } from "@/registry/ouro/components/ouro/checklist/checklist";
import { Form, type FormErrors } from "@/registry/ouro/components/ouro/form/form";
import { Item } from "@/registry/ouro/components/ouro/item/item";
import { ItemGroup } from "@/registry/ouro/components/ouro/item/item-group";
import { Link } from "@/registry/ouro/components/ouro/link/link";
import { Progress } from "@/registry/ouro/components/ouro/progress/progress";
import { Reorderable } from "@/registry/ouro/components/ouro/reorderable/reorderable";
import { Select } from "@/registry/ouro/components/ouro/select/select";
import { Sheet } from "@/registry/ouro/components/ouro/sheet/sheet";
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";
import { formErrors } from "@/registry/ouro/lib/ouro/form-answer";
import { toast } from "@/registry/ouro/lib/ouro/toast";
import blueprintSource from "../../nautilus/art/nautilus-blueprint.svg?raw";
import dividersSource from "../../nautilus/art/dividers.svg?raw";
import islandSource from "../../nautilus/art/island-yard.svg?raw";
import { GITHUB } from "../../paths";
import { afterPaint, useAfterPaint } from "../after-paint";
import { keepClearOfToasts } from "../clear-of-toasts";
import { Container } from "../layout";
import { useStable } from "../use-stable";
import { parseArt } from "../stage/art";
import type { CrewName } from "../stage/copy";
import { ARTICLES, CHAPTER_ONE, CODE_SHEETS, CREW, EXPEDITION, PARTS, SHIPYARD, SIGN, START_ORDER, TRADES, YARD, type CrewLine, type PartId, type SheetLine } from "./copy";
// What only changes once the chapter answers (each part drawn in, the launch, the yard's picture,
// the crew's cheer): it comes inside this island's script and goes into the page as the island
// hydrates, so it costs the first paint nothing and holds up no part of the island's loading.
import chapterStyles from "./chapter-one.css?inline";

const blueprint = parseArt(blueprintSource);
const dividers = parseArt(dividersSource);
const island = parseArt(islandSource);

/** How the voyage stands: the shipyard and the articles write it, the rail beside them reads it. */
interface Voyage {
  built: ReadonlySet<PartId>;
  launched: boolean;
  you: { name: string; trade: string } | null;
}

function createVoyage() {
  let state: Voyage = { built: new Set(), launched: false, you: null };
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(next: Partial<Voyage>) {
      state = { ...state, ...next };
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
type VoyageStore = ReturnType<typeof createVoyage>;
const VoyageContext = createContext<VoyageStore | null>(null);
const useVoyageStore = () => use(VoyageContext)!;

/** Where Chapter I's own source lives, for each Code sheet. */
export const CHAPTER_SOURCE = `${GITHUB}/tree/main/site/src/voyage/chapters`;


const partNamed = (id: PartId) => PARTS.find((part) => part.id === id)!;

/**
 * Chapter I, "Build the ship" (site-design.md): the shipyard, where Ouro HX's Reorderable and
 * Checklist build the Nautilus on an engraved plan, and the ship's articles, where an HX Form signs
 * you on to the crew. Each is one framed application with a Code sheet saying which part is HX's
 * and which the site's. The page hydrates it only as it nears the screen (pages/voyage.tsx); the
 * server HTML reads the same before then.
 */
const STYLES_ID = "chapter-one-styles";

export default function ChapterOne(): JSX.Element {
  const root = useRef<HTMLElement>(null);
  const [voyage] = useState(createVoyage);
  // Hydrated: the chapter's own styles go in, and it answers from here on (the end-to-end specs
  // wait for it before they press).
  useEffect(() => {
    if (!document.getElementById(STYLES_ID)) {
      const style = document.createElement("style");
      style.id = STYLES_ID;
      style.textContent = chapterStyles;
      document.head.append(style);
    }
    root.current?.setAttribute("data-chapter-ready", "");
  }, []);
  return (
    <section ref={root} id="chapter-one" aria-labelledby="chapter-one-title" className="pb-20 lg:pb-32" data-chapter="one">
      <Handoff />
      <VoyageContext value={voyage}>
        <Container className="grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-12 lg:grid-cols-12">
          <header className="lg:sticky lg:top-24 lg:col-span-4 lg:self-start">
            <p className="site-eyebrow">{CHAPTER_ONE.number}</p>
            <h2 id="chapter-one-title" className="site-h2 mt-3">
              {CHAPTER_ONE.title}
            </h2>
            <p className="site-lede mt-4">{CHAPTER_ONE.intro}</p>
            <Expedition />
          </header>
          <div className="grid gap-20 lg:col-span-8">
            <Composition id="shipyard" title={SHIPYARD.title} intro={SHIPYARD.intro} file={SHIPYARD.file} sheet={CODE_SHEETS.shipyard}>
              <Shipyard />
            </Composition>
            <Composition id="articles" title={ARTICLES.title} intro={ARTICLES.intro} file={ARTICLES.file} sheet={CODE_SHEETS.articles}>
              <Articles />
            </Composition>
          </div>
        </Container>
      </VoyageContext>
    </section>
  );
}

/** From the themes into the chapter: a course line with the shipwright's dividers on it, and the line that turns the page. */
function Handoff(): JSX.Element {
  return (
    <Container className="flex items-center gap-4 py-12 text-muted-foreground lg:py-16" data-chapter-handoff="">
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
      <svg
        className="w-16 shrink-0"
        viewBox={dividers.viewBox}
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        dangerouslySetInnerHTML={{ __html: dividers.inner }}
      />
      <p className="m-0 text-sm italic">{CHAPTER_ONE.handoff}</p>
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
    </Container>
  );
}

/**
 * The rail beside the chapter, held in view while you work: the yard on the island, drawn in as
 * the jobs are ticked, the ship in the sea once launched and a pennant once you sign on; under it,
 * how the voyage stands in words. On a phone the chapter runs in one column and the rail is left out.
 */
function Expedition(): JSX.Element {
  const voyage = useVoyageStore();
  const { built, launched, you } = useSyncExternalStore(voyage.subscribe, voyage.get, voyage.get);
  const steps = [
    { label: EXPEDITION.build, done: built.size === PARTS.length, status: EXPEDITION.built(built.size) },
    { label: EXPEDITION.launch, done: launched, status: EXPEDITION.afloat(launched) },
    { label: EXPEDITION.sign, done: you !== null, status: EXPEDITION.signed(you) },
  ];
  return (
    <div className="mt-10 hidden lg:block" data-chapter-expedition="">
      <svg
        className="site-yard"
        viewBox={island.viewBox}
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        data-built={[...built].join(" ")}
        data-launched={launched ? "" : undefined}
        data-signed={you ? "" : undefined}
        dangerouslySetInnerHTML={{ __html: island.inner }}
      />
      <ol className="m-0 mt-6 grid list-none gap-4 p-0" aria-label={EXPEDITION.label}>
        {steps.map((step) => (
          <li key={step.label} className="flex items-start gap-3" data-done={step.done ? "" : undefined}>
            <StepMark done={step.done} />
            <span className="grid gap-0.5">
              <span className="font-medium">{step.label}</span>
              <span className="text-sm text-muted-foreground">{step.status}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** A step's mark: an open ring, or a ring with a tick once it is done. */
function StepMark({ done }: { done: boolean }): JSX.Element {
  return (
    <svg className="site-step-mark" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="8.5" />
      {done ? <path d="M6 10.5l2.75 2.75L14 7.5" /> : null}
    </svg>
  );
}

interface SheetCopy {
  title: string;
  description: string;
  hx: readonly SheetLine[];
  site: readonly string[];
}

/**
 * One framed application: its title and line above, window chrome with a Code button, and the Code
 * sheet, where each thing HX does sits over the line of the exhibit that asks it to (wrapped, never
 * cut off at the panel's edge).
 */
function Composition({ id, title, intro, file, sheet, children }: { id: string; title: string; intro: string; file: string; sheet: SheetCopy; children: ReactNode }): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <article aria-labelledby={`${id}-title`} data-composition={id}>
      <h3 id={`${id}-title`} className="site-h3">
        {title}
      </h3>
      <p className="mt-1 mb-4 text-muted-foreground">{intro}</p>
      <div className="site-window">
        <div className="site-window-bar">
          <span className="site-window-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="site-mono truncate">{file}</span>
          <span className="ms-auto -me-2" data-chapter-control={`${id}-code`}>
            <Button variant="plain" tone="secondary" size="sm" aria-haspopup="dialog" onClick={() => setOpen(true)}>
              {CHAPTER_ONE.code}
            </Button>
          </span>
        </div>
        {children}
      </div>
      <Sheet title={sheet.title} description={sheet.description} side="right" open={open} onOpenChange={setOpen}>
        <div className="grid gap-6 text-sm">
          <section aria-labelledby={`${id}-hx`}>
            <h4 id={`${id}-hx`} className="site-eyebrow mb-2">
              {CODE_SHEETS.hxHeading}
            </h4>
            <ul className="m-0 grid list-none gap-4 p-0">
              {sheet.hx.map((line) => (
                <li key={line.text} className="grid gap-1.5">
                  <span>{line.text}</span>
                  <pre className="site-mono site-code-line m-0 rounded-lg bg-muted px-3 py-2" data-chapter-code="">
                    <code>{line.code}</code>
                  </pre>
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby={`${id}-site`}>
            <h4 id={`${id}-site`} className="site-eyebrow mb-2">
              {CODE_SHEETS.siteHeading}
            </h4>
            <ul className="m-0 grid list-disc gap-2 ps-5">
              {sheet.site.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
          <Link href={CHAPTER_SOURCE} external>
            {CODE_SHEETS.source}
          </Link>
        </div>
      </Sheet>
    </article>
  );
}

/** A crew member's line, read out when it changes; at the launch the whole crew turns out to cheer. */
function Crew({ line, cheer = false }: { line: CrewLine; cheer?: boolean }): JSX.Element {
  return (
    <p className="m-0 flex min-h-[2.75lh] items-center gap-2.5 text-sm" aria-live="polite" aria-atomic="true" data-chapter-crew="">
      {cheer ? (
        <span className="site-cheer" data-chapter-cheer="">
          {CREW.map((member) => (
            <Avatar key={member.name} name={member.name} alt="" size="sm" />
          ))}
        </span>
      ) : (
        <Avatar name={line.name} alt="" size="sm" />
      )}
      <span>
        <span className="font-semibold">{line.name}:</span> {line.text}
      </span>
    </p>
  );
}

/** The engraved plan: each built part drawn in, and the finished ship in the sea once launched. */
const Plan = memo(function Plan({ built, launched, ref }: { built: ReadonlySet<PartId>; launched: boolean; ref: Ref<HTMLElement> }): JSX.Element {
  return (
    <figure ref={ref} className="m-0 border-b border-border/70" style={{ scrollMarginTop: "5rem" }}>
      <svg
        className="site-blueprint"
        viewBox={blueprint.viewBox}
        role="img"
        aria-label={describePlan(built, launched)}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        data-built={[...built].join(" ")}
        data-launched={launched ? "" : undefined}
        dangerouslySetInnerHTML={{ __html: blueprint.inner }}
      />
    </figure>
  );
});

/** What the plan shows, in words, for screen readers. */
function describePlan(built: ReadonlySet<PartId>, launched: boolean): string {
  if (launched) return "The Nautilus, built and afloat.";
  const drawn = PARTS.filter((part) => built.has(part.id)).map((part) => part.name.toLowerCase());
  return drawn.length ? `${SHIPYARD.blueprint}. Drawn so far: ${drawn.join(", ")}.` : `${SHIPYARD.blueprint}. Only the keel lines so far.`;
}

/**
 * The shipyard: put the jobs in order (Reorderable), tick them off (Checklist, in that order, a
 * day each), watch the plan gain each part and the bar fill (Progress), then Launch. The site owns
 * the order, the ticks and the plan; HX owns how each control behaves and what it announces.
 */
function Shipyard(): JSX.Element {
  const voyage = useVoyageStore();
  const jobs = useRef<HTMLDivElement>(null);
  const drawing = useRef<HTMLElement>(null);
  const [order, setOrder] = useState<readonly PartId[]>(START_ORDER);
  const [built, setBuilt] = useState<ReadonlySet<PartId>>(() => new Set());
  const [launched, setLaunched] = useState(false);
  const [line, setLine] = useState<CrewLine>(YARD.opening);
  const [emptying, startEmptying] = useTransition();
  const left = PARTS.length - built.size;
  const ready = left === 0 && !launched && !emptying;
  // The plan follows the controls once the press has painted: a press repaints its own control
  // first, then the drawing, so no press waits on the plan's repaint (a deferred render could
  // commit before that paint).
  const plan = useAfterPaint(useMemo(() => ({ built, launched }), [built, launched]));
  // The rail follows the plan.
  useEffect(() => voyage.set(plan), [voyage, plan]);
  // The jobs follow a reorder once it has painted: the handles' list and its menu are the press's
  // own, and the checklist renders again for the new order.
  const jobOrder = useAfterPaint(order);

  // The crew's line follows the control's own change by a frame: it's a transition, so the press
  // paints first.
  const say = (next: CrewLine) => startTransition(() => setLine(next));
  const reorder = useStable((ids: string[]) => {
    const next = ids as PartId[];
    setOrder(next);
    const first = next[0]!;
    say(first === "hull" ? YARD.inOrder : YARD.outOfOrder[first]);
  });
  const tick = useStable((id: string, checked: boolean) => {
    const part = partNamed(id as PartId);
    const next = new Set(built);
    if (checked) next.add(part.id);
    else next.delete(part.id);
    setBuilt(next);
    // Taking a part off a launched ship brings her back to the yard.
    if (launched) setLaunched(false);
    if (!checked) say(YARD.undone(part.name));
    else if (next.size === PARTS.length) say(YARD.ready);
    else if (part.id !== "hull" && !next.has("hull")) say(YARD.noHull(part.name));
    else say(YARD.built[part.id]);
  });
  // Launch turns the button at once; emptying the yard for another build follows as a transition,
  // and focus goes to the first job, where the next build starts.
  const launch = () => {
    if (launched) {
      jobs.current?.querySelector<HTMLElement>("[role='checkbox']")?.focus();
      setLaunched(false);
      startEmptying(() => setBuilt(new Set()));
      say(YARD.again);
    } else {
      setLaunched(true);
      say(YARD.launch);
      // On a phone the plan is above the button, out of sight: bring it in to watch her go.
      const plan = drawing.current;
      if (plan && plan.getBoundingClientRect().bottom < 120) plan.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    }
  };

  return (
    <div>
      <Plan ref={drawing} built={plan.built} launched={plan.launched} />
      <div className="grid gap-6 p-4 sm:grid-cols-2 sm:p-6">
        <div data-chapter-control="order">
          <p className="site-eyebrow mb-2" aria-hidden="true">
            {SHIPYARD.order}
          </p>
          <OrderList order={order} onReorder={reorder} />
        </div>
        <div ref={jobs} data-chapter-control="jobs">
          <p className="site-eyebrow mb-2" aria-hidden="true">
            {SHIPYARD.jobs}
          </p>
          <JobList order={jobOrder} built={built} onTick={tick} />
        </div>
      </div>
      <div className="grid gap-4 border-t border-border/70 p-4 sm:p-6">
        <Progress label={SHIPYARD.progress} value={(built.size / PARTS.length) * 100} showValue />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Crew line={line} cheer={launched} />
          <div className="flex shrink-0 items-center gap-3" data-chapter-control="launch">
            <span className="text-sm text-muted-foreground" data-chapter-launch-hint="">
              {launched ? SHIPYARD.launched : SHIPYARD.launchHint(emptying ? PARTS.length : left)}
            </span>
            <Button size="md" disabled={emptying || (!launched && left > 0)} variant={ready ? "solid" : "outline"} tone={ready ? "primary" : "secondary"} onClick={launch}>
              {launched || emptying ? SHIPYARD.again : SHIPYARD.launch}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/*
 * The yard's two lists, each a memoized piece with a steady handler: Launch, a tick or a reorder
 * re-renders only the lists it changes, not five handles with their menus and five checkboxes that
 * stay as they were (chapter-one.latency.spec.ts).
 */
const OrderList = memo(function OrderList({ order, onReorder }: { order: readonly PartId[]; onReorder: (ids: string[]) => void }): JSX.Element {
  return <Reorderable label={SHIPYARD.order} items={order.map((id) => ({ id, label: partNamed(id).name }))} onReorder={onReorder} />;
});

const JobList = memo(function JobList({ order, built, onTick }: { order: readonly PartId[]; built: ReadonlySet<PartId>; onTick: (id: string, checked: boolean) => void }): JSX.Element {
  return <Checklist label={SHIPYARD.jobs} hideLabel items={order.map((id, index) => ({ id, label: partNamed(id).job, value: SHIPYARD.day(index + 1), checked: built.has(id) }))} onCheckedChange={onTick} />;
});

const tradeLabel = (value: string) => TRADES.find((trade) => trade.value === value)?.label ?? value;

/** Whether a name is someone aboard already: their whole name, or the last word of it ("Nemo"). */
function aboard(name: string): CrewName | undefined {
  const asked = name.trim().toLowerCase();
  return CREW.find((member) => member.name.toLowerCase() === asked || member.name.split(" ").at(-1)!.toLowerCase() === asked)?.name;
}

/**
 * The ship's articles: an HX Form (name, trade and the oath, each required) signs you on to the crew
 * list beside Nemo, Aronnax, Conseil and Ned. The browser's own checks run first, and Conseil, who
 * keeps the list, says politely what is still wanting (your name waits on the list until then);
 * the site's checks (a blank name, a name already aboard) answer through the Form's `errors`, as a
 * server would.
 */
function Articles(): JSX.Element {
  const voyage = useVoyageStore();
  const box = useRef<HTMLDivElement>(null);
  const [you, setYou] = useState<{ name: string; trade: string } | null>(null);
  const [answer, setAnswer] = useState<{ errors: FormErrors | undefined }>();
  const [signings, setSignings] = useState(0);
  const [line, setLine] = useState<CrewLine>(SIGN.opening);
  const [pending, setPending] = useState<{ name: string; wants: readonly Want[] } | null>(null);
  useEffect(() => voyage.set({ you }), [voyage, you]);
  // A new signing brings a new, empty form, and focus goes to your row's Leave.
  useEffect(() => {
    if (signings === 0) return;
    box.current?.querySelector<HTMLElement>("[data-chapter-control='leave'] button")?.focus();
  }, [signings]);

  const field = (name: string) => box.current?.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  // Before the browser's checks stop a short signing, Conseil says what it still wants. (Enter in a
  // field presses Sign too, so this hears every attempt.)
  const check = () => {
    const name = field("name")?.value.trim() ?? "";
    const wants = WANTS.filter((key) => field(key)?.validity.valid === false);
    // With no name there is nothing to pencil in: the row waiting from an earlier try goes.
    if (!name) {
      setPending(null);
      setLine(SIGN.needName);
    } else if (wants.length) {
      setPending({ name, wants });
      setLine(SIGN.refuse(wants));
    }
  };
  const sign = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    if (!name) {
      setAnswer({ errors: { name: ARTICLES.blank } });
      setPending(null);
      setLine(SIGN.needName);
      return;
    }
    const taken = aboard(name);
    if (taken) {
      setAnswer({ errors: { name: ARTICLES.taken(taken) } });
      setPending(null);
      setLine(SIGN.mine(taken));
      return;
    }
    const trade = tradeLabel(String(data.get("trade")));
    setAnswer({ errors: undefined });
    setPending(null);
    setYou({ name, trade });
    setLine(SIGN.welcome(name, trade));
    // The new, empty form and the toast follow once the press has painted, as the bell's toast
    // does: making the form's fields again is most of a signing's work, and the toast stack measures
    // and re-lays itself out, so both wait for the press's own paint (your row on the list) rather
    // than holding it up. Your row and Conseil's welcome under it are kept clear of the toast.
    afterPaint(() => {
      startTransition(() => setSignings((count) => count + 1));
      toast(ARTICLES.signed(name), { tone: "success", description: ARTICLES.onList });
      keepClearOfToasts(box.current?.querySelector("[data-chapter-crew]"));
    });
  };
  // Off the list, and back to the articles' first field to sign again.
  const leave = () => {
    field("name")?.focus();
    setYou(null);
    setLine(SIGN.left);
  };
  const count = CREW.length + (you ? 1 : 0);
  return (
    <div ref={box} className="grid gap-8 p-4 sm:p-6 md:grid-cols-2">
      {/* A new Form for each signing, so the fields start empty again. */}
      <Form key={signings} aria-label={ARTICLES.form} errors={formErrors(answer, answer?.errors)} onSubmit={sign}>
        <div data-chapter-control="name">
          <TextField label={ARTICLES.name} name="name" description={ARTICLES.nameHint} autoComplete="off" required />
        </div>
        <div data-chapter-control="trade">
          <Select label={ARTICLES.trade} name="trade" placeholder={ARTICLES.tradePlaceholder} options={TRADES} required />
        </div>
        <div data-chapter-control="oath">
          <Checkbox label={ARTICLES.oath} name="oath" required />
        </div>
        <div data-chapter-control="sign">
          <Button type="submit" onClick={check}>
            {ARTICLES.sign}
          </Button>
        </div>
      </Form>
      <div>
        <div className="flex items-baseline justify-between gap-4">
          <p className="site-eyebrow" aria-hidden="true">
            {ARTICLES.roster}
          </p>
          <span className="text-sm text-muted-foreground" data-chapter-aboard="">
            {ARTICLES.aboard(count)}
          </span>
        </div>
        <ItemGroup aria-label={ARTICLES.roster} className="mt-1">
          {CREW.map((member) => (
            <Item key={member.name} size="sm" media={<Avatar name={member.name} alt="" />} title={member.name} actions={<Badge tone="secondary" variant="soft">{member.trade}</Badge>} />
          ))}
          {you ? (
            <Item
              key="you"
              size="sm"
              media={<Avatar name={you.name} alt="" />}
              title={you.name}
              description={
                <span className="inline-flex flex-wrap gap-1.5">
                  <Badge tone="primary">{ARTICLES.you}</Badge>
                  <Badge tone="secondary" variant="soft">
                    {you.trade}
                  </Badge>
                </span>
              }
              actions={
                <span data-chapter-control="leave">
                  <Button variant="plain" tone="secondary" size="sm" onClick={leave}>
                    {ARTICLES.leave}
                  </Button>
                </span>
              }
            />
          ) : pending ? (
            <Item
              key="pending"
              size="sm"
              data-chapter-pending=""
              media={<Avatar name={pending.name} alt="" />}
              title={pending.name}
              description={SIGN.waiting(pending.wants)}
              actions={
                <Badge tone="secondary" variant="outline">
                  {ARTICLES.pending}
                </Badge>
              }
            />
          ) : null}
        </ItemGroup>
        <Crew line={line} />
      </div>
    </div>
  );
}

type Want = "trade" | "oath";
const WANTS: readonly Want[] = ["trade", "oath"];
