import { useEffect, useRef, useState, type FormEvent, type JSX, type ReactNode } from "react";
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
import { GITHUB } from "../../paths";
import { Container } from "../layout";
import { parseArt } from "../stage/art";
import { ARTICLES, CHAPTER_ONE, CODE_SHEETS, CREW, PARTS, SHIPYARD, SIGN, TRADES, YARD, type CrewLine, type PartId } from "./copy";

const blueprint = parseArt(blueprintSource);
const dividers = parseArt(dividersSource);

/** Where Chapter I's own source lives, for each Code sheet. */
export const CHAPTER_SOURCE = `${GITHUB}/tree/main/site/src/voyage/chapters`;

/** The order the yard starts in: the lantern before the hull, so there is something to put right. */
export const START_ORDER: readonly PartId[] = ["lantern", "hull", "windows", "organ", "engine"];

const partNamed = (id: PartId) => PARTS.find((part) => part.id === id)!;

/**
 * Chapter I, "Build the ship" (site-design.md): the shipyard, where Ouro HX's Reorderable and
 * Checklist build the Nautilus on an engraved plan, and the ship's articles, where an HX Form signs
 * you on to the crew. Each is one framed application with a Code sheet saying which part is HX's
 * and which the site's. The page hydrates it only as it nears the screen (pages/voyage.tsx); the
 * server HTML reads the same before then.
 */
export default function ChapterOne(): JSX.Element {
  const root = useRef<HTMLElement>(null);
  // Hydrated: the chapter answers from here on (the end-to-end specs wait for it before they press).
  useEffect(() => {
    root.current?.setAttribute("data-chapter-ready", "");
  }, []);
  return (
    <section ref={root} id="chapter-one" aria-labelledby="chapter-one-title" className="border-t border-border/60 py-20 lg:py-32" data-chapter="one">
      <Container className="grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-12 lg:grid-cols-12">
        <header className="lg:sticky lg:top-24 lg:col-span-4 lg:self-start">
          <p className="site-eyebrow">{CHAPTER_ONE.number}</p>
          <h2 id="chapter-one-title" className="site-h2 mt-3">
            {CHAPTER_ONE.title}
          </h2>
          <p className="site-lede mt-4">{CHAPTER_ONE.intro}</p>
          <svg
            className="mt-8 hidden w-32 text-muted-foreground lg:block"
            viewBox={dividers.viewBox}
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            dangerouslySetInnerHTML={{ __html: dividers.inner }}
          />
        </header>
        <div className="grid gap-20 lg:col-span-8">
          <Composition id="shipyard" title={SHIPYARD.title} intro={SHIPYARD.intro} file={SHIPYARD.file} sheet={CODE_SHEETS.shipyard} snippet={SHIPYARD_SNIPPET}>
            <Shipyard />
          </Composition>
          <Composition id="articles" title={ARTICLES.title} intro={ARTICLES.intro} file={ARTICLES.file} sheet={CODE_SHEETS.articles} snippet={ARTICLES_SNIPPET}>
            <Articles />
          </Composition>
        </div>
      </Container>
    </section>
  );
}

const SHIPYARD_SNIPPET = `<Reorderable label="Order of work" items={plan} onReorder={setOrder} />
<Checklist label="Jobs" items={jobs} onCheckedChange={tick} />
<Progress label="Ship built" value={built} showValue />
<Button disabled={left > 0} onClick={launch}>Launch</Button>`;

const ARTICLES_SNIPPET = `<Form errors={formErrors(answer, answer?.errors)} onSubmit={sign}>
  <TextField label="Your name" name="name" required />
  <Select label="Your trade" name="trade" options={trades} required />
  <Checkbox label="I will keep the Nautilus a secret." name="oath" required />
  <Button type="submit">Sign the articles</Button>
</Form>`;

interface SheetCopy {
  title: string;
  description: string;
  hx: readonly string[];
  site: readonly string[];
}

/** One framed application: its title and line above, window chrome with a Code button, and the Code sheet. */
function Composition({ id, title, intro, file, sheet, snippet, children }: { id: string; title: string; intro: string; file: string; sheet: SheetCopy; snippet: string; children: ReactNode }): JSX.Element {
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
            <ul className="m-0 grid list-disc gap-2 ps-5">
              {sheet.hx.map((line) => (
                <li key={line}>{line}</li>
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
          <pre className="site-mono m-0 overflow-x-auto rounded-lg bg-muted p-4" tabIndex={0} aria-label={`${title}: the HX part, in short`}>
            <code>{snippet}</code>
          </pre>
          <Link href={CHAPTER_SOURCE} external>
            {CODE_SHEETS.source}
          </Link>
        </div>
      </Sheet>
    </article>
  );
}

/** A crew member's line, read out when it changes. */
function Crew({ line }: { line: CrewLine }): JSX.Element {
  return (
    <p className="m-0 flex min-h-[2.75lh] items-center gap-2.5 text-sm" aria-live="polite" aria-atomic="true" data-chapter-crew="">
      <Avatar name={line.name} alt="" size="sm" />
      <span>
        <span className="font-semibold">{line.name}:</span> {line.text}
      </span>
    </p>
  );
}

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
  const [order, setOrder] = useState<readonly PartId[]>(START_ORDER);
  const [built, setBuilt] = useState<ReadonlySet<PartId>>(() => new Set());
  const [launched, setLaunched] = useState(false);
  const [line, setLine] = useState<CrewLine>(YARD.opening);
  const left = PARTS.length - built.size;

  const reorder = (ids: string[]) => {
    const next = ids as PartId[];
    setOrder(next);
    const first = next[0]!;
    setLine(first === "hull" ? YARD.inOrder : YARD.outOfOrder[first]);
  };
  const tick = (id: string, checked: boolean) => {
    const part = partNamed(id as PartId);
    const next = new Set(built);
    if (checked) next.add(part.id);
    else next.delete(part.id);
    setBuilt(next);
    if (!checked) setLine(YARD.undone(part.name));
    else if (next.size === PARTS.length) setLine(YARD.ready);
    else if (part.id !== "hull" && !next.has("hull")) setLine(YARD.noHull(part.name));
    else setLine(YARD.built[part.id]);
  };
  const launch = () => {
    if (launched) {
      setLaunched(false);
      setBuilt(new Set());
      setLine(YARD.again);
    } else {
      setLaunched(true);
      setLine(YARD.launch);
    }
  };

  return (
    <div>
      <figure className="m-0 border-b border-border/70">
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
      <div className="grid gap-6 p-4 sm:grid-cols-2 sm:p-6">
        <div data-chapter-control="order">
          <p className="site-eyebrow mb-2" aria-hidden="true">
            {SHIPYARD.order}
          </p>
          <Reorderable label={SHIPYARD.order} items={order.map((id) => ({ id, label: partNamed(id).name, }))} onReorder={reorder} />
        </div>
        <div data-chapter-control="jobs">
          <p className="site-eyebrow mb-2" aria-hidden="true">
            {SHIPYARD.jobs}
          </p>
          <Checklist
            label={SHIPYARD.jobs}
            hideLabel
            items={order.map((id, index) => ({ id, label: partNamed(id).job, value: SHIPYARD.day(index + 1), checked: built.has(id), disabled: launched }))}
            onCheckedChange={tick}
          />
        </div>
      </div>
      <div className="grid gap-4 border-t border-border/70 p-4 sm:p-6">
        <Progress label={SHIPYARD.progress} value={(built.size / PARTS.length) * 100} showValue />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Crew line={line} />
          <div className="flex shrink-0 items-center gap-3" data-chapter-control="launch">
            <span className="text-sm text-muted-foreground" data-chapter-launch-hint="">
              {launched ? SHIPYARD.launched : SHIPYARD.launchHint(left)}
            </span>
            <Button size="md" disabled={!launched && left > 0} variant={left === 0 && !launched ? "solid" : "outline"} tone={left === 0 && !launched ? "primary" : "secondary"} onClick={launch}>
              {launched ? SHIPYARD.again : SHIPYARD.launch}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const tradeLabel = (value: string) => TRADES.find((trade) => trade.value === value)?.label ?? value;

/** Whether a name is someone aboard already: their whole name, or the last word of it ("Nemo"). */
function aboard(name: string): string | undefined {
  const asked = name.trim().toLowerCase();
  return CREW.find((member) => member.name.toLowerCase() === asked || member.name.split(" ").at(-1)!.toLowerCase() === asked)?.name;
}

/**
 * The ship's articles: an HX Form (name, trade and the oath, each required) signs you on to the crew
 * list beside Nemo, Aronnax, Conseil and Ned. The browser's own checks run first; the site's check
 * (a name already aboard) answers through the Form's `errors`, as a server would.
 */
function Articles(): JSX.Element {
  const [you, setYou] = useState<{ name: string; trade: string } | null>(null);
  const [answer, setAnswer] = useState<{ errors: FormErrors | undefined }>();
  const [signings, setSignings] = useState(0);
  const [line, setLine] = useState<CrewLine>(SIGN.opening);
  const sign = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const taken = aboard(name);
    if (taken) {
      setAnswer({ errors: { name: ARTICLES.taken(taken) } });
      return;
    }
    const trade = tradeLabel(String(data.get("trade")));
    setAnswer({ errors: undefined });
    setYou({ name, trade });
    setSignings((count) => count + 1);
    setLine(SIGN.welcome(name, trade));
    toast(ARTICLES.signed(name), { tone: "success", description: SIGN.welcome(name, trade).text });
  };
  const leave = () => {
    setYou(null);
    setLine(SIGN.left);
  };
  const count = CREW.length + (you ? 1 : 0);
  return (
    <div className="grid gap-8 p-4 sm:p-6 md:grid-cols-2">
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
          <Button type="submit">{ARTICLES.sign}</Button>
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
          ) : null}
        </ItemGroup>
        <Crew line={line} />
      </div>
    </div>
  );
}
