import { createContext, startTransition, use, useDeferredValue, useEffect, useRef, useState, useSyncExternalStore, type JSX } from "react";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Command } from "@/registry/ouro/components/ouro/command/command";
import { Dialog } from "@/registry/ouro/components/ouro/dialog/dialog";
import { Menu, MenuCheckboxItem, MenuItem, MenuSeparator } from "@/registry/ouro/components/ouro/menu/menu";
import { toast } from "@/registry/ouro/lib/ouro/toast";
import organSource from "../../nautilus/art/organ.svg?raw";
import squidSource from "../../nautilus/art/squid.svg?raw";
import tentacleSource from "../../nautilus/art/tentacle.svg?raw";
import { href } from "../../paths";
import { keepClearOfToasts } from "../clear-of-toasts";
import { Container } from "../layout";
import { parseArt } from "../stage/art";
import type { CrewLine } from "./copy";
import { BATTLE, CHAPTER_THREE, CODE_SHEETS_THREE, describeEncounter, ENCOUNTER, FIGHT, ORDERS, SALOON, TOASTS, type Order } from "./chapter-three-copy";
import { Composition, Crew, Handoff, PhoneMarker, Steps, useChapterReady, type Step } from "./frame";
// What only changes once the chapter answers (the squid letting go, the organ's notes): it comes
// inside this island's script and goes into the page as the island hydrates.
import chapterStyles from "./chapter-three.css?inline";

const organ = parseArt(organSource);
const squid = parseArt(squidSource);
const tentacle = parseArt(tentacleSource);

/** How the fight stands: the encounter writes it, the saloon and the rail read it. */
interface Fight {
  surfaced: boolean;
  lights: boolean;
  axes: boolean;
  won: boolean;
  played: boolean;
  line: CrewLine;
}

const START: Fight = { surfaced: false, lights: false, axes: false, won: false, played: false, line: FIGHT.opening };

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
 * site's rules; HX only carries the order here (dialog, menu, palette).
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
      else if (fight.axes && !fight.won) win({ surfaced: true });
      else say(fight.won ? FIGHT.lightsOn : FIGHT.surface, { surfaced: true });
      break;
    case "dive":
      if (!fight.won) say(FIGHT.diveHeld);
      else say(FIGHT.dive, { surfaced: false });
      break;
    case "axes":
      if (fight.axes || fight.won) say(FIGHT.axesAgain, { axes: true });
      else if (fight.surfaced) win({ axes: true });
      else say(FIGHT.axesDeep, { axes: true });
      break;
    case "lights":
      if (fight.lights) say(FIGHT.lightsOff, { lights: false });
      else say(fight.won ? FIGHT.lightsOn : FIGHT.lightsOnHeld, { lights: true });
      break;
    case "organ":
      if (!fight.won) say(FIGHT.organHeld);
      else if (!fight.played) {
        say(FIGHT.organ, { played: true });
      }
      break;
  }
}

/**
 * Chapter III, "Face the squid" (site-design.md): the encounter, where a giant squid holds the glass
 * and Ouro HX's Dialog, Menu and Command carry your orders, and the saloon, where Nemo plays the
 * organ once it has gone and the log is stamped. Each is one framed application with a Code sheet
 * saying which part is HX's and which the site's. The page hydrates it only as it nears the screen.
 */
export default function ChapterThree(): JSX.Element {
  const root = useRef<HTMLElement>(null);
  const [fight] = useState(createFight);
  useChapterReady(root, "chapter-three-styles", chapterStyles);
  return (
    <section ref={root} id="chapter-three" aria-labelledby="chapter-three-title" className="pb-20 lg:pb-32" data-chapter="three">
      <Handoff art={tentacle} line={CHAPTER_THREE.handoff} />
      <FightContext value={fight}>
        <BattleMarker />
        <Container className="grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-12 lg:grid-cols-12">
          <header className="lg:sticky lg:top-24 lg:col-span-4 lg:self-start">
            <p className="site-eyebrow">{CHAPTER_THREE.number}</p>
            <h2 id="chapter-three-title" className="site-h2 mt-3">
              {CHAPTER_THREE.title}
            </h2>
            <p className="site-lede mt-4">{CHAPTER_THREE.intro}</p>
            <Battle />
          </header>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-20 lg:col-span-8">
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
  const { surfaced, axes, played } = useFight();
  return [
    { label: BATTLE.surface, done: surfaced, status: surfaced ? BATTLE.surfaceDone : BATTLE.surfaceNot },
    { label: BATTLE.axes, done: axes, status: axes ? BATTLE.axesDone : BATTLE.axesNot },
    { label: BATTLE.organ, done: played, status: played ? BATTLE.organDone : BATTLE.organNot },
  ];
}

/** The rail beside the chapter: the organ, lit once it plays, and how the fight stands. Left out on a phone. */
function Battle(): JSX.Element {
  const steps = useBattle();
  const played = useDeferredValue(useFight().played);
  return (
    <div className="mt-10 hidden lg:block" data-chapter-battle="">
      <OrganArt className="site-organ site-organ-small" played={played} />
      <Steps label={BATTLE.label} steps={steps} />
    </div>
  );
}

function BattleMarker(): JSX.Element {
  return <PhoneMarker chapter={CHAPTER_THREE.number} title={CHAPTER_THREE.title} steps={useBattle()} />;
}

function OrganArt({ className, played, label }: { className: string; played: boolean; label?: string }): JSX.Element {
  return (
    <svg
      className={className}
      viewBox={organ.viewBox}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      data-played={played ? "" : undefined}
      dangerouslySetInnerHTML={{ __html: organ.inner }}
    />
  );
}

/** The bolts round the porthole's brass ring. */
const BOLTS = Array.from({ length: 12 }, (_, index) => {
  const angle = (index / 12) * Math.PI * 2;
  return { x: (200 + Math.cos(angle) * 186).toFixed(1), y: (200 + Math.sin(angle) * 186).toFixed(1) };
});

/** The sea's surface across the porthole, when we are up: a line of gentle waves. */
const WAVE = `M0 150 ${Array.from({ length: 10 }, (_, index) => `Q${index * 40 + 20} ${index % 2 ? 158 : 142} ${index * 40 + 40} 150`).join(" ")} V164 H0 Z`;

/** The porthole: the sea, the squid at the glass (or swimming off), the floodlights, and the surface. */
function Porthole(): JSX.Element {
  const { surfaced, lights, won } = useFight();
  return (
    <svg
      className="site-porthole"
      viewBox="0 0 400 400"
      role="img"
      aria-label={`${ENCOUNTER.scene}. ${describeEncounter({ surfaced, lights, won })}`}
      data-surfaced={surfaced ? "" : undefined}
      data-lights={lights ? "" : undefined}
      data-squid={won ? "gone" : "holding"}
    >
      <defs>
        <clipPath id="porthole-glass">
          <circle cx="200" cy="200" r="176" />
        </clipPath>
        <radialGradient id="porthole-beam" cx="0.32" cy="0.4" r="0.65">
          <stop offset="0" className="ph-beam-core" />
          <stop offset="1" className="ph-beam-edge" />
        </radialGradient>
      </defs>
      <g clipPath="url(#porthole-glass)">
        <rect className="ph-sea" width="400" height="400" />
        <g className="ph-sky">
          <rect width="400" height="150" />
          <path className="ph-wave" d={WAVE} />
        </g>
        <rect className="ph-beam" width="400" height="400" fill="url(#porthole-beam)" />
        <g className="ph-squid" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: squid.inner }} />
        <g className="ph-bubbles" fill="white" fillOpacity={0.45}>
          <circle cx="90" cy="320" r="4" />
          <circle cx="110" cy="290" r="2.5" />
          <circle cx="300" cy="330" r="3.5" />
          <circle cx="320" cy="300" r="2" />
        </g>
      </g>
      <circle className="ph-glass" cx="200" cy="200" r="176" fill="none" stroke="white" strokeOpacity={0.3} strokeWidth={3} />
      <circle className="ph-ring" cx="200" cy="200" r="186" />
      {BOLTS.map((bolt, index) => (
        <circle key={index} className="ph-bolt" cx={bolt.x} cy={bolt.y} r="4.5" />
      ))}
    </svg>
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
  const { surfaced, lights, axes, won, line } = useFight();
  const [alarm, setAlarm] = useState(false);
  // The order runs after the control's own repaint (the menu closing, the dialog going), so no
  // press waits on the porthole.
  const order = (which: Order) =>
    startTransition(() => {
      giveOrder(store, which);
      if (store.get().won) keepClearOfToasts(box.current?.querySelector("[data-chapter-crew]"));
    });
  const choose = (which: Order) => {
    setAlarm(false);
    order(which);
  };
  const orders = [
    { label: ORDERS.surface, onSelect: () => order("surface"), keywords: ["up", "rise"] },
    { label: ORDERS.dive, onSelect: () => order("dive"), keywords: ["down", "sink"] },
    { label: ORDERS.lights, onSelect: () => order("lights"), keywords: ["lamp", "light"] },
    { label: ORDERS.axes, onSelect: () => order("axes"), keywords: ["fight", "axe", "harpoon"] },
    { label: ORDERS.organ, onSelect: () => order("organ"), keywords: ["music"] },
  ];
  return (
    <div ref={box} className="grid gap-6 p-4 sm:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] sm:items-center sm:p-6">
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
              trigger={
                <Button variant="outline" tone="secondary">
                  {ENCOUNTER.orders}
                </Button>
              }
            >
              <MenuItem onClick={() => order("surface")}>{ORDERS.surface}</MenuItem>
              <MenuItem onClick={() => order("dive")}>{ORDERS.dive}</MenuItem>
              <MenuCheckboxItem checked={lights} onCheckedChange={() => order("lights")}>
                {ORDERS.lights}
              </MenuCheckboxItem>
              <MenuItem onClick={() => order("axes")}>{ORDERS.axes}</MenuItem>
              <MenuSeparator />
              <MenuItem onClick={() => order("organ")}>{ORDERS.organ}</MenuItem>
            </Menu>
          </span>
          <span data-chapter-control="palette">
            <Command
              title={ENCOUNTER.paletteTitle}
              searchLabel={ENCOUNTER.paletteSearch}
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
            <Badge tone={surfaced ? "primary" : "secondary"} variant="soft">
              {surfaced ? ENCOUNTER.surfaced : ENCOUNTER.deep}
            </Badge>
            <Badge tone={lights ? "primary" : "secondary"} variant="soft">
              {lights ? ENCOUNTER.lightsOn : ENCOUNTER.lightsOff}
            </Badge>
            <Badge tone={axes ? "primary" : "secondary"} variant="soft">
              {axes ? ENCOUNTER.axesReady : ENCOUNTER.axesStowed}
            </Badge>
          </p>
        </div>
        <Crew line={line} cheer={won} />
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
            <span className="grid" data-chapter-control="axes">
              <Button onClick={() => choose("axes")}>{ORDERS.axes}</Button>
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
 * The saloon: once the squid has gone, Play sets Nemo at the organ, the notes rise, and the log is
 * stamped; then the way into the library, or round again.
 */
function Saloon(): JSX.Element {
  const store = useFightStore();
  const { won, played } = useFight();
  // Play answers at once (the button and its hint); the organ, the stamp, the way on and the toast
  // follow in a render of their own.
  const shown = useDeferredValue(played);
  const next = useRef<HTMLDivElement>(null);
  const [rounds, setRounds] = useState(0);
  // Played: the toast, and focus goes to the way into the library. Round again: back to the alarm.
  useEffect(() => {
    if (!shown) return;
    toast(TOASTS.organ, { tone: "success", description: TOASTS.organNote });
    next.current?.querySelector<HTMLElement>("a")?.focus();
  }, [shown]);
  useEffect(() => {
    if (rounds) document.querySelector<HTMLElement>("#chapter-three [data-chapter-control='alarm'] button")?.focus();
  }, [rounds]);
  const again = () => {
    store.set({ ...START, line: FIGHT.again });
    setRounds((count) => count + 1);
  };
  return (
    <div className="grid gap-6 p-4 sm:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] sm:items-center sm:p-6">
      <figure className="m-0">
        <OrganArt className="site-organ" played={shown} label={shown ? `${SALOON.organ}. ${SALOON.playing}` : SALOON.organ} />
      </figure>
      <div className="grid content-start gap-5">
        <div className="site-log grid gap-2" data-chapter-log={shown ? "done" : "waiting"}>
          <p className="site-eyebrow">{SALOON.log}</p>
          {shown ? (
            <>
              <p className="site-stamp m-0" data-chapter-stamp="">
                {SALOON.stamp}
              </p>
              <p className="m-0 text-sm">{SALOON.logDone}</p>
            </>
          ) : (
            <p className="m-0 text-sm text-muted-foreground">{SALOON.logWaiting}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span data-chapter-control="organ">
            <Button disabled={!won || played} variant={won && !played ? "solid" : "outline"} tone={won && !played ? "primary" : "secondary"} onClick={() => giveOrder(store, "organ")}>
              {SALOON.play}
            </Button>
          </span>
          <span className="text-sm text-muted-foreground" data-chapter-organ-hint="">
            {played ? SALOON.playing : won ? null : SALOON.playHint}
          </span>
        </div>
        {shown ? (
          <div ref={next} className="grid gap-3 border-t border-border/70 pt-5" data-chapter-next="">
            <p className="m-0 font-medium">{SALOON.next}</p>
            <div className="flex flex-wrap gap-3">
              <span data-chapter-control="install">
                <Button href={href("/docs/installing/")}>{SALOON.install}</Button>
              </span>
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
    </div>
  );
}
