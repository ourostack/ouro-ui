import { useCallback, useEffect, useRef, useState, type CSSProperties, type JSX } from "react";
import { Kbd } from "@/registry/ouro/components/ouro/kbd/kbd";
import { Progress } from "@/registry/ouro/components/ouro/progress/progress";
import { toast } from "@/registry/ouro/lib/ouro/toast";
import { art, partsOf, type Art } from "../stage/art";
import { useSiteTheme } from "../theme-store";
import { DIVE_DEPTH, LEAVE, length, moment, MOTION, planDive, STILL } from "./plan";
// The scene's own styles come with its code, when Dive is first pressed, so the page's first load carries none of it.
import diveStyles from "./dive.css?inline";

const STYLES_ID = "site-dive-styles";

/** A creature passing the glass: [drawing, top %, width %, delay ms, swim ms, rest left % (with reduced motion), glow]. */
type Swimmer = [Art, number, number, number, number, number, string?];
const LANTERN_GLOW = partsOf(art.lanternfish, "c-glow");
const JELLY_GLOW = partsOf(art.jellyfish, "c-glow-body", "c-glow");
const SWIMMERS: readonly Swimmer[] = [
  [art.lanternfish, 30, 9, 1300, 3600, 18, LANTERN_GLOW],
  [art.lanternfish, 38, 7, 1700, 4000, 30, LANTERN_GLOW],
  [art.lanternfish, 62, 8, 2300, 3300, 58, LANTERN_GLOW],
  [art.lanternfish, 70, 6, 2600, 3800, 72, LANTERN_GLOW],
  [art.jellyfish, 40, 6, 1500, 4200, 60, JELLY_GLOW],
  [art.jellyfish, 18, 5, 2100, 3600, 44, JELLY_GLOW],
];
/** Bubbles rising from below: [left %, size px, delay ms]. */
const BUBBLES: ReadonlyArray<[number, number, number]> = [
  [8, 10, 0],
  [16, 6, 300],
  [24, 14, 900],
  [33, 8, 150],
  [41, 5, 1200],
  [49, 12, 600],
  [57, 7, 1500],
  [64, 9, 450],
  [72, 13, 1050],
  [80, 6, 250],
  [88, 10, 1350],
  [94, 7, 750],
  [12, 5, 1800],
  [68, 5, 2000],
];
/** Drops thrown up by an open hatch: [left %, size px, how far up %, delay ms]. */
const DROPS: ReadonlyArray<[number, number, number, number]> = [
  [38, 10, 46, 0],
  [44, 7, 62, 40],
  [50, 12, 70, 0],
  [56, 8, 58, 60],
  [62, 10, 44, 20],
  [47, 6, 80, 90],
  [53, 6, 84, 30],
];

/** One creature, at its own height, swimming across, or resting where it is with reduced motion. */
function Creature({ of, top, width, delay, swim, rest, glow }: { of: Art; top: number; width: number; delay: number; swim: number; rest: number; glow: string | undefined }): JSX.Element {
  const style = {
    "--top": `${top}%`,
    "--width": `${width}%`,
    "--delay": `${delay}ms`,
    "--swim": `${swim}ms`,
    "--rest": `${rest}%`,
  } as CSSProperties;
  // A lanternfish swims across the window, head first; a jellyfish drifts up where it is.
  return (
    <span className={of === art.jellyfish ? "dive-creature dive-jelly" : "dive-creature dive-fish"} style={style}>
      <svg viewBox={of.viewBox} overflow="visible" dangerouslySetInnerHTML={{ __html: of.inner }} />
      {glow && <svg viewBox={of.viewBox} overflow="visible" className="dive-glow" dangerouslySetInnerHTML={{ __html: glow }} />}
    </span>
  );
}

/**
 * The theme sample goes under: the sea rises over the window, she goes down through blue into the
 * deep while the depth gauge counts to 300 fathoms, bubbles rise, the lantern sweeps and the
 * glowing fish Captain Nemo promised drift past; then she comes back up, and the crew says how it
 * went in a toast. The scene is painted in the chosen preset's own dark colours (`.dark` and its
 * `data-theme`), so every preset dives in its own sea. It is a picture (aria-hidden): screen
 * readers hear the toast. Escape, or a press anywhere, ends it early. With reduced motion nothing
 * moves: the still deep fades in, holds, and fades out.
 */
export default function DiveScene({ checked, ending, onSkip, onDone }: { checked: ReadonlySet<string>; ending: boolean; onSkip: () => void; onDone: () => void }): JSX.Element {
  const { preset } = useSiteTheme();
  // The checklist as it stood when Dive was pressed.
  const [plan] = useState(() => planDive(checked));
  const [reduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [fathoms, setFathoms] = useState(reduced ? DIVE_DEPTH : 0);
  const done = useRef(false);

  useEffect(() => {
    if (document.getElementById(STYLES_ID)) return;
    const style = document.createElement("style");
    style.id = STYLES_ID;
    style.textContent = diveStyles;
    document.head.append(style);
  }, []);

  // Back on the surface: the crew's line, once, then the scene goes.
  const finish = useCallback(() => {
    if (done.current) return;
    done.current = true;
    toast(plan.line.title, { description: plan.line.description });
    onDone();
  }, [plan, onDone]);

  // The dive's own clock: the gauge follows it frame by frame, and it ends on time.
  useEffect(() => {
    if (ending) return;
    const start = performance.now();
    let frame = 0;
    const timer = setTimeout(finish, length(reduced));
    if (!reduced) {
      const tick = () => {
        setFathoms(moment(performance.now() - start).fathoms);
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [ending, reduced, finish]);

  // Ended early: the window clears quickly, and the crew still says how it went.
  useEffect(() => {
    if (!ending) return;
    const timer = setTimeout(finish, LEAVE);
    return () => clearTimeout(timer);
  }, [ending, finish]);

  // Escape, or a press anywhere, brings her up. A press outside the window keeps doing what it does.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onSkip();
    };
    addEventListener("keydown", onKey);
    addEventListener("pointerdown", onSkip, { capture: true });
    return () => {
      removeEventListener("keydown", onKey);
      removeEventListener("pointerdown", onSkip, { capture: true });
    };
  }, [onSkip]);

  const timing = {
    "--flood": `${MOTION.flood}ms`,
    "--descend": `${MOTION.descend}ms`,
    "--deep": `${MOTION.deep}ms`,
    "--surface": `${MOTION.surface}ms`,
    "--drain-at": `${MOTION.flood + MOTION.descend + MOTION.deep}ms`,
    "--fade-in": `${STILL.fadeIn}ms`,
    "--fade-out": `${STILL.fadeOut}ms`,
    "--fade-out-at": `${STILL.fadeIn + STILL.hold}ms`,
    "--leave": `${LEAVE}ms`,
  } as CSSProperties;

  return (
    <div
      className="dive dark"
      data-theme={preset}
      data-site-dive=""
      data-leaving={ending ? "" : undefined}
      data-splash={plan.splash ? "" : undefined}
      data-flicker={plan.flicker ? "" : undefined}
      aria-hidden="true"
      style={timing}
    >
      <div className="dive-water">
        <div className="dive-dark" />
        <div className="dive-beam" />
        {SWIMMERS.map(([of, top, width, delay, swim, rest, glow], index) => (
          <Creature key={index} of={of} top={top} width={width} delay={delay} swim={swim} rest={rest} glow={glow} />
        ))}
        <span className="dive-creature dive-angler">
          <svg viewBox={art.anglerfish.viewBox} overflow="visible" dangerouslySetInnerHTML={{ __html: art.anglerfish.inner }} />
        </span>
        {BUBBLES.map(([left, size, delay], index) => (
          <span
            key={index}
            className="dive-bubble"
            style={
              {
                "--left": `${left}%`,
                "--size": `${size}px`,
                "--delay": `${delay}ms`,
                "--rest": `${12 + ((index * 37) % 70)}%`,
              } as CSSProperties
            }
          />
        ))}
      </div>
      {plan.splash && (
        <div className="dive-splash">
          {DROPS.map(([left, size, up, delay], index) => (
            <span
              key={index}
              className="dive-drop"
              style={
                {
                  "--left": `${left}%`,
                  "--size": `${size}px`,
                  "--up": up,
                  "--delay": `${delay}ms`,
                } as CSSProperties
              }
            />
          ))}
          <span className="dive-splash-word">Splash!</span>
        </div>
      )}
      <div className="dive-gauge">
        <p className="dive-reading">
          <span className="dive-number">{fathoms}</span> fathoms down
        </p>
        <Progress label="Depth" hideLabel value={fathoms} max={DIVE_DEPTH} />
      </div>
      {plan.sleeper && (
        <p className="dive-sleeper">
          <span className="dive-z">z</span>
          <span className="dive-z">z</span>
          <span className="dive-z">z</span>
          <span className="dive-sleeper-name">Ned, the harpooner, asleep</span>
        </p>
      )}
      <p className="dive-hint">
        <Kbd keys={["escape"]} /> or click to come up
      </p>
    </div>
  );
}
