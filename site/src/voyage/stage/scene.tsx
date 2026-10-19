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
  /** Bumped by each Dive press, so the bubbles rise again. */
  dives: number;
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
function Swimmer({ of, x, y, width, delay, className = "" }: { of: Art; x: number; y: number; width: number; delay: number; className?: string }): JSX.Element {
  return (
    <g className={`stage-drift ${className}`} style={{ "--drift-delay": `${delay}` } as CSSProperties}>
      <Drawing of={of} x={x} y={y} width={width} />
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
export function Scene({ state, label, description }: { state: SceneState; label: string; description: string }): JSX.Element {
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
      style={{ "--d": d.toFixed(3), "--tanks": state.tanks } as CSSProperties}
    >
      <Defs />
      <g transform="translate(40 40)">
        <g clipPath="url(#stage-glass)">
          <Sea />
          <Life />
          <Ship />
          <Bubbles dives={state.dives} />
          <Glass />
        </g>
      </g>
      <Rim />
    </svg>
  );
}

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
        <path className="stage-waves" d="M0 152 C20 146 40 158 60 152 C80 146 100 158 120 152 C140 146 160 158 180 152 C200 146 220 158 240 152 C260 146 280 158 300 152 C320 146 340 158 360 152 C380 146 400 158 420 152 C440 146 460 158 480 152 L480 162 L0 162 Z" />
      </g>
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
            <Swimmer key={index} of={art.sardine} x={x} y={y} width={40} delay={delay} className="stage-sardine" />
          ))}
        </g>
        <g className="stage-band stage-band-twilight">
          {TWILIGHT_SCHOOL.map(([x, y, delay], index) => (
            <Swimmer key={index} of={art.sardine} x={x} y={y} width={30} delay={delay} className="stage-sardine stage-sardine-far" />
          ))}
          <Swimmer of={art.ray} x={140} y={256} width={170} delay={0.2} className="stage-ray" />
          <Swimmer of={art.jellyfish} x={74} y={120} width={34} delay={0.55} className="stage-jelly" />
          <Swimmer of={art.jellyfish} x={370} y={150} width={28} delay={0.8} className="stage-jelly" />
        </g>
        <g className="stage-band stage-band-midnight">
          {LANTERNFISH.map(([x, y, delay], index) => (
            <Swimmer key={index} of={art.lanternfish} x={x} y={y} width={30} delay={delay} className="stage-lanternfish" />
          ))}
          <Swimmer of={art.jellyfish} x={52} y={110} width={34} delay={0.35} className="stage-jelly stage-jelly-deep" />
        </g>
      </g>
      {/* Found only by the lantern: they live where the Nautilus dives. */}
      <g className="stage-hidden" aria-hidden="true">
        <Drawing of={art.anglerfish} x={372} y={188} width={100} className="stage-anglerfish" />
        <Drawing of={art.octopus} x={352} y={318} width={62} className="stage-octopus" />
      </g>
    </>
  );
});

const Ship = memo(function Ship(): JSX.Element {
  return (
    <>
      <g className="stage-nautilus">
        <path className="stage-beam" d="M222 17 L540 -96 L540 236 Z" fill="url(#stage-beam)" />
        <Drawing of={art.nautilus} x={0} y={0} width={360} className="stage-ship" />
        <circle className="stage-lantern-glow" cx="130" cy="19" r="16" fill="url(#stage-glow)" />
      </g>
      {/* The sea in front of the hull at the surface: the platform stands three feet out of the water. */}
      <g className="stage-surface-world stage-surface-front" aria-hidden="true">
        <rect x="0" y="154" width="480" height="60" fill="url(#stage-veil)" />
        <path className="stage-waterline" d="M0 152 C20 146 40 158 60 152 C80 146 100 158 120 152 C140 146 160 158 180 152 C200 146 220 158 240 152 C260 146 280 158 300 152 C320 146 340 158 360 152 C380 146 400 158 420 152 C440 146 460 158 480 152" />
      </g>
    </>
  );
});

const Bubbles = memo(function Bubbles({ dives }: { dives: number }): JSX.Element {
  return (
    <g className="stage-bubbles" key={dives}>
      {dives > 0 &&
        [[110, 0], [150, 0.15], [196, 0.05], [236, 0.25], [282, 0.1], [320, 0.3], [356, 0.2]].map(([x, delay], index) => (
          <circle key={index} cx={x} cy={300} r={index % 2 ? 3 : 4.5} style={{ "--bubble-delay": delay } as CSSProperties} />
        ))}
    </g>
  );
});

const Glass = memo(function Glass(): JSX.Element {
  return (
    <>
      <rect className="stage-vignette" width="480" height="480" fill="url(#stage-vignette)" />
      <path className="stage-glare" d="M70 120 C92 74 140 40 196 28" />
    </>
  );
});

const Rim = memo(function Rim(): JSX.Element {
  return (
    <g className="stage-rim" aria-hidden="true">
      <circle className="stage-rim-ring" cx="280" cy="280" r="256" />
      <circle className="stage-rim-inner" cx="280" cy="280" r="240" />
      <circle className="stage-rim-outer" cx="280" cy="280" r="272" />
      {Array.from({ length: 12 }, (_, index) => {
        const angle = (index / 12) * Math.PI * 2 + Math.PI / 12;
        return <circle key={index} className="stage-bolt" cx={(280 + Math.cos(angle) * 256).toFixed(1)} cy={(280 + Math.sin(angle) * 256).toFixed(1)} r="4" />;
      })}
    </g>
  );
});
