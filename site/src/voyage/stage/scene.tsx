import { memo, useEffect, useRef, type CSSProperties, type JSX, type ReactNode } from "react";
import { art, partsOf, type Art } from "./art";
import { MAX_DEPTH, type Band, type Speed } from "./copy";

/** What the porthole shows: a pure function of the rail's controls. */
export interface SceneState {
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
}

/** A drawing from site/src/nautilus/art at a place and width in the scene, its height from its own proportions. */
function Drawing({ of, x, y, width, className, inner = of.inner }: { of: Art; x: number; y: number; width: number; className?: string; inner?: string }): JSX.Element {
  const height = (width * of.height) / of.width;
  return (
    <svg
      x={x}
      y={y}
      width={width}
      height={height}
      viewBox={of.viewBox}
      overflow="visible"
      className={className}
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}

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

/**
 * A fish that drifts across the glass, from a rest place it keeps when nothing moves. Each is a box
 * the size of the glass holding its drawing at its place: the drift, the dart from the light and
 * the start at the bell move the box, which the compositor does on its own. A shape inside the
 * porthole's SVG is redrawn by the page every frame it moves instead.
 */
function Swimmer({ of, x, y, width, delay, className = "", scatter = 0, glow }: { of: Art; x: number; y: number; width: number; delay: number; className?: string; scatter?: number; glow?: string }): JSX.Element {
  const height = (width * of.height) / of.width;
  const place = { left: onGlass(x), top: onGlass(y), width: onGlass(width), height: onGlass(height) };
  return (
    <div className={`stage-drift ${className}`} style={{ "--drift-delay": `${delay}` } as CSSProperties}>
      {/* When the floodlights come on, the fish dart away from the beam (stage.css); they turn about their middle. */}
      <div className="stage-react" style={{ "--scatter": scatter, transformOrigin: `${onGlass(x + width / 2)} ${onGlass(y + height / 2)}` } as CSSProperties}>
        <svg viewBox={of.viewBox} overflow="visible" style={place} dangerouslySetInnerHTML={{ __html: of.inner }} />
        {/* Its own lights again, over it, to pulse (stage.css). */}
        {glow && <svg viewBox={of.viewBox} overflow="visible" className="stage-glow" style={place} dangerouslySetInnerHTML={{ __html: glow }} />}
      </div>
    </div>
  );
}

/** The lights of the deep: the parts of a drawing that pulse. */
const LANTERNFISH_GLOW = partsOf(art.lanternfish, "c-glow");
const JELLY_GLOW = partsOf(art.jellyfish, "c-glow-body", "c-glow");
/** The hull's row of lights, lit, over the ship: they blink when the tanks are full. */
const HULL_LIGHTS = partsOf(art.nautilus, "n-lights");

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

const SNOW: ReadonlyArray<[number, number]> = [
  [62, 120], [118, 88], [170, 260], [212, 64], [268, 140], [320, 92], [372, 188], [420, 120], [96, 300], [150, 380],
  [240, 330], [300, 410], [356, 300], [410, 360], [60, 210], [446, 250], [200, 440], [280, 230], [128, 172], [392, 420],
];

/** How much faster the fish swim at each speed than at half speed. Stop pauses them (stage.css). */
const PLAYBACK: Record<Speed, number> = { stop: 1, half: 1, full: 2.4 };

/**
 * The porthole: water, light, fish, kelp and the Nautilus, drawn in SVG layers on one 560-unit
 * drawing, the moving fish and the bell's ripples in HTML between them (Swimmer, Ripples), and
 * coloured from the theme's variables (stage.css), so every preset repaints it. The controls set data attributes and --d (depth, 0 to 1) on the root; CSS does the rest. The layers themselves never re-render, so a
 * control costs a few attributes, not a new picture.
 */
export const Scene = memo(function Scene({ state, label, description, motto }: { state: SceneState; label: string; description: string; motto: string }): JSX.Element {
  const d = state.depth / MAX_DEPTH;
  const root = useRef<HTMLDivElement>(null);
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
        The layers keep the order of one drawing: the water, the surface, the deep's specks, the reef
        and the floor, the fish, the haze, the ship, the sea in front of her, the bubbles, the bell's
        ripples, then the glass and the rim. What moves or fades in the picture is a layer of its own
        (HTML, or an SVG of its own in HTML): the compositor moves and fades those without the page.
        An SVG shape that moves inside a drawing is redrawn by the page every frame, and a press waits
        on that (site/e2e/stage.latency.spec.ts). The painted layers change only when a control does.
      */}
      <svg viewBox="0 0 560 560" className="stage-art" aria-hidden="true">
        <Defs />
        <g transform="translate(40 40)">
          <g clipPath="url(#stage-glass)">
            <Water />
          </g>
        </g>
      </svg>
      <div className="stage-glass-layer" aria-hidden="true">
        <Surface />
        <Specks />
      </div>
      <svg viewBox="0 0 560 560" className="stage-art stage-art-over" aria-hidden="true">
        <g transform="translate(40 40)">
          <g clipPath="url(#stage-glass)">
            <Floor />
          </g>
        </g>
      </svg>
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
      <linearGradient id="stage-shaft" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" className="stage-shaft-top" />
        <stop offset="1" className="stage-shaft-bottom" />
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
        <stop offset="0.35" className="stage-haze-clear" />
        <stop offset="1" className="stage-haze-deep" />
      </linearGradient>
      <linearGradient id="stage-sheen" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" className="stage-sheen-bright" />
        <stop offset="0.6" className="stage-sheen-clear" />
      </linearGradient>
      <radialGradient id="stage-shadow">
        <stop offset="0" className="stage-shadow-core" />
        <stop offset="1" className="stage-shadow-edge" />
      </radialGradient>
      <linearGradient id="stage-metal" x1="0.15" y1="0" x2="0.85" y2="1">
        <stop offset="0" className="stage-metal-light" />
        <stop offset="0.45" className="stage-metal-mid" />
        <stop offset="0.8" className="stage-metal-dark" />
        <stop offset="1" className="stage-metal-glint" />
      </linearGradient>
      <linearGradient id="stage-layer" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" className="stage-layer-edge" />
        <stop offset="0.5" className="stage-layer-core" />
        <stop offset="1" className="stage-layer-edge" />
      </linearGradient>
      <radialGradient id="stage-vignette" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0.72" className="stage-vignette-clear" />
        <stop offset="1" className="stage-vignette-edge" />
      </radialGradient>
    </defs>
  );
});

/** The water itself, and the marine snow in it, which only change colour with the depth. */
const Water = memo(function Water(): JSX.Element {
  return (
    <>
      <rect className="stage-water" width="480" height="480" fill="url(#stage-sea)" />
      <g className="stage-snow">
        {SNOW.map(([x, y], index) => (
          <circle key={index} cx={x} cy={y} r={index % 3 === 0 ? 1.6 : 1} />
        ))}
      </g>
    </>
  );
});

/** Caustics: the sun's net of light on the water just under the surface, each line swaying on its own. */
const CAUSTICS = [
  "M-20 178 C20 170 40 186 80 178 S140 170 180 180 S250 188 290 176 S360 168 400 180 S470 188 520 176",
  "M-20 200 C30 192 60 208 100 198 S170 190 210 202 S280 210 320 198 S390 190 430 202 S490 208 520 198",
  "M-20 224 C24 218 56 232 96 224 S168 216 208 228 S276 234 316 222 S384 216 424 228 S488 232 520 222",
];

/** The surface and everything near it: they rise out of view as the porthole goes down. */
const Surface = memo(function Surface(): JSX.Element {
  return (
    <div className="stage-surface-world">
      <Layer>
        <rect className="stage-sky" x="0" y="-480" width="480" height="634" />
        <circle className="stage-sun" cx="356" cy="74" r="24" />
        <path className="stage-cloud" d="M84 92 C84 78 106 72 116 82 C126 66 154 68 156 86 C170 86 174 102 160 104 L92 104 C78 104 74 94 84 92 Z" />
        <path className="stage-cloud stage-cloud-far" d="M250 52 C250 44 262 40 268 46 C274 38 290 40 290 50 C298 50 300 58 292 60 L256 60 C248 60 246 54 250 52 Z" />
        <g className="stage-shafts" fill="url(#stage-shaft)">
          <path d="M70 156 L112 156 L40 480 L-30 480 Z" />
          <path d="M184 156 L210 156 L196 480 L144 480 Z" />
          <path d="M292 156 L332 156 L404 480 L322 480 Z" />
          <path d="M392 156 L414 156 L512 480 L462 480 Z" />
        </g>
      </Layer>
      <div className="stage-caustics">
        {CAUSTICS.map((d) => (
          <Layer key={d}>
            <path d={d} />
          </Layer>
        ))}
      </div>
      <Layer>
        <path className="stage-waves" d="M0 152 C20 146 40 158 60 152 C80 146 100 158 120 152 C140 146 160 158 180 152 C200 146 220 158 240 152 C260 146 280 158 300 152 C320 146 340 158 360 152 C380 146 400 158 420 152 C440 146 460 158 480 152 L480 162 L0 162 Z" />
      </Layer>
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

/** The far reef, the layers of brighter water, the kelp and the floor: they only fade with the depth. */
const Floor = memo(function Floor(): JSX.Element {
  return (
    <>
      {/* The far reef, faint in the water's own colour: the first of the depth's layers. */}
      <path className="stage-far" d="M0 392 C40 360 92 372 136 350 C176 332 214 360 256 346 C300 330 340 356 380 340 C420 326 452 348 480 340 L480 480 L0 480 Z" />
      {/* Bands of brighter water hanging at different depths, so the sea has layers between the fish. */}
      <g className="stage-layers" aria-hidden="true">
        <rect x="0" y="212" width="480" height="70" fill="url(#stage-layer)" />
        <rect x="0" y="300" width="480" height="56" fill="url(#stage-layer)" />
      </g>
      <g className="stage-floor">
        <g className="stage-kelp">
          <Drawing of={art.kelp} x={18} y={250} width={74} />
          <Drawing of={art.kelp} x={396} y={276} width={62} />
          <Drawing of={art.kelp} x={330} y={330} width={44} />
        </g>
        <Drawing of={art.seabed} x={0} y={392} width={480} className="stage-seabed" />
        {/* The sun's net of light on the sand, in the sunlit water only. */}
        <g className="stage-floor-caustics">
          <path d="M40 452 C60 444 76 458 98 450 S136 444 152 456 M172 448 C192 440 210 454 230 446 S270 440 288 452 M306 446 C326 438 344 452 364 444 S404 440 424 450" />
          <path d="M70 466 C90 460 104 470 124 464 S160 458 178 468 M206 462 C226 456 244 466 262 460 S298 456 316 466 M338 462 C358 456 374 468 396 460" />
        </g>
      </g>
    </>
  );
});

/** The fish of each band of water, over the sea and under the ship, on the glass's circle. */
const Life = memo(function Life(): JSX.Element {
  return (
    <div className="stage-life" aria-hidden="true">
      <div className="stage-band stage-band-sunlit">
        {SARDINES.map(([x, y, delay], index) => (
          <Swimmer key={index} of={art.sardine} x={x} y={y} width={40} delay={delay} className="stage-sardine" scatter={index % 2 ? 1 : -1} />
        ))}
      </div>
      <div className="stage-band stage-band-twilight">
        {TWILIGHT_SCHOOL.map(([x, y, delay], index) => (
          <Swimmer key={index} of={art.sardine} x={x} y={y} width={30} delay={delay} className="stage-sardine stage-sardine-far" scatter={index % 2 ? 1 : -1} />
        ))}
        <Swimmer of={art.ray} x={140} y={256} width={170} delay={0.2} className="stage-ray" />
        <Swimmer of={art.jellyfish} x={74} y={120} width={34} delay={0.55} className="stage-jelly" />
        <Swimmer of={art.jellyfish} x={370} y={150} width={28} delay={0.8} className="stage-jelly" />
      </div>
      <div className="stage-band stage-band-midnight">
        {LANTERNFISH.map(([x, y, delay], index) => (
          <Swimmer key={index} of={art.lanternfish} x={x} y={y} width={30} delay={delay} className="stage-lanternfish" scatter={index % 2 ? 1 : -1} glow={LANTERNFISH_GLOW} />
        ))}
        <Swimmer of={art.jellyfish} x={52} y={110} width={34} delay={0.35} className="stage-jelly stage-jelly-deep" glow={JELLY_GLOW} />
      </div>
    </div>
  );
});

/** Found only by the lantern: they live where the Nautilus dives. */
const Hidden = memo(function Hidden(): JSX.Element {
  return (
    <g className="stage-hidden" aria-hidden="true">
      <Drawing of={art.anglerfish} x={360} y={136} width={96} className="stage-anglerfish" />
      <Drawing of={art.octopus} x={352} y={318} width={62} className="stage-octopus" />
    </g>
  );
});

/**
 * The Nautilus, riding where the controls put her (stage.css): the beam, the hull with its shadow and
 * wake, the hull's lights lit (they blink when the tanks are full) and the lantern's glow, each a
 * layer the compositor sweeps, fades or moves; then the sea in front of her at the surface.
 */
const Ship = memo(function Ship(): JSX.Element {
  return (
    <>
      <div className="stage-ship-ride">
        <Layer className="stage-beam">
          <path d="M194 16 L600 -110 L600 238 Z" fill="url(#stage-beam)" />
        </Layer>
        <Layer>
          <Wake />
          <ellipse className="stage-hull-shadow" cx="208" cy="76" rx="180" ry="12" fill="url(#stage-shadow)" />
          <Drawing of={art.nautilus} x={0} y={0} width={440} className="stage-ship" />
        </Layer>
        <Layer className="stage-hull-lit">
          <Drawing of={art.nautilus} x={0} y={0} width={440} inner={HULL_LIGHTS} />
        </Layer>
        <Layer className="stage-lantern-glow">
          <circle cx="194" cy="16" r="30" fill="url(#stage-glow)" />
        </Layer>
      </div>
      {/* The sea in front of the hull at the surface: the platform stands three feet out of the water. */}
      <div className="stage-surface-world stage-surface-front">
        <Layer>
          <rect x="0" y="154" width="480" height="60" fill="url(#stage-veil)" />
          <path className="stage-waterline" d="M0 152 C20 146 40 158 60 152 C80 146 100 158 120 152 C140 146 160 158 180 152 C200 146 220 158 240 152 C260 146 280 158 300 152 C320 146 340 158 360 152 C380 146 400 158 420 152 C440 146 460 158 480 152" />
        </Layer>
      </div>
    </>
  );
});

/**
 * The screw's wake: a trail of small bubbles fading aft, so which way she sails is plain. Still, not
 * animated: a moving SVG shape beside the hull repaints the hull, the beam and the glass every frame,
 * and that frame budget belongs to the controls (stage.latency.spec.ts).
 */
const WAKE: ReadonlyArray<[number, number, number]> = [
  [10, 44, 1.8], [2, 50, 1.2], [-6, 40, 1.4], [-14, 48, 1], [-22, 43, 1.3], [-30, 50, 0.9],
];
const Wake = memo(function Wake(): JSX.Element {
  return (
    <g className="stage-wake" aria-hidden="true">
      {WAKE.map(([x, y, r], index) => (
        <circle key={index} cx={x} cy={y} r={r} opacity={0.9 - index * 0.13} />
      ))}
    </g>
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
      {motto ? (
        <text className="stage-motto" dy="4.5">
          <textPath href="#stage-motto-path" startOffset="50%" textAnchor="middle">
            {motto.toUpperCase()}
          </textPath>
        </text>
      ) : null}
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
