/**
 * Stands in for the app's server while the real one is built. Each call waits about as long
 * as a network request and is logged on `window.__fakeApi.calls`. The files in src/api/ are
 * the backend's contract: use them as they are and don't change them.
 */
export interface FakeApiCall {
  fn: string;
  args: unknown[];
}

declare global {
  interface Window {
    __fakeApi?: { calls: FakeApiCall[] };
  }
}

export async function request<T>(fn: string, args: unknown[], respond: () => T, ms = 600): Promise<T> {
  const log = (window.__fakeApi ??= { calls: [] });
  log.calls.push({ fn, args: structuredClone(args) });
  await new Promise((resolve) => setTimeout(resolve, ms));
  return respond();
}
