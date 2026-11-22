import type { CSSProperties, JSX } from "react";
import type { Surface } from "./ledger";
import { CHECK_KEYS, checksOf, type CheckState } from "./checks";

/*
 * The ring: every counted product is a star on one orbit around Ouro UI. A star has four rays, one per check (up: on
 * current Ouro UI; right: census at zero; down: AX must claims pass; left: has given back): a passing
 * check is a full ray, a missing one a stub, one not measured yet a dotted ray, and one that does not apply no ray. A
 * star lights green only when the ledger confirms the product, and the arc between two lit neighbours lights with them,
 * so the ring closes, the snake meeting its tail, when the last product turns green. It is a picture of the list beside
 * it, so it is hidden from assistive technology; the heading and the list say everything it shows.
 */

const SIZE = 320;
const CENTER = SIZE / 2;
const RADIUS = 128;
const RAY: Record<CheckState, number> = { met: 10, missing: 3.5, unmeasured: 10, na: 0 };
const DIRECTIONS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;

const at = (index: number, count: number): [number, number] => {
  const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
  return [CENTER + RADIUS * Math.cos(angle), CENTER + RADIUS * Math.sin(angle)];
};

const round = (value: number): number => Math.round(value * 100) / 100;

/** Faint background stars, the same on every render (a fixed seed), kept inside the porthole. */
const DUST = (() => {
  let seed = 7;
  const next = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const dots: Array<{ x: number; y: number; r: number; o: number }> = [];
  while (dots.length < 48) {
    const x = next() * SIZE;
    const y = next() * SIZE;
    const r = next();
    const o = next();
    const from = Math.hypot(x - CENTER, y - CENTER);
    // Kept off the middle, where the count is read, so no dust sits behind its text.
    if (from < CENTER - 10 && from > 96) dots.push({ x: round(x), y: round(y), r: round(0.5 + r * 0.8), o: round(0.25 + o * 0.5) });
  }
  return dots;
})();

export function Sky({ stars, active, fresh, closed }: { stars: Surface[]; active: string[]; fresh: Set<string>; closed: boolean }): JSX.Element {
  const count = stars.length;
  const points = stars.map((_, index) => at(index, count));
  return (
    <svg className="adoption-sky" viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true" focusable="false" data-closed={closed || undefined}>
      {DUST.map((dot, index) => (
        <circle key={`dust-${index}`} className="adoption-dust" cx={dot.x} cy={dot.y} r={dot.r} opacity={dot.o} />
      ))}
      <circle className="adoption-orbit" cx={CENTER} cy={CENTER} r={RADIUS} />
      {stars.map((surface, index) => {
        const next = (index + 1) % count;
        if (count < 2 || !surface.confirmed || !stars[next]!.confirmed) return null;
        const [x1, y1] = points[index]!;
        const [x2, y2] = points[next]!;
        return <path key={`arc-${surface.id}`} className="adoption-arc" d={`M ${round(x1)} ${round(y1)} A ${RADIUS} ${RADIUS} 0 0 1 ${round(x2)} ${round(y2)}`} />;
      })}
      {closed ? <circle className="adoption-closed" cx={CENTER} cy={CENTER} r={RADIUS} pathLength={1} /> : null}
      {closed
        ? points.map(([x, y], index) => {
            const dx = (x - CENTER) / RADIUS;
            const dy = (y - CENTER) / RADIUS;
            return <line key={`spark-${index}`} className="adoption-spark" x1={round(x + dx * 14)} y1={round(y + dy * 14)} x2={round(x + dx * 24)} y2={round(y + dy * 24)} style={{ "--i": index } as CSSProperties} />;
          })
        : null}
      {stars.map((surface, index) => {
        const [x, y] = points[index]!;
        const checks = checksOf(surface);
        return (
          <g
            key={surface.id}
            className="adoption-star"
            data-id={surface.id}
            data-lit={surface.confirmed || undefined}
            data-active={active.includes(surface.id) || undefined}
            style={{ "--i": index, transformOrigin: `${round(x)}px ${round(y)}px` } as CSSProperties}
          >
            <circle className="adoption-halo" cx={round(x)} cy={round(y)} r={13} />
            {CHECK_KEYS.map((key, ray) => {
              const state = checks[ray]!.state;
              if (state === "na") return null;
              const [dx, dy] = DIRECTIONS[ray]!;
              return <line key={key} className="adoption-ray" data-state={state} data-new={fresh.has(`${surface.id}:${key}`) || undefined} x1={round(x + dx * 5)} y1={round(y + dy * 5)} x2={round(x + dx * (5 + RAY[state]))} y2={round(y + dy * (5 + RAY[state]))} />;
            })}
            <circle className="adoption-core" cx={round(x)} cy={round(y)} r={surface.confirmed ? 4.5 : 3} />
          </g>
        );
      })}
    </svg>
  );
}
