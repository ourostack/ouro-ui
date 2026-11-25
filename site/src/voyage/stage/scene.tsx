import { memo, useEffect, useLayoutEffect, useRef, type CSSProperties, type JSX, type ReactNode } from "react";
import { href } from "../../paths";
import { STORYBOOK } from "../../storybook";
import { MAX_DEPTH, type Band, type Speed } from "./copy";

/**
 * Fails to compile for a type with a value that is not a primitive. stepping.ts tells one state from
 * another by its values as a string, which would read two different objects as the same state.
 */
type Primitives<T extends { [K in keyof T]: string | number | boolean }> = T;

/** What the porthole shows: a pure function of the rail's controls, its values all primitives. */
export type SceneState = Primitives<{
  depth: number;
  band: Band;
  tanks: number;
  dived: boolean;
  lights: boolean;
  speed: Speed;
  /** Bumped by each Dive press and each dive of the depth lever, so a stream of bubbles rises again. */
  dives: number;
  /** Bumped by each ring of the bell, so ripples spread again. */
  rings: number;
  /**
   * When the stage itself computed this state, not when the picture committed it: useAfterPaint delays the
   * picture's own commit by a frame and a task, independently for each change, so two changes close together
   * can still land with a gap between them that has nothing to do with how far apart the presses were. stepping.ts
   * reads this instead of its own clock, so a run of quick presses is read as quick even when the picture is slow
   * to show them, and a real pause between presses (nothing changes this value meanwhile) still reads as one.
   */
  changedAt: number;
}>;

/** The small-step marker, once the first press of the depth lever has loaded it (stepping.ts). */
let markStep: typeof import("./stepping").markStep | undefined;

/**
 * The state the picture showed before `state`, tracked synchronously on every render whether or not stepping.ts has
 * loaded yet, so a press that lands while it is still loading is never dropped from the history markStep reads: without
 * this, a press whose effect ran before the load resolved got no call at all, so stepping.ts's own notion of "before"
 * could skip straight from undefined to whichever press happened to be the first one after the load, picking a small
 * step or not depending on host load rather than on the actual state before it.
 */
let previousState: SceneState | undefined;

/** A layer of the drawing in the glass's 480 units, over the water: an SVG of its own, so the compositor can move or fade it as a box. */
function Layer({ className, children }: { className?: string; children: ReactNode }): JSX.Element {
  return (
    <svg viewBox="0 0 480 480" overflow="visible" className={className ? `stage-plane ${className}` : "stage-plane"} aria-hidden="true">
      {children}
    </svg>
  );
}

/** A length in the glass's 480 units as a share of the glass, for the HTML layers over the water. */
const onGlass = (units: number) => `${((units * 100) / 480).toFixed(4)}%`;

/** The porthole's paintings (ourostack/.github brand/stage/, served byte for byte from the site's brand folder). */
const ART = (file: string) => href(`${STORYBOOK}stage/${file}`);
/** A sprite: its served file and its proportions, so its box is drawn before it arrives. */
interface Sprite {
  file: string;
  width: number;
  height: number;
}
const SPRITE = {
  sardine: { file: "sardine-72.webp", width: 72, height: 19 },
  lanternfish: { file: "lanternfish-56.webp", width: 56, height: 17 },
  jellyfish: { file: "jellyfish-64.webp", width: 64, height: 128 },
  ray: { file: "ray-256.webp", width: 256, height: 164 },
  anglerfish: { file: "anglerfish-160.webp", width: 160, height: 77 },
  octopus: { file: "octopus-112.webp", width: 112, height: 98 },
  nautilus: { file: "nautilus-660.webp", width: 660, height: 125 },
  nautilusLit: { file: "nautilus-lit-660.webp", width: 660, height: 125 },
} as const satisfies Record<string, Sprite>;

/** A painting or sprite as an image in the page: no name of its own (the scene has one), never dragged. */
function Picture({ of, style, className }: { of: Sprite; style?: CSSProperties; className?: string }): JSX.Element {
  return <img src={ART(of.file)} width={of.width} height={of.height} alt="" loading="lazy" decoding="async" draggable={false} className={className} style={style} />;
}

/**
 * A fish that drifts across the glass, from a rest place it keeps when nothing moves. Each is a box
 * the size of the glass holding its painting at its place: the drift, the dart from the light and
 * the start at the bell move the box, which the compositor does on its own.
 */
function Swimmer({ of, x, y, width, delay, className = "", scatter = 0, glow = false }: { of: Sprite; x: number; y: number; width: number; delay: number; className?: string; scatter?: number; glow?: boolean }): JSX.Element {
  const height = (width * of.height) / of.width;
  const place = { left: onGlass(x), top: onGlass(y), width: onGlass(width), height: onGlass(height) };
  return (
    <div className={`stage-drift ${className}`} style={{ "--drift-delay": `${delay}` } as CSSProperties}>
      {/* When the floodlights come on, the fish dart away from the beam (stage.css); they turn about their middle. */}
      <div className="stage-react" style={{ "--scatter": scatter, transformOrigin: `${onGlass(x + width / 2)} ${onGlass(y + height / 2)}` } as CSSProperties}>
        {/* Its own light, a soft halo under it that pulses in the deep (stage.css). */}
        {glow && <span className="stage-glow" style={place} />}
        <Picture of={of} className="stage-sprite" style={place} />
      </div>
    </div>
  );
}

const SARDINES: ReadonlyArray<[number, number, number]> = [
  [140, 250, 0.0], [192, 238, 0.1], [244, 252, 0.18], [168, 276, 0.26], [220, 284, 0.33], [272, 270, 0.41],
  [146, 306, 0.48], [200, 314, 0.55], [252, 304, 0.62], [304, 290, 0.7], [180, 340, 0.78], [234, 342, 0.86],
  [292, 326, 0.93],
];
const LANTERNFISH: ReadonlyArray<[number, number, number]> = [
  [96, 150, 0.05], [300, 128, 0.25], [210, 176, 0.45], [360, 214, 0.6], [130, 330, 0.75], [330, 352, 0.9],
];
/** A loose school of silver fish in the twilight water: [x, y, delay]. */
const TWILIGHT_SCHOOL: ReadonlyArray<[number, number, number]> = [
  [96, 196, 0.12], [132, 214, 0.2], [304, 176, 0.5], [340, 196, 0.58], [356, 222, 0.66],
];

/** Glowing specks of life in the midnight water: [x, y, delay]. */
const SPECKS: ReadonlyArray<[number, number, number]> = [
  [44, 160, 0], [92, 236, 0.4], [130, 120, 1.1], [176, 300, 0.7], [214, 200, 1.6], [252, 120, 0.2], [290, 270, 1.3],
  [334, 170, 0.9], [372, 300, 0.5], [418, 220, 1.8], [446, 130, 1.2], [70, 340, 1.5], [150, 400, 0.3], [236, 380, 1.0],
  [318, 350, 0.6], [400, 390, 1.4], [196, 110, 0.8], [270, 330, 1.9],
];

/** How much faster the fish swim at each speed than at half speed. Stop pauses them (stage.css). */
const PLAYBACK: Record<Speed, number> = { stop: 1, half: 1, full: 2.4 };

/**
 * The porthole: the sea painted in the frosted-glass world of the hero and the chapters, one painting for each band
 * of water and its night twin, cross-faded as she dives; the fish, the creatures the lantern finds and the Nautilus
 * herself are painted sprites that move over it (Swimmer, Ship), then the bubbles, the bell's ripples, the glass and
 * the brass rim. The controls set data attributes and --d (depth, 0 to 1) on the root; CSS does the rest. The layers
 * themselves never re-render, so a control costs a few attributes, not a new picture.
 */
export const Scene = memo(function Scene({ state, label, description, motto }: { state: SceneState; label: string; description: string; motto: string }): JSX.Element {
  const d = state.depth / MAX_DEPTH;
  const root = useRef<HTMLDivElement>(null);
  // A small step of the depth lever is drawn without fading (stepping.ts, loaded with the lever's first press).
  useLayoutEffect(() => {
    const before = previousState;
    previousState = state;
    if (markStep) markStep(root.current, before, state);
    else if (state.depth) void import("./stepping").then((module) => (markStep = module.markStep));
  }, [state]);
  // Speed changes the fish's playback rate, so they speed up from where they are instead of jumping.
  useEffect(() => {
    for (const animation of root.current?.getAnimations({ subtree: true }) ?? []) {
      if (animation instanceof CSSAnimation && animation.animationName === "stage-drift") animation.updatePlaybackRate(PLAYBACK[state.speed]);
    }
  }, [state.speed]);
  return (
    <div
      ref={root}
      role="img"
      aria-label={`${label}. ${description}`}
      className="stage-scene"
      data-ouro-allow="off-theme"
      data-ouro-allow-why="A painting: its sea, light, bubbles and brass are the frosted-glass world's own colours, as the hero's and the chapters' are, in every look."
      data-band={state.band}
      data-dived={state.dived ? "" : undefined}
      data-lights={state.lights ? "" : undefined}
      data-speed={state.speed}
      data-tanks={state.tanks}
      data-rings={state.rings}
      data-ring={state.rings === 0 ? undefined : state.rings % 2 ? "a" : "b"}
      style={{ "--d": d.toFixed(3), "--tanks": state.tanks } as CSSProperties}
    >
      {/*
        The layers keep the order of one picture: the sea under the paintings (its colour until they arrive), the
        paintings, the deep's specks, the fish, the creatures the lantern finds and the deepening water, the ship,
        the sea in front of her, the bubbles, the bell's ripples, then the glass and the rim. What moves or fades is
        a layer of its own: the compositor moves and fades those without the page, and a press waits on nothing it
        redraws (site/e2e/stage.latency.spec.ts).
      */}
      <svg viewBox="0 0 560 560" className="stage-art" aria-hidden="true">
        <Defs />
        <g transform="translate(40 40)">
          <g clipPath="url(#stage-glass)">
            <rect className="stage-water" width="480" height="480" fill="url(#stage-sea)" />
          </g>
        </g>
      </svg>
      <Sea />
      <Life />
      <svg viewBox="0 0 560 560" className="stage-art stage-art-over" aria-hidden="true">
        <g transform="translate(40 40)">
          <g clipPath="url(#stage-glass)">
            <Hidden />
            <rect className="stage-haze" width="480" height="480" fill="url(#stage-haze)" />
          </g>
        </g>
      </svg>
      <div className="stage-glass-layer" aria-hidden="true">
        <Ship />
        <Bubbles dives={state.dives} />
        <Ripples rings={state.rings} />
      </div>
      <svg viewBox="0 0 560 560" className="stage-art stage-art-over" aria-hidden="true">
        <g transform="translate(40 40)">
          <g clipPath="url(#stage-glass)">
            <Glass />
          </g>
        </g>
        <Rim motto={motto} />
      </svg>
    </div>
  );
});

const Defs = memo(function Defs(): JSX.Element {
  return (
    <defs>
      <clipPath id="stage-glass">
        <circle cx="240" cy="240" r="240" />
      </clipPath>
      <linearGradient id="stage-sea" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" className="stage-sea-top" />
        <stop offset="1" className="stage-sea-bottom" />
      </linearGradient>
      <linearGradient id="stage-beam" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" className="stage-beam-near" />
        <stop offset="1" className="stage-beam-far" />
      </linearGradient>
      <linearGradient id="stage-veil" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" className="stage-veil-top" />
        <stop offset="1" className="stage-veil-bottom" />
      </linearGradient>
      <radialGradient id="stage-glow">
        <stop offset="0" className="stage-glow-core" />
        <stop offset="1" className="stage-glow-edge" />
      </radialGradient>
      <linearGradient id="stage-haze" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" className="stage-haze-clear" />
        <stop offset="1" className="stage-haze-deep" />
      </linearGradient>
      <linearGradient id="stage-sheen" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" className="stage-sheen-bright" />
        <stop offset="0.6" className="stage-sheen-clear" />
      </linearGradient>
      <linearGradient id="stage-metal" x1="0.15" y1="0" x2="0.85" y2="1">
        <stop offset="0" className="stage-metal-light" />
        <stop offset="0.45" className="stage-metal-mid" />
        <stop offset="0.8" className="stage-metal-dark" />
        <stop offset="1" className="stage-metal-glint" />
      </linearGradient>
      <radialGradient id="stage-vignette" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0.72" className="stage-vignette-clear" />
        <stop offset="1" className="stage-vignette-edge" />
      </radialGradient>
    </defs>
  );
});

/** Which widths of a backdrop to fetch: the glass is about 30% of the porthole stage on a phone, at most 320 px on a wide screen. */
const BACKDROP_SIZES = "(max-width: 63.99rem) 22vh, 320px";

/** One painting of the sea, at the width the glass needs. */
function Painting({ file, className }: { file: string; className?: string | undefined }): JSX.Element {
  return (
    <img
      className={className}
      src={ART(`${file}-480.webp`)}
      srcSet={`${ART(`${file}-480.webp`)} 480w, ${ART(`${file}-720.webp`)} 720w`}
      sizes={BACKDROP_SIZES}
      width={480}
      height={480}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
    />
  );
}

/** A band's backdrop, by day, and its night twin when it has one (stage.css shows the one the page's theme wants). */
function Backdrop({ name, night, className, fades }: { name: string; night?: string; className: string; fades?: string }): JSX.Element {
  return (
    <div className={`stage-paint ${className}`} data-image-fade-ok={fades}>
      <Painting file={name} className={night ? "stage-day" : undefined} />
      {night && <Painting file={night} className="stage-night" />}
    </div>
  );
}

/**
 * The painted sea: open water under everything, the midnight deep over it once she is past 200 fathoms, and the
 * surface over both, the sky, the sun and the kelp on the sand, lifted out of view as the porthole goes down (stage.css).
 * The page's sky tints the painted one in the Live look (--live-sky), so it follows the reader's time of day.
 */
const Sea = memo(function Sea(): JSX.Element {
  return (
    <div className="stage-glass-layer" aria-hidden="true">
      <Backdrop name="bg-twilight" night="bg-twilight-dark" className="stage-paint-open" />
      <Backdrop name="bg-midnight" className="stage-paint-midnight" />
      <div className="stage-surface-world">
        <Backdrop name="bg-sunlit" night="bg-sunlit-dark" className="stage-paint-surface" fades="its foot fades into the open water painted under it, not into the page" />
        <div className="stage-sky-tint" />
      </div>
      <Specks />
    </div>
  );
});

/** Glowing specks of life in the midnight water, each twinkling on its own. */
const Specks = memo(function Specks(): JSX.Element {
  return (
    <div className="stage-specks">
      {SPECKS.map(([x, y, delay], index) => {
        const r = index % 4 === 0 ? 2 : 1.3;
        return <span key={index} className="stage-speck" style={{ left: onGlass(x - r), top: onGlass(y - r), width: onGlass(2 * r), height: onGlass(2 * r), "--twinkle-delay": `${delay}s` } as CSSProperties} />;
      })}
    </div>
  );
});

/** The fish of each band of water, over the sea and under the ship, on the glass's circle. */
const Life = memo(function Life(): JSX.Element {
  return (
    <div className="stage-life" aria-hidden="true">
      <div className="stage-band stage-band-sunlit">
        {SARDINES.map(([x, y, delay], index) => (
          <Swimmer key={index} of={SPRITE.sardine} x={x} y={y} width={40} delay={delay} className="stage-sardine" scatter={index % 2 ? 1 : -1} />
        ))}
      </div>
      <div className="stage-band stage-band-twilight">
        {TWILIGHT_SCHOOL.map(([x, y, delay], index) => (
          <Swimmer key={index} of={SPRITE.sardine} x={x} y={y} width={30} delay={delay} className="stage-sardine stage-sardine-far" scatter={index % 2 ? 1 : -1} />
        ))}
        <Swimmer of={SPRITE.ray} x={150} y={250} width={150} delay={0.2} className="stage-ray" />
        <Swimmer of={SPRITE.jellyfish} x={74} y={104} width={30} delay={0.55} className="stage-jelly" />
        <Swimmer of={SPRITE.jellyfish} x={370} y={140} width={24} delay={0.8} className="stage-jelly" />
      </div>
      <div className="stage-band stage-band-midnight">
        {LANTERNFISH.map(([x, y, delay], index) => (
          <Swimmer key={index} of={SPRITE.lanternfish} x={x} y={y} width={34} delay={delay} className="stage-lanternfish" scatter={index % 2 ? 1 : -1} glow />
        ))}
        <Swimmer of={SPRITE.jellyfish} x={52} y={96} width={30} delay={0.35} className="stage-jelly stage-jelly-deep" glow />
      </div>
    </div>
  );
});

/** A sprite placed in an SVG layer, in the glass's 480 units. */
function Placed({ of, x, y, width, className }: { of: Sprite; x: number; y: number; width: number; className?: string }): JSX.Element {
  return <image href={ART(of.file)} x={x} y={y} width={width} height={(width * of.height) / of.width} className={className} />;
}

/** Found only by the lantern: they live where the Nautilus dives. */
const Hidden = memo(function Hidden(): JSX.Element {
  return (
    <g className="stage-hidden" aria-hidden="true">
      <Placed of={SPRITE.anglerfish} x={352} y={146} width={100} className="stage-anglerfish" />
      <Placed of={SPRITE.octopus} x={350} y={318} width={70} className="stage-octopus" />
    </g>
  );
});

/** The ship's place in her layer, and her lantern's, in the glass's 480 units: 440 long, bow to the right. */
const HULL = { x: 0, y: 0, width: 440 };
const LANTERN = { x: 230, y: 9 };

/**
 * The Nautilus, riding where the controls put her (stage.css): the beam, her painting, the same ship with her
 * lights lit (they blink when the tanks are full) and the lantern's glow, each a layer the compositor sweeps, fades
 * or moves; then the sea in front of her at the surface.
 */
const Ship = memo(function Ship(): JSX.Element {
  return (
    <>
      <div className="stage-ship-ride">
        <Layer className="stage-beam">
          <path d={`M${LANTERN.x} ${LANTERN.y} L600 -118 L600 230 Z`} fill="url(#stage-beam)" />
        </Layer>
        <Layer>
          <Placed of={SPRITE.nautilus} {...HULL} className="stage-ship" />
        </Layer>
        <Layer className="stage-hull-lit">
          <Placed of={SPRITE.nautilusLit} {...HULL} />
        </Layer>
        <Layer className="stage-lantern-glow">
          <circle cx={LANTERN.x} cy={LANTERN.y} r="30" fill="url(#stage-glow)" />
        </Layer>
      </div>
      {/* The sea in front of the hull at the surface: the platform stands out of the water, the hull under it. */}
      <div className="stage-surface-world stage-surface-front">
        <Layer>
          <rect x="0" y="79" width="480" height="60" fill="url(#stage-veil)" />
          <path className="stage-waterline" d="M0 79 C20 75 40 83 60 79 C80 75 100 83 120 79 C140 75 160 83 180 79 C200 75 220 83 240 79 C260 75 280 83 300 79 C320 75 340 83 360 79 C380 75 400 83 420 79 C440 75 460 83 480 79" />
        </Layer>
      </div>
    </>
  );
});

/** A stream of bubbles from the hull, rising as the porthole goes down. */
const BUBBLES: ReadonlyArray<[number, number, number]> = [
  [96, 0, 3], [128, 0.12, 4.5], [160, 0.3, 2.5], [190, 0.05, 4], [218, 0.4, 3], [246, 0.2, 5], [274, 0.5, 2.5],
  [300, 0.1, 4], [326, 0.35, 3], [352, 0.6, 4.5], [140, 0.7, 2.5], [232, 0.8, 3.5], [318, 0.9, 2.5], [200, 1.0, 4],
];

/**
 * Each bubble is a box of its own with its circle in it, moved by the compositor as the SVG circle
 * was moved inside the drawing: about the glass's corner, so it starts small and up and to the left
 * of where it is drawn, and grows as it rises (stage.css).
 */
const Bubbles = memo(function Bubbles({ dives }: { dives: number }): JSX.Element {
  return (
    <div className="stage-bubbles" key={dives} data-streaming={dives > 0 ? "" : undefined}>
      {dives > 0 &&
        BUBBLES.map(([x, delay, r], index) => {
          const y = 330 - (index % 3) * 18;
          const box = r + 1;
          return (
            <svg
              key={index}
              viewBox={`${-box} ${-box} ${2 * box} ${2 * box}`}
              className="stage-bubble"
              style={{ left: onGlass(x - box), top: onGlass(y - box), width: onGlass(2 * box), height: onGlass(2 * box), "--x": x - box, "--y": y - box, "--bubble-delay": delay } as CSSProperties}
            >
              <circle r={r} />
            </svg>
          );
        })}
    </div>
  );
});

/**
 * Rings of sound spreading through the water from the hull when the bell rings; they ride with the
 * ship (stage.css). They are HTML over the water, not shapes in it: an SVG shape's animation is
 * redrawn by the page every frame, and the rings spread for two seconds, so the next press of the
 * bell waited on that. These rings only scale and fade, which the compositor does on its own.
 */
const Ripples = memo(function Ripples({ rings }: { rings: number }): JSX.Element {
  return (
    <div className="stage-ripples-ride" key={rings} data-rung={rings > 0 ? "" : undefined}>
      {rings > 0 && [0, 0.35, 0.7].map((delay, index) => <span key={index} className="stage-ripple" style={{ "--ripple-delay": `${delay}s` } as CSSProperties} />)}
    </div>
  );
});

const Glass = memo(function Glass(): JSX.Element {
  return (
    <>
      <rect className="stage-vignette" width="480" height="480" fill="url(#stage-vignette)" />
      {/* The glass: a broad sheen across the upper left, a bright arc, a glint, and the shadow of the rim on the water. */}
      <path className="stage-sheen" d="M24 214 C30 112 108 32 212 22 C150 52 98 110 80 196 C62 206 42 210 24 214 Z" fill="url(#stage-sheen)" />
      <path className="stage-glare" d="M70 120 C92 74 140 40 196 28" />
      <circle className="stage-glint" cx="214" cy="40" r="3.5" />
      <path className="stage-glare stage-glare-low" d="M396 392 C372 420 340 440 300 452" />
      {/* A pale reflection of the room behind you, high on the right of the glass. */}
      <path className="stage-reflection" d="M306 26 C366 42 414 80 444 132 L436 137 C406 88 360 52 302 36 Z" />
      {/* The glass sits deep in the rim: its shadow falls on the water all the way round. */}
      <circle className="stage-rim-shade" cx="240" cy="240" r="234" />
      <circle className="stage-rim-shade stage-rim-shade-near" cx="240" cy="240" r="238.5" />
    </>
  );
});

/** The rim: Nemo's motto engraved around the top, and the screws that hold the glass. */
const Rim = memo(function Rim({ motto }: { motto: string }): JSX.Element {
  return (
    <g className="stage-rim" aria-hidden="true">
      <path id="stage-motto-path" d="M 280 280 m -256 0 a 256 256 0 0 1 512 0" fill="none" />
      <circle className="stage-rim-ring" cx="280" cy="280" r="256" stroke="url(#stage-metal)" />
      <circle className="stage-rim-inner" cx="280" cy="280" r="240" />
      <circle className="stage-rim-recess" cx="280" cy="280" r="242" />
      <circle className="stage-rim-outer" cx="280" cy="280" r="272" />
      <circle className="stage-rim-rule" cx="280" cy="280" r="267" />
      <circle className="stage-rim-rule" cx="280" cy="280" r="245" />
      {/* The motto sits on a band of the page's color, so every letter reads against it, not the metal's highlights. */}
      <path className="stage-motto-band" d="M 280 280 m -256 0 a 256 256 0 0 1 512 0" pathLength={100} />
      <text className="stage-motto" dy="4.5">
        <textPath href="#stage-motto-path" startOffset="50%" textAnchor="middle">
          {motto.toUpperCase()}
        </textPath>
      </text>
      {/* Eight screws, 40 degrees apart, leaving the top of the ring clear for the motto. */}
      {Array.from({ length: 8 }, (_, index) => {
        const angle = ((310 + index * 40) * Math.PI) / 180;
        const x = 280 + Math.cos(angle) * 256;
        const y = 280 + Math.sin(angle) * 256;
        return (
          <g key={index} className="stage-bolt" transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${((angle * 180) / Math.PI + 40).toFixed(0)})`}>
            <circle r="5" />
            <path className="stage-bolt-slot" d="M-3.2 0 H3.2" />
          </g>
        );
      })}
    </g>
  );
});
