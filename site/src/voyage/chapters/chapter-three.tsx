import { createContext, use, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type JSX, type MouseEvent } from "react";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Command } from "@/registry/ouro/components/ouro/command/command";
import { Dialog } from "@/registry/ouro/components/ouro/dialog/dialog";
import { Menu, MenuCheckboxItem, MenuItem, MenuSeparator } from "@/registry/ouro/components/ouro/menu/menu";
import { toast } from "@/registry/ouro/lib/ouro/toast";
import { href } from "../../paths";
import { SCENES, STORYBOOK, sceneSources, type SceneName } from "../../storybook";
import { keepClearOfToasts } from "../clear-of-toasts";
import { Container } from "../layout";
import type { CrewLine } from "./copy";
import { BATTLE, CHAPTER_THREE, CODE_SHEETS_THREE, describeEncounter, ENCOUNTER, FIGHT, ORDERS, SALOON, TOASTS, voyageLog, type Order } from "./chapter-three-copy";
import { afterPaint, useAfterPaint } from "../after-paint";
import { HandOff } from "../handoff";
import { setXray, useXray } from "../xray-store";
import { ChapterPicture, Composition, Crew, Handoff, PhoneMarker, Steps, useChapterReady, type Step } from "./frame";
import { firstName, useLogbook } from "./logbook";
// What only changes once the chapter answers (the squid letting go, the organ's glow): it comes
// inside this island's script and goes into the page as the island hydrates.
import chapterStyles from "./chapter-three.css?inline";

/**
 * One of the chapter's paintings (storybook.ts), by day, or at night in dark mode, as its files serve it: AVIF then
 * WebP at each width. Its box is the caller's; the picture fills it (`cover`), centred, so the porthole shows the
 * painting's middle circle. It loads as it nears the screen, and its night twin only when it is shown. With `alt`,
 * a screen reader hears it; without, it is a layer of a picture the caller names.
 */
function Painting({ scene, sizes, alt = false, className }: { scene: SceneName; sizes: string; alt?: boolean; className?: string }): JSX.Element {
  const at = (path: string) => href(`${STORYBOOK}${path}`);
  return (
    <>
      {[false, true].map((night) => {
        const { wide, header } = sceneSources(scene, at, night);
        return (
          <picture key={String(night)} className={`${night ? "story-world-night" : "story-world-day"} ${className ?? ""}`} style={{ height: "100%" }} data-brand-scene={night ? `${scene}-dark` : scene}>
            <source type="image/avif" srcSet={wide("avif")} sizes={sizes} />
            <source type="image/webp" srcSet={wide("webp")} sizes={sizes} />
            <img
              src={header}
              alt={alt ? ((night ? SCENES[scene].night.alt : undefined) ?? SCENES[scene].alt) : ""}
              width={1536}
              height={1024}
              loading="lazy"
              decoding="async"
              draggable={false}
              style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
            />
          </picture>
        );
      })}
    </>
  );
}

/** How the fight stands: the encounter writes it, the saloon and the rail read it. */
interface Fight {
  surfaced: boolean;
  lights: boolean;
  feathers: boolean;
  won: boolean;
  played: boolean;
  line: CrewLine;
}

const START: Fight = { surfaced: false, lights: false, feathers: false, won: false, played: false, line: FIGHT.opening };

function createFight() {
  let state = START;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(next: Partial<Fight>) {
      state = { ...state, ...next };
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
type FightStore = ReturnType<typeof createFight>;
const FightContext = createContext<FightStore | null>(null);
const useFightStore = () => use(FightContext)!;
const useFight = () => {
  const store = useFightStore();
  return useSyncExternalStore(store.subscribe, store.get, store.get);
};

/**
 * Runs an order on the fight: what changes, what the crew says, and the toast when the squid lets
 * go. (The organ's toast comes with the saloon's deferred render, so Play answers at once.) The
 * organ's tune starts here too, in the press that gave the order, so the saloon's Play, the menu
 * and the palette all play it. The site's rules; HX only carries the order here (dialog, menu, palette).
 */
function giveOrder(store: FightStore, order: Order): void {
  const fight = store.get();
  const say = (line: CrewLine, next: Partial<Fight> = {}) => store.set({ ...next, line });
  const win = (next: Partial<Fight>) => {
    say(FIGHT.win, { ...next, won: true });
    toast(TOASTS.win, { tone: "success", description: TOASTS.winNote });
  };
  switch (order) {
    case "surface":
      if (fight.surfaced) say(FIGHT.surfaceAgain);
      else if (fight.feathers && !fight.won) win({ surfaced: true });
      else say(fight.won ? FIGHT.surfaceFree : FIGHT.surface, { surfaced: true });
      break;
    case "dive":
      if (fight.won) say(FIGHT.dive, { surfaced: false });
      break;
    case "feathers":
      if (fight.feathers || fight.won) say(FIGHT.feathersAgain, { feathers: true });
      else if (fight.surfaced) win({ feathers: true });
      else say(FIGHT.feathersDeep, { feathers: true });
      break;
    case "lights":
      if (fight.lights) say(FIGHT.lightsOff, { lights: false });
      else say(fight.won ? FIGHT.lightsOn : FIGHT.lightsOnHeld, { lights: true });
      break;
    case "organ":
      if (!fight.won) break;
      if (!fight.played) say(FIGHT.organ, { played: true });
      playTune();
      break;
  }
}

/**
 * Chapter III, "Face the squid" (site-design.md): the encounter, where a giant squid holds the glass
 * and Ouro HX's Dialog, Menu and Command carry your orders, and the saloon, where Nemo plays the
 * organ once it has gone and the log gets its last line. Each is one framed application with a Code sheet
 * saying which part is HX's and which the site's. The page hydrates it only as it nears the screen.
 */
export default function ChapterThree(): JSX.Element {
  const root = useRef<HTMLElement>(null);
  const [fight] = useState(createFight);
  useChapterReady(root, "chapter-three-styles", chapterStyles);
  return (
    <section ref={root} id="chapter-three" aria-labelledby="chapter-three-title" className="pb-20 lg:pb-32" data-chapter="three">
      <Handoff line={CHAPTER_THREE.handoff} />
      <FightContext value={fight}>
        <BattleMarker />
        <Container className="grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-12 lg:grid-cols-12">
          <header className="lg:top-24 lg:col-span-4 lg:self-start lg:[@media(min-height:56rem)]:sticky">
            <SaloonPicture className="mb-8 lg:hidden" />
            <p className="site-eyebrow">{CHAPTER_THREE.number}</p>
            <h2 id="chapter-three-title" className="site-h2 mt-3">
              {CHAPTER_THREE.title}
            </h2>
            <p className="site-lede mt-4">{CHAPTER_THREE.intro}</p>
            <Battle />
          </header>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-16 lg:col-span-8">
            <Composition id="encounter" title={ENCOUNTER.title} intro={ENCOUNTER.intro} file={ENCOUNTER.file} sheet={CODE_SHEETS_THREE.encounter}>
              <Encounter />
            </Composition>
            <Composition id="saloon" title={SALOON.title} intro={SALOON.intro} file={SALOON.file} sheet={CODE_SHEETS_THREE.saloon}>
              <Saloon />
            </Composition>
          </div>
        </Container>
      </FightContext>
    </section>
  );
}

function useBattle(): Step[] {
  const { surfaced, feathers, played } = useFight();
  return [
    { label: BATTLE.surface, done: surfaced, status: surfaced ? BATTLE.surfaceDone : BATTLE.surfaceNot },
    { label: BATTLE.feathers, done: feathers, status: feathers ? BATTLE.feathersDone : BATTLE.feathersNot },
    { label: BATTLE.organ, done: played, status: played ? BATTLE.organDone : BATTLE.organNot },
  ];
}

/** The rail beside the chapter: the squid at the saloon's window, and how the rescue stands. Left out on a phone, where the picture opens the chapter. */
function Battle(): JSX.Element {
  const steps = useBattle();
  return (
    <div className="mt-10 hidden lg:block" data-chapter-battle="">
      <SaloonPicture />
      <Steps label={BATTLE.label} steps={steps} />
    </div>
  );
}

/** The squid at the saloon's window, until it lets go: then the window shows open sea, faded in, until the organ calls it back. */
function SaloonPicture({ className }: { className?: string }): JSX.Element {
  const { won, played } = useFight();
  return <ChapterPicture scene="nautilus-squid" state={{ scene: "nautilus-squid-free", shown: won && !played }} {...(className ? { className } : {})} />;
}

function BattleMarker(): JSX.Element {
  return <PhoneMarker chapter={CHAPTER_THREE.number} title={CHAPTER_THREE.title} steps={useBattle()} />;
}

/**
 * The saloon's organ, painted: the captain at the keys and a small robot at the bellows, quiet until the fight is
 * won and Play is pressed; then the same picture with its pipes glowing and the squid come back to the window to
 * listen, faded in over it. Only its opacity changes, so under reduced motion nothing moves.
 */
function OrganArt({ played, label }: { played: boolean; label: string }): JSX.Element {
  return (
    <div className="site-organ relative aspect-[3/2] overflow-hidden rounded-ouro-xl border border-border bg-muted" role="img" aria-label={label} data-played={played ? "" : undefined}>
      <Painting scene="nautilus-organ" sizes={ORGAN_SIZES} />
      {/* Its opacity is inline, so the server HTML has it before the island's styles come. */}
      <div className="or-playing absolute inset-0" style={{ opacity: played ? 1 : 0 }}>
        <Painting scene="nautilus-organ-playing" sizes={ORGAN_SIZES} />
      </div>
    </div>
  );
}

/** How wide the organ's picture draws: half the window's body beside the log on a wide screen, the column below it. */
const ORGAN_SIZES = "(min-width: 64rem) 22rem, (min-width: 40rem) 40vw, 92vw";

/**
 * The organ's tune, from the press that plays it: the famous opening flourish of Bach's Toccata in
 * D minor, on a few sine waves an octave apart, quiet, about three seconds. Web Audio only, made
 * here; nothing is fetched. Where the browser has no Web Audio, the organ plays in silence. The
 * press makes the audio context, so a browser that only lets a press start sound lets it play;
 * its three dozen pipes are built in a task after the press's frame (afterPaint), which they held
 * up by several milliseconds on a slow CPU, and the first note starts 50 ms after that.
 */
const TUNE: ReadonlyArray<[midi: number, beats: number]> = [
  [81, 0.25], [79, 0.25], [81, 1.5], [79, 0.25], [77, 0.25], [76, 0.25], [74, 0.25], [73, 0.75], [74, 2],
];
export function playTune(): void {
  const Context = typeof window === "undefined" ? undefined : window.AudioContext;
  if (!Context) return;
  const audio = new Context();
  afterPaint(() => play(audio));
}

/** Builds the tune's pipes on `audio` and plays them, then closes it. */
function play(audio: AudioContext): void {
  const out = audio.createGain();
  out.gain.value = 0.08;
  out.connect(audio.destination);
  const beat = 0.32;
  let at = audio.currentTime + 0.05;
  for (const [midi, beats] of TUNE) {
    const frequency = 440 * 2 ** ((midi - 69) / 12);
    const length = beats * beat;
    for (const [harmonic, level] of [[0.5, 0.6], [1, 1], [2, 0.45], [4, 0.2]] as const) {
      const pipe = audio.createOscillator();
      const gain = audio.createGain();
      pipe.frequency.value = frequency * harmonic;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(level, at + 0.02);
      gain.gain.setValueAtTime(level, at + length - 0.04);
      gain.gain.linearRampToValueAtTime(0, at + length);
      pipe.connect(gain).connect(out);
      pipe.start(at);
      pipe.stop(at + length + 0.02);
    }
    at += length;
  }
  window.setTimeout(() => void audio.close(), (at - audio.currentTime + 0.5) * 1000);
}

/** The bolts round the porthole's brass ring. */
const BOLTS = Array.from({ length: 12 }, (_, index) => {
  const angle = (index / 12) * Math.PI * 2;
  return { x: (200 + Math.cos(angle) * 186).toFixed(1), y: (200 + Math.sin(angle) * 186).toFixed(1) };
});

/** The sea behind the glass until the painting arrives: lit near the top, deepening below, as the stage's is. */
const SEA_TOP = "color-mix(in oklab, var(--primary) 40%, oklch(0.46 0.08 220))";
const SEA_DEEP = "color-mix(in oklab, var(--primary) 20%, oklch(0.14 0.035 250))";
/**
 * The ring's brass: turned metal, lit from the upper left and shadowed lower right with a glint on the far edge, as
 * the home page's porthole is. Brass is brass in every look, as in the chapter's picture, so it is not mixed from the
 * theme's chart colours (in some looks those are a signal yellow); at night it sits a little darker.
 */
const BRASS = "color-mix(in oklab, oklch(0.7 0.1 78) 88%, var(--background))";
const METAL = [
  { offset: 0, color: `color-mix(in oklab, ${BRASS} 55%, white)` },
  { offset: 0.45, color: BRASS },
  { offset: 0.8, color: `color-mix(in oklab, ${BRASS} 62%, oklch(0.22 0.03 60))` },
  { offset: 1, color: `color-mix(in oklab, ${BRASS} 78%, white)` },
] as const;

/** How wide the porthole's paintings draw: the glass shows their middle, a square two thirds of their width. */
const PORTHOLE_SIZES = "(min-width: 40rem) 33rem, 130vw";

/**
 * The porthole: the squid holding the glass, painted in the frosted-glass world of the chapter's pictures, then the
 * same sea with the squid gone behind its ink once it lets go. The two paintings are stacked inside the glass, the
 * squid's on a layer of its own (`will-change-transform`), so with motion it drifts off into the deep as it fades,
 * without repainting the sea or the menu that gave the order; under reduced motion it only fades. Over them, the
 * light from the surface when we are up, the floodlights, the glass and its brass ring. The ring and its bolts carry
 * their colours in the server HTML; the rest comes with the island (chapter-three.css).
 */
function Porthole(): JSX.Element {
  const fight = useFight();
  // The picture follows the order once its press has painted: the menu closing, the dialog going.
  const { surfaced, lights, won, played } = useAfterPaint(useMemo(() => ({ surfaced: fight.surfaced, lights: fight.lights, won: fight.won, played: fight.played }), [fight.surfaced, fight.lights, fight.won, fight.played]));
  return (
    <div
      className="site-porthole"
      style={{ position: "relative", width: "100%", maxWidth: "22rem", aspectRatio: "1", marginInline: "auto" }}
      role="img"
      aria-label={`${ENCOUNTER.scene}. ${describeEncounter({ surfaced, lights, won, played })}`}
      data-surfaced={surfaced ? "" : undefined}
      data-lights={lights ? "" : undefined}
      data-squid={played ? "listening" : won ? "gone" : "holding"}
    >
      <svg viewBox="0 0 400 400" fill="none" aria-hidden="true" className="absolute inset-0 size-full">
        <defs>
          <linearGradient id="porthole-sea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: SEA_TOP }} />
            <stop offset="1" style={{ stopColor: SEA_DEEP }} />
          </linearGradient>
        </defs>
        <circle className="ph-sea" cx="200" cy="200" r="176" style={{ fill: "url(#porthole-sea)" }} />
      </svg>
      <div className="absolute inset-0 overflow-hidden" style={{ clipPath: "circle(44%)" }}>
        <div className="ph-free absolute inset-0">
          <Painting scene="nautilus-porthole-free" sizes={PORTHOLE_SIZES} />
        </div>
        <div className="ph-squid absolute inset-0 will-change-transform">
          <Painting scene="nautilus-porthole" sizes={PORTHOLE_SIZES} />
        </div>
      </div>
      <svg viewBox="0 0 400 400" fill="none" aria-hidden="true" className="absolute inset-0 size-full">
        <defs>
          <clipPath id="porthole-glass">
            <circle cx="200" cy="200" r="176" />
          </clipPath>
          <linearGradient id="porthole-surface" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="ph-surface-top" />
            <stop offset="0.6" className="ph-surface-end" />
          </linearGradient>
          <radialGradient id="porthole-beam" cx="0.32" cy="0.4" r="0.65">
            <stop offset="0" className="ph-beam-core" />
            <stop offset="1" className="ph-beam-edge" />
          </radialGradient>
          <linearGradient id="porthole-metal" x1="0.15" y1="0" x2="0.85" y2="1">
            {METAL.map((stop) => (
              <stop key={stop.offset} offset={stop.offset} style={{ stopColor: stop.color }} />
            ))}
          </linearGradient>
          <radialGradient id="porthole-vignette" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0.7" style={{ stopColor: SEA_DEEP, stopOpacity: 0 }} />
            <stop offset="1" style={{ stopColor: SEA_DEEP, stopOpacity: 0.55 }} />
          </radialGradient>
          <linearGradient id="porthole-sheen" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: "white", stopOpacity: 0.28 }} />
            <stop offset="0.55" style={{ stopColor: "white", stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        <g clipPath="url(#porthole-glass)">
          <rect className="ph-surface" width="400" height="400" fill="url(#porthole-surface)" opacity={0} />
          <rect className="ph-beam" width="400" height="400" fill="url(#porthole-beam)" opacity={0} />
        </g>
        <circle cx="200" cy="200" r="176" fill="url(#porthole-vignette)" />
        <circle className="ph-sheen" cx="200" cy="200" r="176" fill="url(#porthole-sheen)" />
        <circle className="ph-glass" cx="200" cy="200" r="176" stroke="white" strokeOpacity={0.3} strokeWidth={3} />
        <circle className="ph-ring" cx="200" cy="200" r="186" style={{ stroke: "url(#porthole-metal)", strokeWidth: "18" }} />
        <circle cx="200" cy="200" r="177" style={{ stroke: `color-mix(in oklab, ${BRASS} 45%, oklch(0.2 0.02 60))`, strokeWidth: "2", strokeOpacity: 0.6 }} />
        <g className="ph-bolts" style={{ fill: `color-mix(in oklab, ${BRASS} 70%, oklch(0.3 0.03 60))`, stroke: `color-mix(in oklab, ${BRASS} 40%, oklch(0.18 0.02 60))`, strokeWidth: "1.2" }}>
          {BOLTS.map((bolt, index) => (
            <circle key={index} cx={bolt.x} cy={bolt.y} r="4.5" />
          ))}
        </g>
      </svg>
    </div>
  );
}

/**
 * The encounter: the porthole with the squid at the glass, and the ways to give an order. The
 * alarm opens a Dialog with two choices; the Menu and the Command palette list every order. Each
 * runs the same rule (giveOrder), so whichever way you choose, the squid answers the same.
 */
function Encounter(): JSX.Element {
  const store = useFightStore();
  const box = useRef<HTMLDivElement>(null);
  const { surfaced, lights, feathers, won, line } = useFight();
  // Once you have signed on in Chapter I, the crew know you: Ned's line at the win names you, and you cheer with them.
  const you = useLogbook((log) => log.you);
  const said = line === FIGHT.win && you ? FIGHT.winWith(firstName(you.name)) : line;
  const [alarm, setAlarm] = useState(false);
  // The order changes the fight at once (the store renders in the press's frame, so its badges
  // and the crew's line answer with it); the porthole and the organ redraw after that frame has
  // painted (useAfterPaint), so no press waits on a drawing.
  const order = (which: Order) => {
    giveOrder(store, which);
    if (store.get().won) keepClearOfToasts(box.current?.querySelector("[data-chapter-crew]"));
  };
  const choose = (which: Order) => {
    setAlarm(false);
    order(which);
  };
  // Dive and the organ wait for the squid to let go: listed, but off, in the menu and the palette alike.
  const held = { disabled: !won, ...(won ? {} : { description: ENCOUNTER.heldOrder }) };
  const orders = [
    { label: ORDERS.surface, onSelect: () => order("surface"), keywords: ["up", "rise"] },
    { label: ORDERS.dive, onSelect: () => order("dive"), keywords: ["down", "sink"], ...held },
    { label: ORDERS.lights, onSelect: () => order("lights"), keywords: ["lamp", "light"] },
    { label: ORDERS.feathers, onSelect: () => order("feathers"), keywords: ["coax", "squid", "lantern"] },
    { label: ORDERS.organ, onSelect: () => order("organ"), keywords: ["music"], ...held },
  ];
  return (
    <div ref={box} className="site-split grid gap-6 py-4 sm:items-center sm:py-6">
      <figure className="m-0">
        <Porthole />
      </figure>
      <div className="grid content-start gap-5">
        <div className="flex flex-wrap gap-3">
          <span data-chapter-control="alarm">
            <Button
              tone="destructive"
              aria-haspopup="dialog"
              onClick={() => {
                setAlarm(true);
                store.set({ line: FIGHT.alarm });
              }}
            >
              {ENCOUNTER.alarm}
            </Button>
          </span>
          <span data-chapter-control="orders">
            <Menu
              // Not holding the page spares WebKit a layout and repaint of the whole voyage on each open and close.
              modal={false}
              trigger={
                <Button variant="outline" tone="secondary">
                  {ENCOUNTER.orders}
                </Button>
              }
            >
              <MenuItem onClick={() => order("surface")}>{ORDERS.surface}</MenuItem>
              <MenuItem disabled={!won} onClick={() => order("dive")}>
                {ORDERS.dive}
              </MenuItem>
              <MenuCheckboxItem checked={lights} onCheckedChange={() => order("lights")}>
                {ORDERS.lights}
              </MenuCheckboxItem>
              <MenuItem onClick={() => order("feathers")}>{ORDERS.feathers}</MenuItem>
              <MenuSeparator />
              <MenuItem disabled={!won} onClick={() => order("organ")}>
                {ORDERS.organ}
              </MenuItem>
            </Menu>
          </span>
          <span data-chapter-control="palette">
            <Command
              title={ENCOUNTER.paletteTitle}
              searchLabel={ENCOUNTER.paletteSearch}
              placeholder={ENCOUNTER.palettePlaceholder}
              trigger={
                <Button variant="outline" tone="secondary">
                  {ENCOUNTER.palette}
                </Button>
              }
              items={orders}
            />
          </span>
        </div>
        <div className="grid gap-2">
          <p className="site-eyebrow">{ENCOUNTER.status}</p>
          <p className="m-0 flex flex-wrap gap-1.5" data-chapter-status="">
            <Badge tone={won ? "success" : "destructive"} variant="soft">
              {won ? ENCOUNTER.free : ENCOUNTER.held}
            </Badge>
            <Badge tone={surfaced ? "primary" : "secondary"} variant={surfaced ? "soft" : "outline"}>
              {surfaced ? ENCOUNTER.surfaced : ENCOUNTER.deep}
            </Badge>
            <Badge tone={lights ? "primary" : "secondary"} variant={lights ? "soft" : "outline"}>
              {lights ? ENCOUNTER.lightsOn : ENCOUNTER.lightsOff}
            </Badge>
            <Badge tone={feathers ? "primary" : "secondary"} variant={feathers ? "soft" : "outline"}>
              {feathers ? ENCOUNTER.feathersReady : ENCOUNTER.feathersStowed}
            </Badge>
          </p>
        </div>
        <Crew line={said} cheer={won} you={you?.name} />
      </div>
      <Dialog
        title={ENCOUNTER.dialog}
        description={ENCOUNTER.dialogText}
        open={alarm}
        onOpenChange={setAlarm}
        footer={
          <>
            <span className="grid" data-chapter-control="surface">
              <Button variant="outline" tone="secondary" onClick={() => choose("surface")}>
                {ENCOUNTER.hope}
              </Button>
            </span>
            <span className="grid" data-chapter-control="feathers">
              <Button onClick={() => choose("feathers")}>{ORDERS.feathers}</Button>
            </span>
          </>
        }
      >
        <p className="m-0 text-sm">{ENCOUNTER.dialogBody}</p>
      </Dialog>
    </div>
  );
}

/**
 * The saloon: once the squid has gone, Play sets Nemo at the organ, its pipes glow, and the log gets
 * its last line; then the hand-off to a coding agent, the components, or round again. The log holds
 * only what has happened: it opens with what the reader did in the chapters before (logbook.ts), so
 * a reader who jumps straight here never reads that a ship was built.
 * Play stays where it is and keeps focus (a second press plays the tune again), so nothing scrolls.
 */
function Saloon(): JSX.Element {
  const store = useFightStore();
  const { won, played } = useFight();
  // The hint beside Play says why it is off, and Play is described by it, so a screen reader says why too.
  const hint = useId();
  const nextLine = useId();
  // Play answers at once (the button and its hint); the organ, the log's line and the way on follow in a render of their own.
  const shown = useAfterPaint(played);
  const [round, setRound] = useState({ count: 0, pointer: false });
  // Focus goes back once the press has painted: React runs this effect in the press's own frame, and the focus
  // scrolls the page up to the alarm, so the press waited on a layout and on painting the whole new view (#1393).
  // A pointer press glides the page up to the squid (at once under reduced motion) and moves focus without a scroll of
  // its own, which WebKit would make in one jump; a key press lets focus take the reader's place to the alarm.
  useEffect(() => {
    if (!round.count || shown) return;
    return afterPaint(() => {
      const chapter = document.getElementById("chapter-three");
      const alarm = chapter?.querySelector<HTMLElement>("[data-chapter-control='alarm'] button");
      if (!round.pointer) return alarm?.focus();
      alarm?.focus({ preventScroll: true });
      chapter?.querySelector("[data-composition='encounter'] figure")?.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    });
  }, [round, shown]);
  const again = (event: MouseEvent) => {
    store.set({ ...START, line: FIGHT.again });
    // A click from Enter or Space has no presses to count (detail 0); a mouse's, a pen's or a finger's has.
    setRound(({ count }) => ({ count: count + 1, pointer: event.detail > 0 }));
  };
  const voyage = useLogbook((log) => log);
  const log = [...voyageLog(voyage), SALOON.logHeld, ...(won ? [SALOON.logFree] : []), ...(shown ? [SALOON.logPlayed] : [])];
  return (
    <div className="grid gap-6 py-4 sm:py-6">
      <div className="site-split grid gap-6 sm:items-center">
        <figure className="m-0">
          <OrganArt played={shown} label={shown ? `${SALOON.organ}. ${SALOON.playing}` : SALOON.organ} />
        </figure>
        <div className="grid content-start gap-5">
          <div className="grid gap-2" data-chapter-log={shown ? "done" : won ? "free" : "held"}>
            <p className="site-eyebrow">{SALOON.log}</p>
            <ol className="m-0 grid list-none gap-2 p-0 text-sm">
              {log.map((line, index) => (
                <li key={line} className="flex items-baseline gap-3">
                  <span className="site-mono w-6 shrink-0 text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                  <span>{line}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span data-chapter-control="organ">
              <Button
                disabled={!won}
                aria-describedby={hint}
                variant={won && !played ? "solid" : "outline"}
                tone={won && !played ? "primary" : "secondary"}
                onClick={() => giveOrder(store, "organ")}
              >
                {played ? SALOON.playAgain : SALOON.play}
              </Button>
            </span>
            <span id={hint} className="text-sm text-muted-foreground" data-chapter-organ-hint="">
              {played ? SALOON.playing : won ? null : SALOON.playHint}
            </span>
          </div>
        </div>
      </div>
      {shown ? (
        <div className="grid gap-4 border-t border-border pt-5" data-chapter-next="">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p id={nextLine} className="m-0 font-medium">
              {SALOON.next} {SALOON.build}
            </p>
            <span data-chapter-control="reveal">
              <Reveal describedBy={nextLine} />
            </span>
          </div>
          <span className="grid" data-chapter-control="handoff">
            <HandOff id="saloon-handoff-label" full={false} />
          </span>
          <div className="flex flex-wrap gap-3">
            <span data-chapter-control="components">
              <Button href={href("/docs/")} variant="outline" tone="secondary">
                {SALOON.components}
              </Button>
            </span>
            <span data-chapter-control="again">
              <Button variant="plain" tone="secondary" onClick={again}>
                {SALOON.again}
              </Button>
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Show me: X-ray on and off from the end of the voyage, so every control the reader has just used
 * wears its Ouro HX name. A Button with `aria-pressed`, not HX's Toggle: Button's styles are already
 * in the voyage's CSS, and Toggle's would take the page over its CSS budget. It is the header's switch's own state (xray-store.ts), so the two always
 * agree, and only this toggle re-renders when it changes. The reader's place stays put: X-ray opens
 * over the page without scrolling or taking focus.
 */
function Reveal({ describedBy }: { describedBy: string }): JSX.Element {
  const on = useXray();
  return (
    <Button size="sm" variant={on ? "soft" : "outline"} tone={on ? "primary" : "secondary"} aria-pressed={on} aria-describedby={describedBy} onClick={() => setXray(!on)}>
      {SALOON.reveal}
    </Button>
  );
}
