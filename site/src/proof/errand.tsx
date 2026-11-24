import { useCallback, useEffect, useRef, useState, type CSSProperties, type JSX } from "react";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Link } from "@/registry/ouro/components/ouro/link/link";
import { useMediaQuery } from "@/registry/ouro/lib/ouro/use-media-query";
import { ERRAND, ERRAND_MS, type ErrandLane } from "./errand-data";
import { ERRAND_COPY } from "./copy";

/** Seconds on a lane's clock, as a stopwatch shows them. */
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

function Lane({ lane, t }: { lane: ErrandLane; t: number }): JSX.Element {
  const done = t >= lane.ms;
  // The trolley rides the rail on the run's own clock: at the top as the person asks, at the till as the reply lands.
  const progress = Math.min(1, t / lane.ms);
  return (
    <li className="errand-lane" data-way={lane.key} data-outcome={done ? (lane.paid ? "paid" : "handed-back") : "running"} style={{ "--errand-progress": progress } as CSSProperties}>
      <div className="errand-lane-head">
        <h3 className="errand-lane-name">{lane.name}</h3>
        <span className="errand-clock" aria-hidden="true">
          {seconds(Math.min(t, lane.ms))}
        </span>
      </div>
      <div className="errand-track">
        <span className="errand-rail" aria-hidden="true">
          <span className="errand-trolley" data-ouro-part="trolley" />
        </span>
        <ol className="errand-steps">
          {lane.steps.map((step, index) => (
            <li key={index} className="errand-step" data-reached={t >= step.at || undefined}>
              <code className="errand-call">
                {step.tool}({step.args})
              </code>
              <p className="errand-said">{step.said}</p>
            </li>
          ))}
        </ol>
        <div className="errand-till" data-reached={done || undefined}>
          {lane.paid ? (
            <>
              <Badge tone="destructive" variant="soft">
                {ERRAND_COPY.paid}
              </Badge>
              <p className="errand-receipt" data-ouro-part="receipt">
                <span className="errand-receipt-head">{ERRAND_COPY.receipt}</span>
                <span>{lane.reply}</span>
              </p>
            </>
          ) : (
            <>
              <Badge tone="success" variant="soft">
                {ERRAND_COPY.handedBack}
              </Badge>
              <blockquote className="errand-reply">{lane.reply}</blockquote>
            </>
          )}
          <Link className="errand-source" href={lane.href}>
            {ERRAND_COPY.transcript}
          </Link>
        </div>
      </div>
    </li>
  );
}

/**
 * The Errand: the grocery job four ways in, replayed from real benchmark transcripts on each run's own clock. The server
 * paints every lane finished, so the page reads whole without JavaScript. Once it hydrates below the screen it rewinds,
 * and plays the first time it scrolls into view. With reduced motion nothing moves: no trolley, and each step and till
 * fades in where it stands.
 */
export function Errand({ ask }: { ask: string }): JSX.Element {
  const [t, setT] = useState(ERRAND_MS);
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState("");
  const host = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)", false);

  const play = useCallback(() => {
    cancelAnimationFrame(frame.current);
    setFinished("");
    setPlaying(true);
    setT(0);
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = Math.min(ERRAND_MS, now - start);
      setT(elapsed);
      if (elapsed < ERRAND_MS) {
        frame.current = requestAnimationFrame(tick);
        return;
      }
      setPlaying(false);
      setFinished(ERRAND_COPY.finished);
    };
    frame.current = requestAnimationFrame(tick);
  }, []);

  const stop = useCallback(() => {
    cancelAnimationFrame(frame.current);
    setPlaying(false);
    setT(ERRAND_MS);
  }, []);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  // Below the screen when it hydrates: rewind, then play once it is mostly in view. Already in view (a link to #errand),
  // or with reduced motion: stay finished, with the replay a press away.
  useEffect(() => {
    const element = host.current;
    if (!element || reduced || typeof IntersectionObserver === "undefined") return;
    if (element.getBoundingClientRect().top < innerHeight) return;
    setT(0);
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        play();
      },
      { threshold: 0.35 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [play, reduced]);

  return (
    <div ref={host} className="errand" data-ouro-part="errand" data-playing={playing || undefined}>
      <p className="errand-ask">
        <span className="errand-ask-who">{ERRAND_COPY.person}</span> <q>{ask}</q>
      </p>
      <ol className="errand-lanes">
        {ERRAND.map((lane) => (
          <Lane key={lane.key} lane={lane} t={t} />
        ))}
      </ol>
      <div className="errand-controls">
        {playing ? (
          <Button variant="outline" tone="secondary" onClick={stop}>
            {ERRAND_COPY.skip}
          </Button>
        ) : (
          <Button variant="outline" tone="secondary" onClick={play}>
            {ERRAND_COPY.replay}
          </Button>
        )}
        <p className="errand-note">{ERRAND_COPY.note}</p>
      </div>
      <p className="sr-only" role="status">
        {finished}
      </p>
    </div>
  );
}
