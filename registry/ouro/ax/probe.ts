export { pidAlive, probeHttp };
export type { Probe, ProbeOptions };

// The export list comes first because the shadcn CLI drops comments before a file's
// first statement, which would take the JSDoc below with it.

import type { PartState } from "./doctor.ts";

/**
 * How a doctor tells a local process's state from outside it, so it answers whatever state the app is in: an HTTP
 * endpoint that answers is up, one that takes the request and gives no answer in time is stuck, and one that refuses it
 * is down. A person needs to know which of those it is, and "not reachable" hides it.
 *
 * @claim "an HTTP endpoint that answers is up, one that takes the request and gives no answer in time is stuck, and one that refuses it is down" registry/ouro/ax/probe.test.mts verify:testExists(registry/ouro/ax/probe.test.mts::probeHttp tells up, stuck and down apart on real local sockets)
 * @example
 * const service = await probeHttp("http://127.0.0.1:5180/health", { timeoutMs: 1500 });
 * // { state: "up", status: 200, body: { ok: true } }, { state: "stuck" } or { state: "down" }
 */
interface Probe {
  state: Extract<PartState, "up" | "stuck" | "down">;
  /** The HTTP status, when it answered, even if only its headers came. */
  status?: number;
  /** The answer's JSON, when it answered with JSON. */
  body?: unknown;
}

interface ProbeOptions {
  /**
   * How long to wait for the answer. Default 1500 ms.
   *
   * @claim "Default 1500 ms" registry/ouro/ax/probe.ts verify:fileLine(registry/ouro/ax/probe.ts, /timeoutMs = 1500/)
   */
  timeoutMs?: number;
  /** For tests: the `fetch` to use. */
  fetchImpl?: typeof fetch;
  headers?: Record<string, string>;
}

/**
 * GETs `url` with a time limit: "up" with its status, and its JSON when the answer is JSON; "stuck" when no answer came
 * in `timeoutMs`, or the headers came and the rest of the answer didn't; "down" when the request failed without an
 * answer, as when nothing listens on the port. On a local port, stuck means the process took the connection and never
 * answered.
 *
 * @claim "when no answer came in `timeoutMs`" registry/ouro/ax/probe.test.mts verify:testExists(registry/ouro/ax/probe.test.mts::probeHttp tells up, stuck and down apart on real local sockets)
 * @claim "stuck means the process took the connection and never answered" registry/ouro/ax/probe.test.mts verify:testExists(registry/ouro/ax/probe.test.mts::probeHttp tells up, stuck and down apart on real local sockets)
 * @example
 * const asked = await probeHttp(`${serviceUrl}/api/doctor`, { timeoutMs: 8000 });
 * if (asked.state === "up" && isDoctorReport(asked.body)) return asked.body;
 */
async function probeHttp(url: string, { timeoutMs = 1500, fetchImpl = fetch, headers = {} }: ProbeOptions = {}): Promise<Probe> {
  try {
    const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    let text: string;
    try {
      text = await res.text();
    } catch (error) {
      // Headers came and the rest never did: a process that hangs mid-answer is stuck, not up.
      return timedOut(error) ? { state: "stuck", status: res.status } : { state: "up", status: res.status };
    }
    try {
      return { state: "up", status: res.status, body: JSON.parse(text) as unknown };
    } catch {
      return { state: "up", status: res.status };
    }
  } catch (error) {
    return { state: timedOut(error) ? "stuck" : "down" };
  }
}

/** Whether a request ended because its time ran out (or it was aborted), rather than because it failed. */
function timedOut(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  return name === "TimeoutError" || name === "AbortError";
}

/**
 * Whether a process with this pid runs, including one that runs as another user (the system answers `EPERM`). Anything
 * but a positive whole number is no process.
 *
 * @claim "including one that runs as another user" registry/ouro/ax/probe.test.mts verify:testExists(registry/ouro/ax/probe.test.mts::pidAlive is true for a running process, one of another user's, and false for no process or no pid)
 * @claim "Anything but a positive whole number is no process" registry/ouro/ax/probe.test.mts verify:testExists(registry/ouro/ax/probe.test.mts::pidAlive is true for a running process, one of another user's, and false for no process or no pid)
 * @example
 * pidAlive(Number(readFileSync(pidFile, "utf8"))); // true while it runs
 */
function pidAlive(pid: unknown, kill: (pid: number, signal: 0) => unknown = (p, s) => process.kill(p, s)): boolean {
  if (!Number.isSafeInteger(pid) || (pid as number) <= 0) return false;
  try {
    kill(pid as number, 0);
    return true;
  } catch (error) {
    return (error as { code?: unknown } | null)?.code === "EPERM";
  }
}
