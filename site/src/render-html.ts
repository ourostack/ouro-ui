import type { ReactNode } from "react";
import { prerender, type PrerenderResult } from "react-dom/static";

/** Complete static HTML, or the original rendering failure; never a client-recovery shell. */
export async function renderHtml(
  node: ReactNode,
  createStream: typeof prerender = prerender,
): Promise<string> {
  const controller = new AbortController();
  let stream: PrerenderResult["prelude"] | undefined;
  let failed = false;
  let firstFailure: unknown;
  const cleanupFailures: unknown[] = [];
  const fail = (error: unknown) => {
    if (failed) return;
    failed = true;
    firstFailure = error;
    try {
      console.error("Ouro HX prerender failed", error);
    } catch (diagnosticFailure) {
      cleanupFailures.push(diagnosticFailure);
    }
    controller.abort(error);
  };
  try {
    // Even completed boundaries can be outlined behind JS reveal scripts once a chunk fills.
    const result = await createStream(node, { signal: controller.signal, onError: fail, progressiveChunkSize: Infinity });
    stream = result.prelude;
    if (result.postponed !== null) throw new Error("Prerender returned unfinished content");
    if (failed) throw firstFailure;
    const html = await new Response(stream).text();
    if (failed) throw firstFailure;
    return html;
  } catch (error) {
    fail(error);
    if (stream && !stream.locked) {
      try {
        await stream.cancel(firstFailure);
      } catch (cleanupFailure) {
        cleanupFailures.push(cleanupFailure);
      }
    }
  }
  if (cleanupFailures.length) {
    throw new AggregateError([firstFailure, ...cleanupFailures], "Prerender failed and cleanup also failed", { cause: firstFailure });
  }
  throw firstFailure;
}
