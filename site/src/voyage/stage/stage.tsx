import { memo, startTransition, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type JSX, type SVGProps } from "react";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Collapsible } from "@/registry/ouro/components/ouro/collapsible/collapsible";
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

/** The ship's log keeps its newest three lines; the newest shows, the rest fold away. */
const KEEP = 3;

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
    toast(`${line.name}: ${line.text}`);
    write(LOG.bell);
  });

  // The picture follows the controls a frame later: a press repaints its own control first, then
  // the sea (a deferred render), so no press waits on the porthole's repaint.
  const scene = useDeferredValue(useMemo(() => ({ depth, band, tanks: full, dived, lights, speed, dives: stream, rings }), [depth, band, full, dived, lights, speed, stream, rings]));

  return (
    <div ref={root} className="stage" data-stage="" data-offscreen={offscreen ? "" : undefined}>
      <div className="stage-frame">
        {/* On a phone the porthole stays under the header while the console scrolls beneath it (stage.css), so every press shows its effect without the page jumping. */}
        <div className="stage-window">
          <div className="stage-porthole">
            <Scene state={scene} label={STAGE_COPY.sceneLabel} description={describeScene(scene)} motto={STAGE_COPY.motto} />
          </div>
        </div>
        <div className="stage-real" data-stage-control="xray">
          <span>{STAGE_COPY.real}</span>
          <span aria-hidden="true" className="stage-real-dash">
            —
          </span>
          <Button variant="plain" tone="primary" size="sm" className="h-auto min-h-0 px-1" onClick={onXray}>
            {STAGE_COPY.xray}
          </Button>
        </div>
        <section aria-label={STAGE_COPY.rail} className="stage-console">
          <DepthControl depth={depth} onChange={onDepth} onCommitted={onDepthCommitted} />
          <div className="stage-console-row">
            <fieldset className="stage-group stage-ballast">
              <legend className="stage-heading stage-ballast-head">
                {STAGE_COPY.ballast}
                <span id="stage-tank-count" aria-hidden="true" className="stage-readout" data-stage-tank-count="">
                  {STAGE_COPY.tankCount(full)}
                </span>
              </legend>
              <div className="stage-tanks">
                {TANKS.map((tank) => (
                  <TankSwitch key={tank.id} id={tank.id} label={tank.label} name={tank.name} checked={tanks[tank.id]} onChange={onTank} />
                ))}
              </div>
              <DiveControl full={full} dived={dived} onPress={onDive} />
            </fieldset>
            <div className="stage-group stage-helm">
              <SpeedControl speed={speed} onChange={onSpeed} />
              <LightsControl lights={lights} onChange={onLights} />
            </div>
          </div>
          <ShipLog log={log} rings={rings} onRing={onBell} />
        </section>
      </div>
    </div>
  );
}

const DepthControl = memo(function DepthControl({ depth, onChange, onCommitted }: { depth: number; onChange: (value: number) => void; onCommitted: (value: number) => void }): JSX.Element {
  const bandLabel = BANDS.find((entry) => entry.band === bandAt(depth))!.label;
  return (
    <div className="stage-group stage-depth" data-stage-control="depth">
      <div className="stage-depth-head">
        <span className="stage-heading" aria-hidden="true">
          {STAGE_COPY.depth}
        </span>
        <output className="stage-readout" aria-live="off" data-stage-readout="">
          <span className="stage-numeral">{depth}</span> <span className="stage-unit">fathoms</span>
          <span className="stage-band-name" data-stage-band="">
            {bandLabel}
          </span>
        </output>
      </div>
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

/** A ballast tank's dial: the needle swings from empty to full and settles. */
function Gauge({ full }: { full: boolean }): JSX.Element {
  return (
    <svg className="stage-gauge" viewBox="0 0 32 32" aria-hidden="true" data-full={full ? "" : undefined}>
      <circle className="stage-gauge-face" cx="16" cy="16" r="14" />
      <path className="stage-gauge-ticks" d="M5.4 20.3 L3.8 20.9 M5.0 13.0 L3.2 12.6 M9.1 6.9 L8.1 5.5 M16.0 4.6 L16.0 2.8 M22.9 6.9 L23.9 5.5 M27.0 13.0 L28.8 12.6 M26.6 20.3 L28.2 20.9" />
      <path className="stage-gauge-arc" d="M6.73 19.75 A10 10 0 1 1 25.27 19.75" />
      <g className="stage-gauge-needle">
        <path d="M16 16 L16 6.8" />
        <circle cx="16" cy="16" r="1.8" />
      </g>
    </svg>
  );
}

const TankSwitch = memo(function TankSwitch({ id, label, name, checked, onChange }: { id: TankId; label: string; name: string; checked: boolean; onChange: (id: TankId, on: boolean) => void }): JSX.Element {
  return (
    <div className="stage-tank" data-stage-control={`tank-${id}`} data-full={checked ? "" : undefined}>
      <Gauge full={checked} />
      <span className="stage-tank-name" aria-hidden="true">
        {label}
      </span>
      <Switch label={name} hideLabel checked={checked} onCheckedChange={(on) => onChange(id, on)} />
    </div>
  );
});

const DiveControl = memo(function DiveControl({ full, dived, onPress }: { full: number; dived: boolean; onPress: () => void }): JSX.Element {
  return (
    <div className="stage-dive" data-stage-control="dive">
      <Button
        size="md"
        disabled={full < 3}
        tone={dived ? "secondary" : "primary"}
        variant={dived ? "outline" : "solid"}
        aria-describedby="stage-dive-hint stage-tank-count"
        className="min-w-24"
        onClick={onPress}
      >
        {dived ? STAGE_COPY.surface : STAGE_COPY.dive}
      </Button>
      {full === 3 && !dived ? (
        <span className="stage-ready" data-stage-ready="">
          <Badge tone="success" variant="soft" icon={ChimeIcon}>
            {STAGE_COPY.ready}
          </Badge>
        </span>
      ) : null}
      <span id="stage-dive-hint" className={full === 3 && !dived ? "sr-only" : "stage-hint"}>
        {dived ? STAGE_COPY.surfaceHint : STAGE_COPY.diveHint(full)}
      </span>
    </div>
  );
});

const SpeedControl = memo(function SpeedControl({ speed, onChange }: { speed: Speed; onChange: (value: Speed) => void }): JSX.Element {
  return (
    <div className="stage-speed" data-stage-control="speed">
      <span className="stage-heading" aria-hidden="true">
        {STAGE_COPY.speed}
      </span>
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

const LogEntry = memo(function LogEntry({ entry }: { entry: Entry }): JSX.Element {
  return (
    <Message role="assistant" name={entry.name}>
      {entry.text}
    </Message>
  );
});

/**
 * The ship's log. On a wide screen the newest line is in view and the older ones fold under "Ship's
 * log (n more)"; on a phone every line folds under "Ship's log", so the console stays short under
 * the porthole (stage.css shows one or the other). The bell rings from here.
 */
const ShipLog = memo(function ShipLog({ log, rings, onRing }: { log: Entry[]; rings: number; onRing: () => void }): JSX.Element {
  const [open, setOpen] = useState(false);
  const [openAll, setOpenAll] = useState(false);
  const older = log.slice(0, -1);
  const newest = log.slice(-1);
  return (
    <div className="stage-logbook">
      <div className="stage-log-now">
        <MessageList label={`${STAGE_COPY.log}, newest line`} className="stage-log stage-log-newest">
          {newest.map((entry) => (
            <LogEntry key={entry.id} entry={entry} />
          ))}
        </MessageList>
      </div>
      <div className="stage-log-fold" data-stage-control="log">
        <div className="stage-fold-wide">
          <Collapsible title={STAGE_COPY.logFold(older.length)} open={open} onOpenChange={setOpen} disabled={older.length === 0}>
            <MessageList label={`${STAGE_COPY.log}, earlier lines`} className="stage-log">
              {older.map((entry) => (
                <LogEntry key={entry.id} entry={entry} />
              ))}
            </MessageList>
          </Collapsible>
        </div>
        <div className="stage-fold-narrow">
          <Collapsible title={STAGE_COPY.logAll(log.length)} open={openAll} onOpenChange={setOpenAll}>
            <MessageList label={STAGE_COPY.log} className="stage-log">
              {log.map((entry) => (
                <LogEntry key={entry.id} entry={entry} />
              ))}
            </MessageList>
          </Collapsible>
        </div>
      </div>
      <div className="stage-bell" data-stage-control="bell" data-ring={rings === 0 ? undefined : rings % 2 ? "a" : "b"}>
        <Button variant="soft" tone="secondary" size="sm" startIcon={BellIcon} onClick={onRing}>
          {STAGE_COPY.bell}
        </Button>
      </div>
    </div>
  );
});
