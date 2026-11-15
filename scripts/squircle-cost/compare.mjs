// Whether the squircle surfaces cost more to repaint than the five-point drawing, judged round by round. The harness
// alternates the modes within each round, so a round's on and ref frames share the runner's state; comparing their
// medians round by round keeps one slow stretch of a shared runner (one round's frames at 50 ms) from deciding the run,
// as it did when the means were compared (#1526). The surfaces cost more when they are slower in more rounds than
// chance allows: a one-sided sign test at 5%, over the rounds that are not tied.

/** The median of `values`. */
export const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/** `values` cut into `rounds` runs of equal length, in order, as the harness appends them. */
export function byRound(values, rounds) {
  if (!(rounds > 0) || values.length % rounds)
    throw new Error(`${values.length} frames do not split into ${rounds} rounds of equal length.`);
  const size = values.length / rounds;
  return Array.from({ length: rounds }, (_, i) => values.slice(i * size, (i + 1) * size));
}

/** The chance that `n` fair coin flips give `k` or more heads. */
const tail = (n, k) => {
  let choose = 1;
  let sum = 0;
  for (let i = 0; i <= n; i++) {
    if (i >= k) sum += choose;
    choose = (choose * (n - i)) / (i + 1);
  }
  return sum / 2 ** n;
};

/** How many of `n` untied rounds must be slower before chance alone explains it less than 5% of the time. */
export function slowerNeeded(n) {
  for (let k = 0; k <= n; k++) if (tail(n, k) <= 0.05) return k;
  return n + 1;
}

/**
 * Compares the on and ref frame times round by round. `costsMore` is true when on's median frame is slower than ref's
 * in at least `needed` of the untied rounds.
 */
export function compareRounds(on, ref, rounds) {
  const pairs = byRound(on, rounds).map((frames, i) => ({
    on: median(frames),
    ref: median(byRound(ref, rounds)[i]),
  }));
  const slower = pairs.filter((pair) => pair.on > pair.ref).length;
  const faster = pairs.filter((pair) => pair.on < pair.ref).length;
  const needed = slowerNeeded(slower + faster);
  return { pairs, slower, faster, needed, costsMore: slower >= needed };
}
