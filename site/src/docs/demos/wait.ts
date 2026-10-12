/** Resolves after `ms` milliseconds: a stand-in for a server round trip in the demos. */
export const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
