// Stability guard for the sweeps' pictures (states-sweep.ts). On a pull request, a picture of a control whose
// component or shared CSS the change touches is taken twice, and the run fails when the two differ, so a state
// that draws differently from one take to the next (a hover that settles late) shows on the pull request and
// not on main. Main's runs, and pictures of controls the change does not reach, are taken once.
//
//   node scripts/sweeps-retake.mjs <event> <changed-files-list>   prints OURO_SWEEP_RETAKE's value
//
// OURO_SWEEP_RETAKE is `all`, `names:<a>,<b>` (the components changed) or empty/unset (take once); set it by hand to try the guard.

const tests = /(\.(test|stories|spec)\.[a-z]+$|\.test-d\.ts$|component\.json$|\.md$)/;

export function retakeScope(event: string, changed: readonly string[] | null): string {
  if (event !== "pull_request") return "";
  // A diff that could not be read, or is empty, is judged as if everything changed.
  if (changed === null || changed.length === 0) return "all";
  const names = new Set<string>();
  for (const file of changed) {
    if (tests.test(file)) continue;
    if (/^(registry\/ouro\/theme\/|registry\/ouro\/lib\/ouro\/)/.test(file) || file === "app.css" || /^site\/.*\.css$/.test(file)) return "all";
    const part = /^registry\/ouro\/components\/ouro\/([^/]+)\/([^/]+)$/.exec(file);
    if (part) {
      names.add(part[1]!);
      names.add(part[2]!.replace(/\.[a-z]+$/, "").replace(/-(parts|styles)$/, ""));
    }
  }
  return names.size === 0 ? "" : `names:${[...names].sort().join(",")}`;
}

/** Whether a control's picture is taken twice under this scope (the value of OURO_SWEEP_RETAKE). */
export function wantsRetake(scope: string | undefined, signature: string): boolean {
  if (!scope) return false;
  if (scope === "all") return true;
  const lower = signature.toLowerCase();
  return scope.replace(/^names:/, "").split(",").some((name) => name !== "" && lower.includes(name.toLowerCase()));
}

interface Picture {
  data: Uint8Array;
  width: number;
  height: number;
}

/**
 * How far one channel of a pixel may move between the takes and still count as the same: a control's antialiased edge
 * blends with the page behind it, which can shift a unit as it is redrawn (a reorderable handle's corners on /nautilus/,
 * one unit on 10 pixels, #3021). A state that settles late moves far more (a hover's tint, 13 units on the ring).
 */
const NOISE = 2;

/** A finding naming the control, page and state when the two takes differ; null when they agree. */
export function instability(first: Picture | null, second: Picture | null, where: { signature: string; page: string; state: string }): string | null {
  if (!first || !second) return null;
  const same = first.width === second.width && first.height === second.height && first.data.length === second.data.length && first.data.every((value, i) => Math.abs(value - second.data[i]!) <= NOISE);
  return same ? null : `${where.signature} on ${where.page} in ${where.state}: two takes of its picture differ, so the state is not stable`;
}
