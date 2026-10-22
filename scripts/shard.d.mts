export const timingsFile: string;
export const slicedSuites: string[];
export function parseShard(text: string | undefined): { index: number; count: number };
export function readTimings(kind: "vitest" | "scripts", file?: string): Record<string, number>;
export function balance(keys: readonly string[], count: number, timings: Record<string, number>): Array<{ keys: string[]; weight: number }>;
export function shardKeys(keys: readonly string[], shard: { index: number; count: number }, timings: Record<string, number>): string[];
export function scriptTestFiles(rootDir?: string): string[];
export function collectTimings(dir: string): { vitest: Record<string, number>; scripts: Record<string, number> };
