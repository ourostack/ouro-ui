import { useEffect, useRef, useState, type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { useReducedMotion } from "@/registry/ouro/lib/ouro/use-reduced-motion";
import timing from "./evidence/reins-headless-timing.json";
import { JOURNEY, run, START } from "./reins-kitchen";

/*
 * The race: Spoonjoy's Kitchen-to-cook-mode journey, headless through Reins against XCUITest on a simulator, at real
 * speed, with the real medians (evidence/reins-headless-timing.json). The simulator's lane takes its whole 16.7 s; the
 * reader can skip to the finish. Under reduced motion the bars don't glide: the clock and the count still tick, and
 * the bars step with them.
 */

export const HEADLESS_MS = timing.medianMs;
export const SIMULATOR_MS = timing.xcuitest.medianJourneyMs;

/** How many headless journeys fit in `ms`. */
export const journeysIn = (ms: number) => Math.floor(ms / HEADLESS_MS);

/** The browser's own run of the same journey through the pretend kitchen, in ms. */
function browserRun(): number {
  const start = performance.now();
  let state = START;
  for (const line of JOURNEY) state = run(state, line).state;
  return performance.now() - start;
}

type Phase = "ready" | "racing" | "done";

const seconds = (ms: number) => (ms / 1000).toFixed(1);

export function ReinsRace(): JSX.Element {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("ready");
  const [elapsed, setElapsed] = useState(0);
  const [browser, setBrowser] = useState<number | null>(null);
  const started = useRef(0);
  const frame = useRef(0);

  useEffect(() => {
    if (phase !== "racing") return;
    let last = 0;
    const tick = (now: number) => {
      const ms = Math.min(now - started.current, SIMULATOR_MS);
      // Ten updates a second is plenty for a clock, and kind to a phone's battery.
      if (ms - last >= 100 || ms === SIMULATOR_MS) {
        last = ms;
        setElapsed(ms);
      }
      if (ms >= SIMULATOR_MS) setPhase("done");
      else frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [phase]);

  const start = () => {
    setBrowser(browserRun());
    setElapsed(0);
    started.current = performance.now();
    setPhase("racing");
  };
  const finish = () => {
    cancelAnimationFrame(frame.current);
    setElapsed(SIMULATOR_MS);
    setPhase("done");
  };

  const simulatorShare = elapsed / SIMULATOR_MS;
  const reinsDone = phase !== "ready";
  const laps = journeysIn(elapsed);

  const verdicts: Record<Phase, string> = {
    ready: "Ready when you are.",
    racing: "Reins is home already. The simulator is still finding the Kitchen tab by its label.",
    done: `The simulator crossed the line at ${seconds(SIMULATOR_MS)} s. In that time Reins could have run the whole journey ${journeysIn(SIMULATOR_MS).toLocaleString("en")} times.`,
  };

  // Every line keeps the height of its longest version from the start, so nothing around the race moves while it runs.
  return (
    <div className="reins-race" data-reins-race={phase} data-reduced={reduced ? "" : undefined} data-browser-ms={browser === null ? undefined : browser.toFixed(2)}>
      <ol className="reins-lanes">
        <li className="reins-lane" data-home={reinsDone ? "" : undefined}>
          <p className="reins-lane-name">Reins, headless</p>
          <div className="reins-track" aria-hidden="true">
            <span className="reins-fill reins-fill-reins" style={{ transform: `scaleX(${reinsDone ? 1 : 0})` }} />
          </div>
          <p className="reins-lane-time site-mono">
            {reinsDone ? `${HEADLESS_MS} ms` : "on the line"}
            <span className="reins-lane-note" data-hidden={reinsDone ? undefined : ""}>
              {" "}
              and again, {laps.toLocaleString("en")} {laps === 1 ? "time" : "times"} so far
            </span>
          </p>
        </li>
        <li className="reins-lane">
          <p className="reins-lane-name">XCUITest, on an iPhone simulator</p>
          <div className="reins-track" aria-hidden="true">
            <span className="reins-fill reins-fill-sim" style={{ transform: `scaleX(${simulatorShare})` }} />
          </div>
          <p className="reins-lane-time site-mono">{phase === "ready" ? "on the line" : phase === "done" ? `${seconds(SIMULATOR_MS)} s` : `${seconds(elapsed)} s, still tapping`}</p>
        </li>
      </ol>
      <div className="apple-actions">
        {phase === "racing" ? (
          <Button onClick={finish}>Skip to the finish line</Button>
        ) : (
          <Button onClick={start}>{phase === "done" ? "Race again" : "Start the race"}</Button>
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {phase === "ready" ? "" : verdicts[phase]}
      </p>
      <div className="reins-verdicts" aria-hidden="true">
        {(Object.keys(verdicts) as Phase[]).map((which) => (
          <p key={which} className="reins-verdict" data-shown={which === phase ? "" : undefined}>
            {verdicts[which]}
          </p>
        ))}
      </div>
    </div>
  );
}
