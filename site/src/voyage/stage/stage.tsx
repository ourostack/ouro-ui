import { memo, startTransition, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type JSX, type SVGProps } from "react";
import { Avatar } from "@/registry/ouro/components/ouro/avatar/avatar";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Collapsible } from "@/registry/ouro/components/ouro/collapsible/collapsible";
import { Link } from "@/registry/ouro/components/ouro/link/link";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";
import { SegmentedControl } from "@/registry/ouro/components/ouro/segmented-control/segmented-control";
import { Slider } from "@/registry/ouro/components/ouro/slider/slider";
import { Switch } from "@/registry/ouro/components/ouro/switch/switch";
import { toast } from "@/registry/ouro/lib/ouro/toast";
import { keepClearOfToasts } from "../clear-of-toasts";
import { GITHUB } from "../../paths";
import { bandAt, BANDS, BELL_TOASTS, describeScene, LOG, MAX_DEPTH, OPENING_LOG, SPEEDS, STAGE_COPY, TANKS, type LogLine, type Speed } from "./copy";
import { Scene } from "./scene";
import "./stage.css";

interface Entry extends LogLine {
  id: number;
}

/** Where a dive takes the porthole: the top of the midnight water, where the lantern finds things. */
const DIVE_DEPTH = 200;

/** The ship's log keeps its newest five lines; the newest is the crew line under the porthole. */
const KEEP = 5;

/** Where the stage's own source lives, for "Source" beside "See how it's built". */
export const STAGE_SOURCE = `${GITHUB}/tree/main/site/src/voyage/stage`;

function BellIcon(props: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <g className="stage-bell-body">
        <path d="M5 13.5V9a5 5 0 0 1 10 0v4.5l1.5 1.5h-13Z" />
        <path d="M8.5 17a1.5 1.5 0 0 0 3 0" />
      </g>
    </svg>
  );
}

function ChimeIcon(props: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 10.5l3.5 3.5L16 5.5" />
    </svg>
  );
}

/** A handler whose identity never changes but which always runs the latest render's code. */
function useStable<Args extends unknown[]>(handler: (...args: Args) => void): (...args: Args) => void {
  const latest = useRef(handler);
  useLayoutEffect(() => {
    latest.current = handler;
  });
  return useCallback((...args: Args) => latest.current(...args), []);
}

/**
 * A value that follows `value` once the frame that shows the change has painted. The porthole's
 * picture is an SVG of engraved drawings, and any change to it (a fish, the sonar, a bubble) lays
 * out the whole drawing again: tens of milliseconds on a slow CPU. As a deferred render
 * (`useDeferredValue`) React may commit it before the browser paints the press, whenever the next
 * frame is further off than React's render, and then that frame lays out the drawing first. Set
 * from a task after the next frame instead, it always lands a frame after the press.
 */
function useAfterPaint<T>(value: T): T {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    let timer = 0;
    const frame = requestAnimationFrame(() => {
      timer = window.setTimeout(() => startTransition(() => setShown(value)));
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [value]);
  return shown;
}

type TankId = (typeof TANKS)[number]["id"];
const EMPTY: Record<TankId, boolean> = { fore: false, middle: false, aft: false };

/**
 * The hero's stage: a porthole onto the sea and the Nautilus's console under it, in one frame,
 * every control an Ouro HX component. The site owns the state (depth, tanks, dive, lights, speed,
 * the log); HX owns how each control behaves, reads out and moves. Each control is its own memoized
 * piece with steady handlers, so pressing one re-renders that control, the log and the picture's
 * attributes, nothing else.
 */
export function Stage({ onXray }: { onXray: () => void }): JSX.Element {
  const [depth, setDepth] = useState(0);
  const [tanks, setTanks] = useState<Record<TankId, boolean>>(EMPTY);
  const [dived, setDived] = useState(false);
  const [stream, setStream] = useState(0);
  const [rings, setRings] = useState(0);
  const [logOpen] = useState(createFlag);
  const [lights, setLights] = useState(false);
  const [speed, setSpeed] = useState<Speed>("half");
  const [log, setLog] = useState<Entry[]>(() => OPENING_LOG.map((line, index) => ({ ...line, id: index })));
  const nextId = useRef(OPENING_LOG.length);
  const depthAtLastLog = useRef(0);
  const root = useRef<HTMLDivElement>(null);
  const [offscreen, setOffscreen] = useState(false);

  const band = bandAt(depth);
  const full = TANKS.filter((tank) => tanks[tank.id]).length;
  // The crew's line follows the control's own change by a frame: it's a transition, so the press
  // paints first.
  const write = (line: LogLine) => {
    const id = nextId.current++;
    startTransition(() => setLog((previous) => [...previous, { ...line, id }].slice(-KEEP)));
  };
  const goTo = (fathoms: number) => {
    setDepth(fathoms);
    depthAtLastLog.current = fathoms;
  };

  // Fish drift only while the stage is on screen. The newest entry is the current state.
  useEffect(() => {
    const element = root.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => setOffscreen(!entries[entries.length - 1]!.isIntersecting));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const onDepth = useStable((value: number) => {
    // Going down sends up a stream of bubbles.
    if (value > depth) setStream((count) => (value - depth >= 20 || count === 0 ? count + 1 : count));
    setDepth(value);
  });
  const onDepthCommitted = useStable((value: number) => {
    const next = bandAt(value);
    if (next !== bandAt(depthAtLastLog.current)) write(LOG.band[next]);
    depthAtLastLog.current = value;
  });
  const onTank = useStable((id: TankId, on: boolean) => {
    const next = { ...tanks, [id]: on };
    setTanks(next);
    const tank = TANKS.find((entry) => entry.id === id)!;
    const count = TANKS.filter((entry) => next[entry.id]).length;
    // The third full tank is a small celebration: the tanks gurgle and the hull's lights come up.
    if (on && count === 3) setStream((streams) => streams + 1);
    if (!on && dived) {
      setDived(false);
      goTo(0);
      write(LOG.surface);
    } else write(on ? (count === 3 ? LOG.allFull : LOG.tankFull(tank.noun, count)) : LOG.tankEmpty(tank.noun));
  });
  // The ship moves and the button turns at once; the porthole's descent and the emptied tanks
  // follow as a transition, so the press paints first.
  const onDive = useStable(() => {
    if (dived) {
      setDived(false);
      startTransition(() => {
        setTanks(EMPTY);
        goTo(0);
      });
      write(LOG.surface);
    } else {
      setDived(true);
      setStream((count) => count + 1);
      const down = Math.max(depth, DIVE_DEPTH);
      startTransition(() => goTo(down));
      write(LOG.dive);
    }
  });
  const onLights = useStable((on: boolean) => {
    setLights(on);
    write(on ? (dived ? LOG.lightsOnDeep : LOG.lightsOn) : LOG.lightsOff);
  });
  const onSpeed = useStable((value: Speed) => {
    setSpeed(value);
    write(LOG.speed[value]);
  });
  const onBell = useStable(() => {
    const line = BELL_TOASTS[rings % BELL_TOASTS.length]!;
    setRings((count) => count + 1);
    write(LOG.bell);
    // The crew answers once the bell has swung: the toast stack measures and re-lays itself out, so
    // it waits for the press's own paint rather than holding it up.
    requestAnimationFrame(() =>
      setTimeout(() => {
        toast(`${line.name}: ${line.text}`);
        keepClearOfToasts(root.current?.querySelector("[data-stage-control='bell']"));
      }),
    );
  });

  // The picture follows the controls once the press has painted (useAfterPaint), so no press waits
  // on the porthole's repaint.
  const scene = useAfterPaint(useMemo(() => ({ depth, band, tanks: full, dived, lights, speed, dives: stream, rings }), [depth, band, full, dived, lights, speed, stream, rings]));

  return (
    <div ref={root} className="stage" data-stage="" data-offscreen={offscreen ? "" : undefined}>
      <div className="stage-frame">
        {/* On a phone the porthole and the crew's newest line stay under the header while the console scrolls beneath them (stage.css), so every press shows its effect without the page jumping. */}
        <div className="stage-window">
          <div className="stage-porthole">
            <Scene state={scene} label={STAGE_COPY.sceneLabel} description={describeScene(scene)} motto={STAGE_COPY.motto} />
          </div>
          <CrewLine entry={log.at(-1)!} logOpen={logOpen} />
        </div>
        <section aria-label={STAGE_COPY.rail} className="stage-console">
          {/* Row one: how deep, in what water, and how fast. Labels share a baseline, controls a centre line. */}
          <div className="stage-row stage-instruments">
            <DepthReadout depth={depth} />
            <span className="stage-heading stage-speed-head" aria-hidden="true">
              {STAGE_COPY.speed}
            </span>
            <DepthControl depth={depth} onChange={onDepth} onCommitted={onDepthCommitted} />
            <SpeedControl speed={speed} onChange={onSpeed} />
          </div>
          <Ballast tanks={tanks} full={full} dived={dived} onTank={onTank} onDive={onDive} />
          <div className="stage-row stage-deck">
            <LightsControl lights={lights} onChange={onLights} />
            <ShipLog log={log} rings={rings} onRing={onBell} logOpen={logOpen} />
          </div>
          <div className="stage-row stage-real" data-stage-control="xray">
            <span>{STAGE_COPY.real}</span>
            <span className="stage-real-links">
              <Button variant="plain" tone="primary" size="sm" className="h-auto min-h-0 px-1" onClick={onXray}>
                {STAGE_COPY.xray}
              </Button>
              <span aria-hidden="true">·</span>
              <Link href={STAGE_SOURCE} external tone="primary" className="px-1">
                {STAGE_COPY.source}
              </Link>
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * The crew's newest line, under the porthole: who said it and what, read out when it changes. At
 * rest it is the captain's welcome, which says what to do first. While the ship's log is open, the
 * log's own list reads each new line instead, so no line is read twice.
 */
const CrewLine = memo(function CrewLine({ entry, logOpen }: { entry: Entry; logOpen: Flag }): JSX.Element {
  const quiet = useSyncExternalStore(logOpen.subscribe, logOpen.get, logOpen.get);
  return (
    <p className="stage-crew" data-stage-crew="" aria-live={quiet ? "off" : "polite"} aria-atomic="true">
      <Avatar name={entry.name} alt="" size="sm" />
      <span className="stage-crew-words">
        <span className="stage-crew-name">{entry.name}:</span> {entry.text}
      </span>
    </p>
  );
});

/** Depth's label and its readout: the water's name and the fathoms, on the label's baseline. */
const DepthReadout = memo(function DepthReadout({ depth }: { depth: number }): JSX.Element {
  const bandLabel = BANDS.find((entry) => entry.band === bandAt(depth))!.label;
  return (
    <div className="stage-depth-head">
      <span className="stage-heading" aria-hidden="true">
        {STAGE_COPY.depth}
      </span>
      <output className="stage-readout" aria-live="off" data-stage-readout="">
        <span className="stage-band-name" data-stage-band="">
          {bandLabel}
        </span>
        <span className="stage-numeral">{depth}</span> <span className="stage-unit">fathoms</span>
      </output>
    </div>
  );
});

const DepthControl = memo(function DepthControl({ depth, onChange, onCommitted }: { depth: number; onChange: (value: number) => void; onCommitted: (value: number) => void }): JSX.Element {
  return (
    <div className="stage-depth" data-stage-control="depth">
      <Slider
        label={STAGE_COPY.depth}
        hideLabel
        min={0}
        max={MAX_DEPTH}
        step={5}
        value={depth}
        onValueChange={(value) => onChange(value as number)}
        onValueCommitted={(value) => onCommitted(value as number)}
      />
    </div>
  );
});

/**
 * A ballast tank's sight glass: the water inside rises when the tank floods, with a few bubbles,
 * and drains when it empties. Its shape and glow come from the preset (stage.css).
 */
function SightGlass({ full }: { full: boolean }): JSX.Element {
  const clip = useId();
  return (
    <svg className="stage-gauge" viewBox="0 0 44 44" aria-hidden="true" data-full={full ? "" : undefined}>
      <defs>
        <clipPath id={clip}>
          <rect className="stage-gauge-shape" x="5" y="5" width="34" height="34" rx="17" />
        </clipPath>
      </defs>
      <rect className="stage-gauge-face" x="5" y="5" width="34" height="34" rx="17" />
      <g clipPath={`url(#${clip})`}>
        <rect className="stage-gauge-water" x="5" y="5" width="34" height="34" />
        <path className="stage-gauge-surface" d="M5 12 Q13.5 9.5 22 12 T39 12" />
        <circle className="stage-gauge-bubble" cx="15" cy="34" r="1.7" />
        <circle className="stage-gauge-bubble" cx="24" cy="36" r="1.2" />
        <circle className="stage-gauge-bubble" cx="30" cy="33" r="1.5" />
      </g>
      <path className="stage-gauge-ticks" d="M9 15 H12.5 M9 22 H14 M9 29 H12.5" />
      <rect className="stage-gauge-bezel" x="3" y="3" width="38" height="38" rx="19" />
      <path className="stage-gauge-glint" d="M14 10.5 Q22 7.5 30 10.5" />
    </svg>
  );
}

const TankSwitch = memo(function TankSwitch({ id, label, name, checked, onChange }: { id: TankId; label: string; name: string; checked: boolean; onChange: (id: TankId, on: boolean) => void }): JSX.Element {
  return (
    <div className="stage-tank" data-stage-control={`tank-${id}`} data-full={checked ? "" : undefined}>
      <SightGlass full={checked} />
      <span className="stage-tank-row">
        <span className="stage-tank-name" aria-hidden="true">
          {label}
        </span>
        <Switch label={name} hideLabel checked={checked} onCheckedChange={(on) => onChange(id, on)} />
      </span>
    </div>
  );
});

/** Dive: quiet until the tanks are full, then the panel's one bright button. */
const DiveControl = memo(function DiveControl({ full, dived, onPress }: { full: number; dived: boolean; onPress: () => void }): JSX.Element {
  const ready = full === 3 && !dived;
  return (
    <div className="stage-dive" data-stage-control="dive" data-ready={ready ? "" : undefined}>
      <Button
        size="md"
        disabled={full < 3}
        tone={ready ? "primary" : "secondary"}
        variant={ready ? "solid" : "outline"}
        aria-describedby="stage-dive-hint stage-tank-count"
        className="min-w-28"
        onClick={onPress}
      >
        {dived ? STAGE_COPY.surface : STAGE_COPY.dive}
      </Button>
      {ready ? (
        <span id="stage-dive-hint" className="stage-ready" data-stage-ready="">
          <ChimeIcon className="size-4" />
          {STAGE_COPY.ready}
        </span>
      ) : (
        <span id="stage-dive-hint" className="stage-hint">
          {dived ? STAGE_COPY.surfaceHint : STAGE_COPY.diveHint(full)}
        </span>
      )}
    </div>
  );
});

/**
 * The ballast manifold, one instrument: three sight glasses on a pipe that runs to Dive. The pipe
 * fills with water a third at a time as the tanks flood, and the count says how many are full.
 */
const Ballast = memo(function Ballast({ tanks, full, dived, onTank, onDive }: { tanks: Record<TankId, boolean>; full: number; dived: boolean; onTank: (id: TankId, on: boolean) => void; onDive: () => void }): JSX.Element {
  return (
    <fieldset className="stage-row stage-group stage-ballast" style={{ "--fill": full / 3 } as CSSProperties}>
      <legend className="stage-heading stage-ballast-head">
        {STAGE_COPY.ballast}
        <span id="stage-tank-count" aria-hidden="true" className="stage-readout" data-stage-tank-count="">
          {STAGE_COPY.tankCount(full)}
        </span>
      </legend>
      <div className="stage-manifold">
        <span className="stage-pipe" aria-hidden="true">
          <span className="stage-pipe-water" />
        </span>
        {TANKS.map((tank) => (
          <TankSwitch key={tank.id} id={tank.id} label={tank.label} name={tank.name} checked={tanks[tank.id]} onChange={onTank} />
        ))}
        <DiveControl full={full} dived={dived} onPress={onDive} />
      </div>
    </fieldset>
  );
});

const SpeedControl = memo(function SpeedControl({ speed, onChange }: { speed: Speed; onChange: (value: Speed) => void }): JSX.Element {
  return (
    <div className="stage-speed" data-stage-control="speed">
      <SegmentedControl label={STAGE_COPY.speed} hideLabel items={SPEEDS} value={speed} onValueChange={(value) => onChange(value as Speed)} />
    </div>
  );
});

const LightsControl = memo(function LightsControl({ lights, onChange }: { lights: boolean; onChange: (on: boolean) => void }): JSX.Element {
  return (
    <div className="stage-lights" data-stage-control="lights">
      <span className="stage-heading" aria-hidden="true">
        {STAGE_COPY.lights}
      </span>
      <Switch label={STAGE_COPY.lights} hideLabel checked={lights} onCheckedChange={onChange} />
    </div>
  );
});

/** A yes or no that two parts of the stage share without re-rendering the rest: whether the log is open. */
function createFlag() {
  let value = false;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: boolean) {
      value = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
type Flag = ReturnType<typeof createFlag>;

const LogEntry = memo(function LogEntry({ entry }: { entry: Entry }): JSX.Element {
  return (
    <Message role="assistant" name={entry.name}>
      {entry.text}
    </Message>
  );
});

/**
 * The ship's log: every line the crew has said lately, folded under "Ship's log (n)" (the newest
 * also shows under the porthole). The bell rings from here.
 */
const ShipLog = memo(function ShipLog({ log, rings, onRing, logOpen }: { log: Entry[]; rings: number; onRing: () => void; logOpen: Flag }): JSX.Element {
  const [open, setOpen] = useState(false);
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    logOpen.set(next);
  };
  return (
    <>
      <div className="stage-log-fold" data-stage-control="log">
        <Collapsible title={STAGE_COPY.logAll(log.length)} open={open} onOpenChange={onOpenChange}>
          <MessageList label={STAGE_COPY.log} className="stage-log">
            {log.map((entry) => (
              <LogEntry key={entry.id} entry={entry} />
            ))}
          </MessageList>
        </Collapsible>
      </div>
      <div className="stage-bell" data-stage-control="bell" data-ring={rings === 0 ? undefined : rings % 2 ? "a" : "b"}>
        <Button variant="soft" tone="secondary" size="md" startIcon={BellIcon} onClick={onRing}>
          {STAGE_COPY.bell}
        </Button>
      </div>
    </>
  );
});
