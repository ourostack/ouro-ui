import { createContext, memo, startTransition, use, useDeferredValue, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition, type FormEvent, type JSX, type Ref } from "react";
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
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";
import { formErrors } from "@/registry/ouro/lib/ouro/form-answer";
import blueprintSource from "../../nautilus/art/nautilus-blueprint.svg?raw";
import { href } from "../../paths";
import { afterPaint, useAfterPaint } from "../after-paint";
import { Container } from "../layout";
import { useStable } from "../use-stable";
import { parseArt } from "../stage/art";
import type { CrewName } from "../stage/copy";
import { ARTICLES, CHAPTER_ONE, CODE_SHEETS, CREW, EXPEDITION, ONWARD, PARTS, SHIPYARD, SIGN, START_ORDER, TRADES, YARD, type ArticlesLive, type CrewLine, type PartId, type ShipyardLive } from "./copy";
import { crewFace } from "./crew-faces";
import { ChapterPicture, Composition, Crew, Handoff, PhoneMarker, Steps, useChapterReady, useLiveCode, type Step } from "./frame";
import { writeLog } from "./logbook";
// What only changes once the chapter answers (each part drawn in, the launch, the yard's picture,
// the crew's cheer): it comes inside this island's script and goes into the page as the island
// hydrates, so it costs the first paint nothing and holds up no part of the island's loading.
import chapterStyles from "./chapter-one.css?inline";

const blueprint = parseArt(blueprintSource);

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

const partNamed = (id: PartId) => PARTS.find((part) => part.id === id)!;

/** The rule the jobs are held to: the order of work you set, with the hull before the rest, since every part needs it. */
const ruleOf = (order: readonly PartId[]): readonly PartId[] => ["hull", ...order.filter((id) => id !== "hull")];

/**
 * The jobs ticked out of order, as HX's Checklist reads them with `ordered`: each ticked job with an
 * unticked job before it in the rule (their ids, sorted, in one string), and that first unticked job.
 */
function heldBack(rule: readonly PartId[], built: ReadonlySet<PartId>): { heldKey: string; first: PartId | undefined } {
  const held = new Set<PartId>();
  let first: PartId | undefined;
  for (const id of rule) {
    if (!built.has(id)) first ??= id;
    else if (first) held.add(id);
  }
  return { heldKey: [...held].sort().join(" "), first: held.size ? first : undefined };
}

/**
 * Chapter I, "Build the ship" (site-design.md): the shipyard, where Ouro HX's Reorderable and
 * Checklist build the Nautilus on an engraved plan, and the ship's articles, where an HX Form signs
 * you on to the crew. Each is one framed application with a Code sheet saying which part is HX's
 * and which the site's. The page hydrates it only as it nears the screen (pages/voyage.tsx); the
 * server HTML reads the same before then.
 */
export default function ChapterOne(): JSX.Element {
  const root = useRef<HTMLElement>(null);
  const [voyage] = useState(createVoyage);
  useChapterReady(root, "chapter-one-styles", chapterStyles);
  return (
    <section ref={root} id="chapter-one" aria-labelledby="chapter-one-title" className="pb-20 lg:pb-32" data-chapter="one">
      <Handoff line={CHAPTER_ONE.handoff} />
      <VoyageContext value={voyage}>
        <ExpeditionMarker />
        <Container className="grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-12 lg:grid-cols-12">
          <header className="lg:col-span-4">
            <ShipyardPicture className="mb-8 lg:hidden" />
            <p className="site-eyebrow">{CHAPTER_ONE.number}</p>
            <h2 id="chapter-one-title" className="site-h2 mt-3">
              {CHAPTER_ONE.title}
            </h2>
            <p className="site-lede mt-4">{CHAPTER_ONE.intro}</p>
            <Expedition />
          </header>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-16 lg:col-span-8">
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

/** How the voyage stands, as steps: built, launched, signed on. */
function useExpedition(): { voyage: Voyage; steps: Step[] } {
  const store = useVoyageStore();
  const voyage = useSyncExternalStore(store.subscribe, store.get, store.get);
  const { built, launched, you } = voyage;
  return {
    voyage,
    steps: [
      { label: EXPEDITION.build, done: built.size === PARTS.length, status: EXPEDITION.built(built.size) },
      { label: EXPEDITION.launch, done: launched, status: EXPEDITION.afloat(launched) },
      { label: EXPEDITION.sign, done: you !== null, status: EXPEDITION.signed(you) },
    ],
  };
}

/**
 * The rail beside the chapter, held in view while you work: the shipyard's picture, then how the
 * voyage stands in words, each step ticked as it is done. On a phone the picture opens the chapter
 * instead and the steps are left out; ExpeditionMarker keeps the count.
 */
function Expedition(): JSX.Element {
  const { steps } = useExpedition();
  return (
    <div className="mt-10 hidden lg:block" data-chapter-rail="" data-chapter-expedition="">
      <ShipyardPicture />
      <Steps label={EXPEDITION.label} steps={steps} />
    </div>
  );
}

/** The shipyard, until she is launched: then the same cove with the Nautilus afloat, faded in. */
function ShipyardPicture({ className }: { className?: string }): JSX.Element {
  const { launched } = useExpedition().voyage;
  return <ChapterPicture scene="nautilus-shipyard" state={{ scene: "nautilus-shipyard-afloat", shown: launched }} {...(className ? { className } : {})} />;
}

/** On a phone: the chapter and its steps done, held under the header while the chapter is on screen. */
function ExpeditionMarker(): JSX.Element {
  return <PhoneMarker chapter={CHAPTER_ONE.number} title={CHAPTER_ONE.title} steps={useExpedition().steps} />;
}

/** The way on to Chapter II, once she floats and once you have signed: a jump down the page to its heading. */
function Onward({ control }: { control: "next" | "signed-next" }): JSX.Element {
  return (
    <span data-chapter-control={control}>
      <Link href={ONWARD.href}>{ONWARD.label}</Link>
    </span>
  );
}

/**
 * The engraved plan: each built part drawn in, a part ticked out of order as a faint, dashed ghost
 * that settles in once the jobs before it are done, and once launched the finished ship slides into
 * the sea and the plan becomes a painting of her afloat, with the way on.
 */
const Plan = memo(function Plan({ built, ghosts, launched, ref }: { built: ReadonlySet<PartId>; ghosts: ReadonlySet<PartId>; launched: boolean; ref: Ref<HTMLElement> }): JSX.Element {
  return (
    // Brought into view at the launch, it clears the header and a phone's chapter marker under it, so the crew on
    // deck show whole.
    <figure ref={ref} className="relative m-0 -mx-4 border-b border-border sm:-mx-6" style={{ scrollMarginTop: "calc(var(--site-header-h, 3.5rem) + 3rem)" }}>
      <svg
        className="site-blueprint"
        viewBox={blueprint.viewBox}
        role="img"
        aria-label={describePlan(built, ghosts, launched)}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        data-built={[...built].join(" ")}
        data-ghost={[...ghosts].join(" ")}
        data-launched={launched ? "" : undefined}
        dangerouslySetInnerHTML={{ __html: blueprint.inner }}
      />
      {/* Once she floats, the plan becomes a painting of her afloat. The plan's label already says so, so the painting
          is decoration. Its opacity is inline, so the server HTML has it before the chapter's styles arrive. */}
      <div className="site-plan-ship pointer-events-none absolute inset-x-0 top-0" style={{ opacity: launched ? 1 : 0 }} aria-hidden="true" data-chapter-plan-ship="" data-shown={launched ? "" : undefined}>
        <PlanShip night={false} />
        <PlanShip night />
      </div>
      {/* Under the art, never over it. The row says she is on the slip until then, so nothing below moves at the launch. */}
      <figcaption className="flex min-h-13 items-center px-4 sm:px-6">
        {launched ? (
          <span data-chapter-afloat="">
            <span>{SHIPYARD.afloat}</span>
            <Onward control="next" />
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">{EXPEDITION.afloat(false)}</span>
        )}
      </figcaption>
    </figure>
  );
});

/** The plan's widest is 790px, on a 1440px screen; on a phone it is the screen's width. */
const PLAN_SHIP_SIZES = "(max-width: 640px) 100vw, 50rem";

/**
 * The plan's painting: the opener scene cropped to the plan's 3:1, the hull in profile with her bow to the right, as
 * the plan draws her (site/scripts/plan-ship.mts makes the files). By day, or at night in dark mode, whose file loads
 * only then. It loads as the plan nears the screen, so it is there when she floats.
 */
function PlanShip({ night }: { night: boolean }): JSX.Element {
  const name = night ? "nautilus-afloat-dark" : "nautilus-afloat";
  const set = (format: "avif" | "webp") => [720, 1440].map((width) => `${href(`/plan-ship/${name}-${width}.${format}`)} ${width}w`).join(", ");
  return (
    <picture className={night ? "story-world-night" : "story-world-day"}>
      <source type="image/avif" srcSet={set("avif")} sizes={PLAN_SHIP_SIZES} />
      <img src={href(`/plan-ship/${name}-720.webp`)} srcSet={set("webp")} sizes={PLAN_SHIP_SIZES} alt="" width={720} height={240} className="block h-auto w-full" loading="lazy" decoding="async" draggable={false} />
    </picture>
  );
}

/** What the plan shows, in words, for screen readers. */
function describePlan(built: ReadonlySet<PartId>, ghosts: ReadonlySet<PartId>, launched: boolean): string {
  if (launched) return "The Nautilus, built and afloat.";
  const named = (keep: (id: PartId) => boolean) => PARTS.filter((part) => keep(part.id)).map((part) => part.name.toLowerCase());
  const drawn = named((id) => built.has(id) && !ghosts.has(id));
  const faint = named((id) => ghosts.has(id));
  const said = drawn.length ? `${SHIPYARD.blueprint}. Drawn so far: ${drawn.join(", ")}.` : `${SHIPYARD.blueprint}. Only the keel lines so far.`;
  return faint.length ? `${said} ${SHIPYARD.ghosts(faint.join(", "))}` : said;
}

/**
 * The shipyard: put the jobs in order (Reorderable), tick them off (Checklist, in that order, a
 * day each), watch the plan gain each part and the bar fill (Progress), then Launch. The order you
 * set is the rule, with the hull first: a job ticked before its turn is out of order (the
 * Checklist's `ordered`), a ghost on the plan, and not yet counted, until the jobs before it are
 * done. The site owns the order, the ticks and the plan; HX owns how each control behaves and what
 * it announces.
 */
function Shipyard(): JSX.Element {
  const voyage = useVoyageStore();
  const jobs = useRef<HTMLDivElement>(null);
  const drawing = useRef<HTMLElement>(null);
  const [order, setOrder] = useState<readonly PartId[]>(START_ORDER);
  const [built, setBuilt] = useState<ReadonlySet<PartId>>(() => new Set());
  const [launched, setLaunched] = useState(false);
  // The hint beside Launch says why it is off (the jobs left), and Launch is described by it.
  const hint = useId();
  const [line, setLine] = useState<CrewLine>(YARD.opening);
  const [emptying, startEmptying] = useTransition();
  // The jobs follow a reorder once it has painted: the handles' list and its menu are the press's
  // own, and the checklist renders again for the new order.
  const jobOrder = useAfterPaint(order);
  const rule = useMemo(() => ruleOf(jobOrder), [jobOrder]);
  const { heldKey, first } = useMemo(() => heldBack(rule, built), [rule, built]);
  // The same jobs held back keep the same set, so a reorder that changes none redraws neither the plan nor the rail.
  const held = useMemo(() => new Set(heldKey ? heldKey.split(" ") : []) as ReadonlySet<PartId>, [heldKey]);
  const left = PARTS.length - built.size;
  const placed = built.size - held.size;
  const ready = left === 0 && !launched && !emptying;
  const progress = (placed / PARTS.length) * 100;
  const launchOff = emptying || (!launched && (left > 0 || held.size > 0));
  const launchLabel = launched || emptying ? SHIPYARD.again : SHIPYARD.launch;
  useLiveCode<ShipyardLive>({ progress, launch: launchLabel, launchOff });
  // The plan follows the controls a frame later: a press repaints its own control first, then the
  // drawing (a deferred render), so no press waits on the plan's repaint.
  const plan = useDeferredValue(useMemo(() => ({ built, ghosts: held, launched }), [built, held, launched]));
  // The rail follows the plan, counting only the parts in place, and the ship's log (Chapter III)
  // the launch: a job a day.
  useEffect(() => voyage.set({ built: new Set([...plan.built].filter((id) => !plan.ghosts.has(id))), launched: plan.launched }), [voyage, plan]);
  useEffect(() => writeLog({ launched: plan.launched ? PARTS.length : null }), [plan.launched]);

  // The crew's line follows the control's own change by a frame: it's a transition, so the press
  // paints first.
  // Whether the line is a tick's warning (a job off, or a part with no hull), which a later tick can
  // make untrue.
  const warned = useRef(false);
  const say = (next: CrewLine, warning = false) => {
    warned.current = warning;
    startTransition(() => setLine(next));
  };
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
    // The crew speaks when it adds something: the hull, a warning, or the ship ready. A job ticked
    // in order keeps the line as it was, since its box and the plan already show it, unless that
    // line is a warning the tick has made untrue: then the hull's line, true again, comes back.
    if (!checked) say(YARD.undone(part.name), true);
    else if (next.size === PARTS.length) say(YARD.ready);
    else if (!next.has("hull")) say(YARD.noHull(part.name), true);
    else if (part.id === "hull" || warned.current) say(YARD.hull);
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
      // On a phone or a tablet the plan can be above the button, under the header and the chapter's marker: when less
      // than half the drawing shows below them, bring it in to watch her go.
      const plan = drawing.current;
      const art = plan?.querySelector(".site-blueprint")?.getBoundingClientRect();
      if (plan && art && art.bottom - parseFloat(getComputedStyle(plan).scrollMarginTop) < art.height / 2) plan.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    }
  };

  return (
    <div>
      <Plan ref={drawing} built={plan.built} ghosts={plan.ghosts} launched={plan.launched} />
      <div className="grid gap-6 py-4 sm:grid-cols-2 sm:py-6">
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
          <JobList order={jobOrder} rule={rule} built={built} onTick={tick} />
        </div>
      </div>
      <div className="grid gap-4 border-t border-border/70 py-4 sm:py-6">
        <Progress label={SHIPYARD.progress} value={progress} showValue />
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* The crew turns out with the plan, a frame after the press: the press paints Launch's own change first (#2067). */}
          <Crew line={line} cheer={plan.launched} />
          <div className="flex shrink-0 items-center gap-3" data-chapter-control="launch">
            <span id={hint} className="text-sm text-muted-foreground" data-chapter-launch-hint="">
              {launched ? SHIPYARD.launched : first && !emptying ? SHIPYARD.outOfOrder(partNamed(first).job) : SHIPYARD.launchHint(emptying ? PARTS.length : left)}
            </span>
            <Button size="md" disabled={launchOff} aria-describedby={hint} variant={ready ? "solid" : "outline"} tone={ready ? "primary" : "secondary"} onClick={launch}>
              {launchLabel}
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

const JobList = memo(function JobList({ order, rule, built, onTick }: { order: readonly PartId[]; rule: readonly PartId[]; built: ReadonlySet<PartId>; onTick: (id: string, checked: boolean) => void }): JSX.Element {
  return (
    <Checklist
      label={SHIPYARD.jobs}
      hideLabel
      items={order.map((id, index) => ({ id, label: partNamed(id).job, value: SHIPYARD.day(index + 1), checked: built.has(id) }))}
      ordered={rule}
      outOfOrderLabel={SHIPYARD.first}
      onCheckedChange={onTick}
    />
  );
});

const tradeLabel = (value: string) => TRADES.find((trade) => trade.value === value)?.label ?? value;

/** Whether a name is someone aboard already: their whole name, or the last word of it ("Nemo"). */
function aboard(name: string): CrewName | undefined {
  const asked = name.trim().toLowerCase();
  return CREW.find((member) => member.name.toLowerCase() === asked || member.name.split(" ").at(-1)!.toLowerCase() === asked)?.name;
}

/** What the crew says to a name from another book they know (SIGN.known), by its last word ("Jules Verne"). */
function knownLine(name: string): CrewLine | undefined {
  const last = name.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean).at(-1);
  return SIGN.known.find((known) => (known.names as readonly string[]).includes(last ?? ""))?.line;
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
  useLiveCode<ArticlesLive>({ name: you?.name ?? null });
  // The crew in later chapters know you by name; leaving the crew takes it back.
  useEffect(() => writeLog({ you }), [you]);
  // The new, empty form a signing asks for (its key, and the cancel of its wait for the paint) until
  // that form has rendered, and whether Leave asked for the name field.
  const emptyForm = useRef<{ key: number; cancel: () => void } | null>(null);
  const toName = useRef(false);
  useLayoutEffect(() => {
    if (emptyForm.current && signings >= emptyForm.current.key) emptyForm.current = null;
  }, [signings]);
  // Focus moves in the press's own commit, before the browser paints, so it never rests on the page:
  // signing on, to your row's Leave (the articles step aside, and a new, empty form follows later,
  // hidden); leaving, to the name field of the form that commit shows.
  useLayoutEffect(() => {
    if (you) box.current?.querySelector<HTMLElement>("[data-chapter-control='leave'] button")?.focus();
    else if (toName.current) box.current?.querySelector<HTMLElement>("input[name='name']")?.focus();
    toName.current = false;
  }, [you]);

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
    setLine(knownLine(name) ?? SIGN.welcome(name, trade));
    // The new, empty form follows once the press has painted: making the form's fields again is most
    // of a signing's work, so it waits for the press's own paint (your row on the list) rather than
    // holding it up. No toast: your row and Conseil's welcome already say you signed on.
    const key = signings + 1;
    emptyForm.current = { key, cancel: afterPaint(() => startTransition(() => setSignings(key))) };
  };
  // Off the list, and back to the articles' first field to sign again. Leaving before the new, empty
  // form has rendered brings it in this commit (the same key, so a transition still on its way makes
  // no second one), and the name field focused is the empty one.
  const leave = () => {
    if (emptyForm.current) {
      emptyForm.current.cancel();
      setSignings(emptyForm.current.key);
    }
    toName.current = true;
    setYou(null);
    setLine(SIGN.left);
  };
  const count = CREW.length + (you ? 1 : 0);
  return (
    <div ref={box} className="grid gap-8 py-4 sm:py-6 md:grid-cols-2">
      {/* Once you have signed, the articles step aside for you aboard and the way on; Leave brings them back. They stay
          mounted, hidden, so Sign and Leave only show or hide them, and a new Form for each signing starts them empty. */}
      <div hidden={you !== null}>
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
      </div>
      {you ? (
        <div className="grid content-start justify-items-start gap-2" data-chapter-signed="">
          <p className="m-0 font-medium">{ARTICLES.welcomeAboard(you.name)}</p>
          <p className="m-0 text-sm text-muted-foreground">{ARTICLES.signAgain}</p>
          <Onward control="signed-next" />
        </div>
      ) : null}
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
            <Item key={member.name} size="sm" media={<Avatar name={member.name} src={crewFace(member.name, "md")} alt="" />} title={member.name} actions={<Badge tone="secondary" variant="soft">{member.trade}</Badge>} />
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
