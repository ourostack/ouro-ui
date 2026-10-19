import { memo, startTransition, useCallback, useEffect, useLayoutEffect, useRef, useState, type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";
import { SegmentedControl } from "@/registry/ouro/components/ouro/segmented-control/segmented-control";
import { Slider } from "@/registry/ouro/components/ouro/slider/slider";
import { Switch } from "@/registry/ouro/components/ouro/switch/switch";
import { toast } from "@/registry/ouro/lib/ouro/toast";
import { bandAt, BANDS, BELL_TOASTS, describeScene, LOG, MAX_DEPTH, OPENING_LOG, SPEEDS, STAGE_COPY, TANKS, type LogLine, type Speed } from "./copy";
import { Scene } from "./scene";
import "./stage.css";

interface Entry extends LogLine {
  id: number;
}

/** Where a dive takes the porthole: the top of the midnight water, where the lantern finds things. */
const DIVE_DEPTH = 200;

/** The ship's log keeps its newest three lines. */
const KEEP = 3;

function BellIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 13.5V9a5 5 0 0 1 10 0v4.5l1.5 1.5h-13Z" />
      <path d="M8.5 17a1.5 1.5 0 0 0 3 0" />
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

type TankId = (typeof TANKS)[number]["id"];
const EMPTY: Record<TankId, boolean> = { fore: false, middle: false, aft: false };

/**
 * The hero's stage: a porthole onto the sea and the Nautilus's instrument rail under it, every
 * control an Ouro HX component. The site owns the state (depth, tanks, dive, lights, speed, the
 * log); HX owns how each control behaves, reads out and moves. Each control is its own memoized
 * piece with steady handlers, so pressing one re-renders that control, the log and the picture's
 * attributes, nothing else.
 */
export function Stage(): JSX.Element {
  const [depth, setDepth] = useState(0);
  const [tanks, setTanks] = useState<Record<TankId, boolean>>(EMPTY);
  const [dived, setDived] = useState(false);
  const [dives, setDives] = useState(0);
  const [lights, setLights] = useState(false);
  const [speed, setSpeed] = useState<Speed>("half");
  const [log, setLog] = useState<Entry[]>(() => OPENING_LOG.map((line, index) => ({ ...line, id: index })));
  const nextId = useRef(OPENING_LOG.length);
  const bells = useRef(0);
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

  // Fish drift only while the stage is on screen.
  useEffect(() => {
    const element = root.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setOffscreen(!entry!.isIntersecting));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const onDepth = useStable((value: number) => setDepth(value));
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
    if (!on && dived) {
      setDived(false);
      goTo(0);
      write(LOG.surface);
    } else write(on ? (count === 3 ? LOG.allFull : LOG.tankFull(tank.noun)) : LOG.tankEmpty(tank.noun));
  });
  const onDive = useStable(() => {
    if (dived) {
      setDived(false);
      setTanks(EMPTY);
      goTo(0);
      write(LOG.surface);
    } else {
      setDived(true);
      setDives((count) => count + 1);
      goTo(Math.max(depth, DIVE_DEPTH));
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
    const line = BELL_TOASTS[bells.current++ % BELL_TOASTS.length]!;
    toast(`${line.name}: ${line.text}`);
    write(LOG.bell);
  });

  const scene = { depth, band, tanks: full, dived, lights, speed, dives };

  return (
    <div ref={root} className="stage grid" data-stage="" data-offscreen={offscreen ? "" : undefined}>
      <div className="stage-porthole relative z-10 mx-auto w-full max-w-[520px]">
        <Scene state={scene} label={STAGE_COPY.sceneLabel} description={describeScene(scene)} />
      </div>
      <section aria-label={STAGE_COPY.rail} className="stage-rail mt-3 grid gap-5 rounded-2xl border border-border/70 bg-card p-4 shadow-(--shadow-sm) sm:px-5 lg:grid-cols-[minmax(0,1fr)_15.5rem]">
        <div className="grid min-w-0 content-start gap-4">
          <DepthControl depth={depth} onChange={onDepth} onCommitted={onDepthCommitted} />
          <fieldset className="m-0 grid min-w-0 gap-2.5 border-0 p-0">
            <legend className="mb-2 p-0 text-sm font-medium text-foreground">{STAGE_COPY.ballast}</legend>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              {TANKS.map((tank) => (
                <TankSwitch key={tank.id} id={tank.id} label={tank.label} checked={tanks[tank.id]} onChange={onTank} />
              ))}
            </div>
            <DiveControl full={full} dived={dived} onPress={onDive} />
          </fieldset>
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
            <SpeedControl speed={speed} onChange={onSpeed} />
            <LightsControl lights={lights} onChange={onLights} />
          </div>
        </div>
        <div className="stage-logbook grid min-w-0 content-start gap-3 lg:border-s lg:border-border/70 lg:ps-5">
          <div className="flex items-center justify-between gap-3">
            <p className="m-0 text-sm font-medium text-foreground" aria-hidden="true">
              {STAGE_COPY.log}
            </p>
            <BellButton onRing={onBell} />
          </div>
          <ShipLog log={log} />
        </div>
      </section>
    </div>
  );
}

const DepthControl = memo(function DepthControl({ depth, onChange, onCommitted }: { depth: number; onChange: (value: number) => void; onCommitted: (value: number) => void }): JSX.Element {
  const bandLabel = BANDS.find((entry) => entry.band === bandAt(depth))!.label;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-4" data-stage-control="depth">
      <Slider
        label={STAGE_COPY.depth}
        min={0}
        max={MAX_DEPTH}
        step={5}
        value={depth}
        onValueChange={(value) => onChange(value as number)}
        onValueCommitted={(value) => onCommitted(value as number)}
      />
      <output className="grid pb-1 text-right whitespace-nowrap" aria-live="off" data-stage-readout="">
        <span className="site-mono tabular-nums">
          <span className="text-xl font-semibold text-foreground">{depth}</span> <span className="text-sm text-muted-foreground">fathoms</span>
        </span>
        <span className="text-xs text-muted-foreground" data-stage-band="">
          {bandLabel}
        </span>
      </output>
    </div>
  );
});

const TankSwitch = memo(function TankSwitch({ id, label, checked, onChange }: { id: TankId; label: string; checked: boolean; onChange: (id: TankId, on: boolean) => void }): JSX.Element {
  return (
    <div data-stage-control={`tank-${id}`}>
      <Switch label={label} checked={checked} onCheckedChange={(on) => onChange(id, on)} />
    </div>
  );
});

const DiveControl = memo(function DiveControl({ full, dived, onPress }: { full: number; dived: boolean; onPress: () => void }): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-3" data-stage-control="dive">
      <Button
        size="sm"
        disabled={full < 3}
        tone={dived ? "secondary" : "primary"}
        variant={dived ? "outline" : "solid"}
        aria-describedby="stage-dive-hint"
        className="min-w-20"
        onClick={onPress}
      >
        {dived ? STAGE_COPY.surface : STAGE_COPY.dive}
      </Button>
      <span id="stage-dive-hint" className="text-sm text-muted-foreground">
        {STAGE_COPY.diveHint(full)}
      </span>
    </div>
  );
});

const SpeedControl = memo(function SpeedControl({ speed, onChange }: { speed: Speed; onChange: (value: Speed) => void }): JSX.Element {
  return (
    <div data-stage-control="speed">
      <SegmentedControl label={STAGE_COPY.speed} items={SPEEDS} value={speed} onValueChange={(value) => onChange(value as Speed)} />
    </div>
  );
});

const LightsControl = memo(function LightsControl({ lights, onChange }: { lights: boolean; onChange: (on: boolean) => void }): JSX.Element {
  return (
    <div className="pb-1.5" data-stage-control="lights">
      <Switch label={STAGE_COPY.lights} checked={lights} onCheckedChange={onChange} />
    </div>
  );
});

const BellButton = memo(function BellButton({ onRing }: { onRing: () => void }): JSX.Element {
  return (
    <div data-stage-control="bell">
      <Button variant="soft" tone="secondary" size="sm" startIcon={BellIcon} onClick={onRing}>
        {STAGE_COPY.bell}
      </Button>
    </div>
  );
});

const LogEntry = memo(function LogEntry({ entry }: { entry: Entry }): JSX.Element {
  return (
    <Message role="assistant" name={entry.name}>
      {entry.text}
    </Message>
  );
});

const ShipLog = memo(function ShipLog({ log }: { log: Entry[] }): JSX.Element {
  return (
    <MessageList label={STAGE_COPY.log} className="stage-log h-[10.5rem]">
      {log.map((entry) => (
        <LogEntry key={entry.id} entry={entry} />
      ))}
    </MessageList>
  );
});
