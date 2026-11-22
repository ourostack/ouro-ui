export const exemptionsPath: string;
export interface HeadroomExemption { test: string; reason: string; owner: string }
export interface HeadroomTest { name: string; durationMs: number; timeoutMs: number }
export function readExemptions(path?: string): HeadroomExemption[];
export function exemptionProblems(exemptions: readonly HeadroomExemption[]): string[];
export function headroomProblems(tests: readonly HeadroomTest[], exemptions: readonly HeadroomExemption[]): string[];
export const staleBelow: number;
