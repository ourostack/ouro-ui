export { classifyPaintedFrames };
export type { PaintedFrame };

/** A single captured frame's measurement of a column scanned for a box's painted border. */
interface PaintedFrame {
  readonly height: number;
  readonly runs: number;
}

/**
 * Sorts a run of painted-frame height samples, captured during a box's size move under CDP's
 * screencast, into the ones that are capture glitches and the "sound" frames that show the box's
 * real, settling size. A frame whose single scanned column shows more than one border run is torn
 * (a spliced two-frame image). Among the rest, a frame that strays past tolerance from BOTH raw
 * neighbors on the same side — reading behind where the move had already reached on both sides (a
 * dip), or reading ahead of it on both sides (a spike) — is a candidate: CDP can misorder a
 * captured frame either behind where it belongs or ahead of it, so both shapes are a glitch, not
 * only the dip. Checking both shapes with plain raw neighbors always marks a true single glitch's
 * immediate neighbor too (the same inequality that flags the glitch, read from the neighbor's own
 * position, flags the neighbor against the glitch), so candidates form either lone indices or
 * short runs of two or more adjacent frames. A run is resolved by comparing each candidate's height
 * against a straight line drawn between the run's two outer, non-candidate anchor frames: the
 * candidate whose height departs furthest from that line is the one real glitch, and the rest of
 * the run reads as sound again, since on a smooth move a frame that is actually fine sits close to
 * the line its real neighbors describe. The run's first and last frame never count this way, since
 * a caller checks those against the move's own `from`/`to` separately.
 */
function classifyPaintedFrames<T extends PaintedFrame>(
  body: readonly T[],
  sign: number,
  tolerance = 3,
): { torn: Set<number>; stale: Set<number>; sound: T[] } {
  const torn = new Set<number>(body.flatMap((row, index) => (row.runs !== 1 ? [index] : [])));
  const candidate = new Set<number>();
  for (let index = 1; index < body.length - 1; index++) {
    if (torn.has(index)) continue;
    const height = body[index]!.height;
    const prev = body[index - 1]!.height;
    const next = body[index + 1]!.height;
    const behindBoth = (height - prev) * sign < -tolerance && (height - next) * sign < -tolerance;
    const aheadOfBoth = (height - prev) * sign > tolerance && (height - next) * sign > tolerance;
    if (behindBoth || aheadOfBoth) candidate.add(index);
  }
  const stale = new Set<number>();
  const sorted = [...candidate].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j++;
    const run = sorted.slice(i, j + 1);
    if (run.length === 1) {
      stale.add(run[0]!);
    } else {
      const left = run[0]! - 1;
      const right = run.at(-1)! + 1;
      const leftHeight = body[left]!.height;
      const rightHeight = body[right]!.height;
      let worst = run[0]!;
      let worstDeviation = -Infinity;
      for (const index of run) {
        const expected = leftHeight + ((rightHeight - leftHeight) * (index - left)) / (right - left);
        const deviation = Math.abs(body[index]!.height - expected);
        if (deviation > worstDeviation) {
          worstDeviation = deviation;
          worst = index;
        }
      }
      stale.add(worst);
    }
    i = j + 1;
  }
  const sound = body.filter((_, index) => !torn.has(index) && !stale.has(index));
  return { torn, stale, sound };
}
