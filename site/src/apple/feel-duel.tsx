import { useRef, useState, type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Switch } from "@/registry/ouro/components/ouro/switch/switch";

/*
 * Ouro Feel's tap-landing genre, to touch: two switches, one with the tap lock Ouro Feel's fixture plants as its
 * bug (0.25 s, Examples/OuroFeelFixture in ouro-ui-apple), one that takes every tap. Double-tap each: a pair that
 * ends where it started had both taps land; one that ends changed lost a tap. That is how Feel reads a rapid pair,
 * and its bar is absolute: every pair must end where it started.
 */

/** The fixture's tap lock, in milliseconds. */
export const TAP_LOCK = 250;
/** Two taps this close together are a rapid pair. */
export const PAIR_GAP = 450;

export interface Tally {
  on: boolean;
  sent: number;
  landed: number;
  pairs: number;
  /** Pairs that ended where they started. */
  kept: number;
  /** When the last tap came, when the last landed one did, and whether the last tap opened a pair still waiting for its second. */
  last: number;
  lastLanded: number;
  open: { at: number; was: boolean } | null;
}

export const FRESH: Tally = { on: false, sent: 0, landed: 0, pairs: 0, kept: 0, last: -Infinity, lastLanded: -Infinity, open: null };

/** One tap at `at` ms, on a switch with or without the lock. */
export function tap(tally: Tally, at: number, locked: boolean): Tally {
  const lands = !locked || at - tally.lastLanded >= TAP_LOCK;
  const on = lands ? !tally.on : tally.on;
  const next: Tally = { ...tally, on, sent: tally.sent + 1, landed: tally.landed + (lands ? 1 : 0), last: at, lastLanded: lands ? at : tally.lastLanded };
  if (tally.open && at - tally.open.at <= PAIR_GAP) {
    // The second tap of a pair: score it by where the switch ended, as Feel does.
    return { ...next, pairs: tally.pairs + 1, kept: tally.kept + (on === tally.open.was ? 1 : 0), open: null };
  }
  return { ...next, open: { at, was: tally.on } };
}

/** What Feel would print for this switch, in its own report's shape. */
export function report(tally: Tally): string {
  if (tally.pairs === 0) return tally.sent === 0 ? "Waiting for a double tap." : "One tap landed. Now try two, quickly.";
  const verdict = tally.kept === tally.pairs ? "PASS" : "FAIL";
  return `${verdict} tap landing: ${tally.kept} of ${tally.pairs} rapid ${tally.pairs === 1 ? "pair" : "pairs"} ended where ${tally.pairs === 1 ? "it" : "they"} started`;
}

function Contender({ id, label, note, tally, onTap, quiet }: { id: string; label: string; note: string; tally: Tally; onTap: () => void; quiet: boolean }): JSX.Element {
  const verdict = tally.pairs === 0 ? "waiting" : tally.kept === tally.pairs ? "pass" : "fail";
  return (
    <div className="feel-contender" data-feel-contender={id} data-verdict={verdict}>
      <Switch label={label} description={note} checked={tally.on} onCheckedChange={onTap} />
      {/* While Feel taps for you, the report speaks once at the end, not after every tap. */}
      <p className="feel-report site-mono" aria-live={quiet ? "off" : "polite"} data-feel-report>
        {report(tally)}
      </p>
      <p className="feel-tally">
        <span>
          <strong>{tally.sent}</strong> sent
        </span>
        <span>
          <strong>{tally.landed}</strong> landed
        </span>
      </p>
    </div>
  );
}

/** The duel: the same switch twice, once with a tap lock. */
export function TapLockDuel(): JSX.Element {
  const [locked, setLocked] = useState(FRESH);
  const [ready, setReady] = useState(FRESH);
  const [robot, setRobot] = useState(false);
  const timers = useRef<number[]>([]);

  /** Feel's own move: five rapid pairs on each switch, 90 ms apart within a pair, settled between pairs. */
  const letFeelTry = () => {
    for (const timer of timers.current) clearTimeout(timer);
    setLocked(FRESH);
    setReady(FRESH);
    setRobot(true);
    const start = performance.now();
    timers.current = [];
    for (let pair = 0; pair < 5; pair++) {
      for (const offset of [0, 90]) {
        const delay = pair * 700 + offset;
        timers.current.push(
          window.setTimeout(() => {
            const at = start + delay;
            setLocked((was) => tap(was, at, true));
            setReady((was) => tap(was, at, false));
            if (pair === 4 && offset === 90) setRobot(false);
          }, delay),
        );
      }
    }
  };

  return (
    <div className="feel-duel" data-feel-duel>
      <p className="apple-twin-label">
        <span className="apple-twin-badge">Web twin</span> Double-tap both switches, fast. Space twice works too.
      </p>
      <div className="feel-duel-pair">
        <Contender id="locked" label="With a tap lock" note="Ignores taps for a beat after one lands" quiet={robot} tally={locked} onTap={() => setLocked((was) => tap(was, performance.now(), true))} />
        <Contender id="ready" label="Without a lock" note="Your second tap counts too" quiet={robot} tally={ready} onTap={() => setReady((was) => tap(was, performance.now(), false))} />
      </div>
      <div className="feel-duel-actions">
        <Button size="sm" variant="outline" tone="secondary" onClick={letFeelTry} disabled={robot}>
          {robot ? "Feel is tapping…" : "Let Feel double-tap both"}
        </Button>
        <Button
          size="sm"
          variant="plain"
          tone="secondary"
          onClick={() => {
            for (const timer of timers.current) clearTimeout(timer);
            setRobot(false);
            setLocked(FRESH);
            setReady(FRESH);
          }}
        >
          Start over
        </Button>
      </div>
    </div>
  );
}
