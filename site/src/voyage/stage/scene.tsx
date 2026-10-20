import { memo, useEffect, useRef, type CSSProperties, type JSX } from "react";
import { art, type Art } from "./art";
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
function Drawing({ of, x, y, width, className }: { of: Art; x: number; y: number; width: number; className?: string }): JSX.Element {
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
      dangerouslySetInnerHTML={{ __html: of.inner }}
    />
  );
}

/** A fish that drifts across the glass, from a rest place it keeps when nothing moves. */
function Swimmer({ of, x, y, width, delay, className = "", scatter = 0 }: { of: Art; x: number; y: number; width: number; delay: number; className?: string; scatter?: number }): JSX.Element {
  return (
    <g className={`stage-drift ${className}`} style={{ "--drift-delay": `${delay}` } as CSSProperties}>
      {/* When the floodlights come on, the fish dart away from the beam (stage.css). */}
      <g className="stage-react" style={{ "--scatter": scatter } as CSSProperties}>
        <Drawing of={of} x={x} y={y} width={width} />
      </g>
    </g>
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

const SNOW: ReadonlyArray<[number, number]> = [
  [62, 120], [118, 88], [170, 260], [212, 64], [268, 140], [320, 92], [372, 188], [420, 120], [96, 300], [150, 380],
  [240, 330], [300, 410], [356, 300], [410, 360], [60, 210], [446, 250], [200, 440], [280, 230], [128, 172], [392, 420],
];

/** How much faster the fish swim at each speed than at half speed. Stop pauses them (stage.css). */
const PLAYBACK: Record<Speed, number> = { stop: 1, half: 1, full: 2.4 };

/**
 * The porthole: water, light, fish, kelp and the Nautilus, layered in one SVG and coloured from the
 * theme's variables (stage.css), so every preset repaints it. The controls set data attributes and
 * --d (depth, 0 to 1) on the root; CSS does the rest. The layers themselves never re-render, so a
 * control costs a few attributes, not a new picture.
 */
export const Scene = memo(function Scene({ state, label, description, motto }: { state: SceneState; label: string; description: string; motto: string }): JSX.Element {
  const d = state.depth / MAX_DEPTH;
  const root = useRef<SVGSVGElement>(null);
  // Speed changes the fish's playback rate, so they speed up from where they are instead of jumping.
  useEffect(() => {
    for (const animation of root.current?.getAnimations({ subtree: true }) ?? []) {
      if (animation instanceof CSSAnimation && animation.animationName === "stage-drift") animation.updatePlaybackRate(PLAYBACK[state.speed]);
    }
  }, [state.speed]);
  return (
    <svg
      ref={root}
      viewBox="0 0 560 560"
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
      <Defs />
      <g transform="translate(40 40)">
        <g clipPath="url(#stage-glass)">
          <Sea />
          <Life />
          <rect className="stage-haze" width="480" height="480" fill="url(#stage-haze)" />
          <Ship />
          <Bubbles dives={state.dives} />
          <Ripples rings={state.rings} />
          <Glass />
        </g>
      </g>
      <Rim motto={motto} />
    </svg>
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
      <radialGradient id="stage-vignette" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0.72" className="stage-vignette-clear" />
        <stop offset="1" className="stage-vignette-edge" />
      </radialGradient>
    </defs>
  );
});

const Sea = memo(function Sea(): JSX.Element {
  return (
    <>
      <rect className="stage-water" width="480" height="480" fill="url(#stage-sea)" />
      <g className="stage-snow">
        {SNOW.map(([x, y], index) => (
          <circle key={index} cx={x} cy={y} r={index % 3 === 0 ? 1.6 : 1} />
        ))}
      </g>
      {/* The surface and everything near it rise out of view as the porthole goes down. */}
      <g className="stage-surface-world">
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
        {/* Caustics: the sun's net of light on the water just under the surface. */}
        <g className="stage-caustics">
          <path d="M-20 178 C20 170 40 186 80 178 S140 170 180 180 S250 188 290 176 S360 168 400 180 S470 188 520 176" />
          <path d="M-20 200 C30 192 60 208 100 198 S170 190 210 202 S280 210 320 198 S390 190 430 202 S490 208 520 198" />
          <path d="M-20 224 C24 218 56 232 96 224 S168 216 208 228 S276 234 316 222 S384 216 424 228 S488 232 520 222" />
        </g>
        <path className="stage-waves" d="M0 152 C20 146 40 158 60 152 C80 146 100 158 120 152 C140 146 160 158 180 152 C200 146 220 158 240 152 C260 146 280 158 300 152 C320 146 340 158 360 152 C380 146 400 158 420 152 C440 146 460 158 480 152 L480 162 L0 162 Z" />
      </g>
      <g className="stage-specks" aria-hidden="true">
        {SPECKS.map(([x, y, delay], index) => (
          <circle key={index} cx={x} cy={y} r={index % 4 === 0 ? 2 : 1.3} style={{ "--twinkle-delay": `${delay}s` } as CSSProperties} />
        ))}
      </g>
      {/* The far reef, faint in the water's own colour: the first of the depth's layers. */}
      <path className="stage-far" d="M0 392 C40 360 92 372 136 350 C176 332 214 360 256 346 C300 330 340 356 380 340 C420 326 452 348 480 340 L480 480 L0 480 Z" />
      <g className="stage-floor">
        <g className="stage-kelp">
          <Drawing of={art.kelp} x={18} y={250} width={74} />
          <Drawing of={art.kelp} x={396} y={276} width={62} />
          <Drawing of={art.kelp} x={330} y={330} width={44} />
        </g>
        <Drawing of={art.seabed} x={0} y={392} width={480} className="stage-seabed" />
      </g>
    </>
  );
});

const Life = memo(function Life(): JSX.Element {
  return (
    <>
      <g className="stage-life">
        <g className="stage-band stage-band-sunlit">
          {SARDINES.map(([x, y, delay], index) => (
            <Swimmer key={index} of={art.sardine} x={x} y={y} width={40} delay={delay} className="stage-sardine" scatter={index % 2 ? 1 : -1} />
          ))}
        </g>
        <g className="stage-band stage-band-twilight">
          {TWILIGHT_SCHOOL.map(([x, y, delay], index) => (
            <Swimmer key={index} of={art.sardine} x={x} y={y} width={30} delay={delay} className="stage-sardine stage-sardine-far" scatter={index % 2 ? 1 : -1} />
          ))}
          <Swimmer of={art.ray} x={140} y={256} width={170} delay={0.2} className="stage-ray" />
          <Swimmer of={art.jellyfish} x={74} y={120} width={34} delay={0.55} className="stage-jelly" />
          <Swimmer of={art.jellyfish} x={370} y={150} width={28} delay={0.8} className="stage-jelly" />
        </g>
        <g className="stage-band stage-band-midnight">
          {LANTERNFISH.map(([x, y, delay], index) => (
            <Swimmer key={index} of={art.lanternfish} x={x} y={y} width={30} delay={delay} className="stage-lanternfish" scatter={index % 2 ? 1 : -1} />
          ))}
          <Swimmer of={art.jellyfish} x={52} y={110} width={34} delay={0.35} className="stage-jelly stage-jelly-deep" />
        </g>
      </g>
      {/* Found only by the lantern: they live where the Nautilus dives. */}
      <g className="stage-hidden" aria-hidden="true">
        <Drawing of={art.anglerfish} x={360} y={136} width={96} className="stage-anglerfish" />
        <Drawing of={art.octopus} x={352} y={318} width={62} className="stage-octopus" />
      </g>
    </>
  );
});

const Ship = memo(function Ship(): JSX.Element {
  return (
    <>
      <g className="stage-nautilus">
        <path className="stage-beam" d="M232 8 L600 -112 L600 228 Z" fill="url(#stage-beam)" />
        <Wake />
        <ellipse className="stage-hull-shadow" cx="208" cy="76" rx="180" ry="12" fill="url(#stage-shadow)" />
        <Drawing of={art.nautilus} x={0} y={0} width={440} className="stage-ship" />
        <circle className="stage-lantern-glow" cx="227" cy="8" r="22" fill="url(#stage-glow)" />
      </g>
      {/* The sea in front of the hull at the surface: the platform stands three feet out of the water. */}
      <g className="stage-surface-world stage-surface-front" aria-hidden="true">
        <rect x="0" y="154" width="480" height="60" fill="url(#stage-veil)" />
        <path className="stage-waterline" d="M0 152 C20 146 40 158 60 152 C80 146 100 158 120 152 C140 146 160 158 180 152 C200 146 220 158 240 152 C260 146 280 158 300 152 C320 146 340 158 360 152 C380 146 400 158 420 152 C440 146 460 158 480 152" />
      </g>
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

const Bubbles = memo(function Bubbles({ dives }: { dives: number }): JSX.Element {
  return (
    <g className="stage-bubbles" key={dives} data-streaming={dives > 0 ? "" : undefined}>
      {dives > 0 &&
        BUBBLES.map(([x, delay, r], index) => <circle key={index} cx={x} cy={330 - (index % 3) * 18} r={r} style={{ "--bubble-delay": delay } as CSSProperties} />)}
    </g>
  );
});

/** Rings of sound spreading through the water from the hull when the bell rings; they ride with the ship (stage.css). */
const Ripples = memo(function Ripples({ rings }: { rings: number }): JSX.Element {
  return (
    <g className="stage-ripples" key={rings} data-rung={rings > 0 ? "" : undefined} aria-hidden="true">
      {rings > 0 && [0, 0.35, 0.7].map((delay, index) => <ellipse key={index} cx="208" cy="45" rx="44" ry="44" style={{ "--ripple-delay": `${delay}s` } as CSSProperties} />)}
    </g>
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
      <circle className="stage-rim-shade" cx="240" cy="240" r="236" />
    </>
  );
});

/** The rim: Nemo's motto engraved around the top, and the screws that hold the glass. */
const Rim = memo(function Rim({ motto }: { motto: string }): JSX.Element {
  return (
    <g className="stage-rim" aria-hidden="true">
      <path id="stage-motto-path" d="M 280 280 m -256 0 a 256 256 0 0 1 512 0" fill="none" />
      <circle className="stage-rim-ring" cx="280" cy="280" r="256" />
      <circle className="stage-rim-inner" cx="280" cy="280" r="240" />
      <circle className="stage-rim-outer" cx="280" cy="280" r="272" />
      <circle className="stage-rim-rule" cx="280" cy="280" r="267" />
      <circle className="stage-rim-rule" cx="280" cy="280" r="245" />
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
