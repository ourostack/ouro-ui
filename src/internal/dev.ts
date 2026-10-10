import { isProduction } from "./env.ts";

const seenMessages = new Set<string>();
const seenByKey = new WeakMap<object, Set<string>>();

const tidy = (text: string) => text.replace(/\.$/, "");

function format(component: string, problem: string, fix: string): string {
  return `[ouro-ui] ${component}: ${tidy(problem)}. Fix: ${tidy(fix)}.`;
}

/**
 * Logs one development-only warning in the format
 * `[ouro-ui] <Component>: <what's wrong>. Fix: <exact code>.`
 *
 * With a `key` (use a per-instance ref object) the warning is emitted once per
 * key and message; without one, once per message text. No-op in production.
 *
 * @example
 * devWarn("Button", '"bg-red-500" sets appearance', 'Use tone="danger" instead', ref);
 */
export function devWarn(component: string, problem: string, fix: string, key?: object): void {
  if (isProduction()) return;
  const message = format(component, problem, fix);
  if (key) {
    let seen = seenByKey.get(key);
    if (!seen) {
      seen = new Set();
      seenByKey.set(key, seen);
    }
    if (seen.has(message)) return;
    seen.add(message);
  } else {
    if (seenMessages.has(message)) return;
    seenMessages.add(message);
  }
  console.warn(message);
}

/**
 * Throws an `Error` for a misuse that cannot be recovered from. In development
 * the message teaches the fix; in production it is shortened to
 * `[ouro-ui] <Component>: <problem>`.
 *
 * @example
 * devThrow("Sheet.Title", "must be rendered inside <Sheet>", "<Sheet title=\"…\">…</Sheet>");
 */
export function devThrow(component: string, problem: string, fix: string): never {
  if (isProduction()) throw new Error(`[ouro-ui] ${component}: ${problem}`);
  throw new Error(format(component, problem, fix));
}
