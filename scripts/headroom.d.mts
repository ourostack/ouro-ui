export const exemptionsPath: string;
export interface HeadroomExemption { test: string; reason: string; owner: string }
export interface HeadroomTest { name: string; durationMs: number; timeoutMs: number }
export function readExemptions(path?: string): HeadroomExemption[];
export function exemptionProblems(exemptions: readonly HeadroomExemption[]): string[];
export function headroomProblems(tests: readonly HeadroomTest[], exemptions: readonly HeadroomExemption[]): string[];
export function staleExemptions(exemptions: readonly HeadroomExemption[], base?: string): string[];
export function changedFiles(value: string | undefined): Set<string> | null;
export function headroomReason(body: string): string | null;
export function ratchetProblems(input: { base: readonly HeadroomExemption[]; head: readonly HeadroomExemption[]; body: string }): string[];
export function reportOnly(event: string | undefined): boolean;
export function judge(input: { tests: readonly (HeadroomTest & { file: string })[]; exemptions: readonly HeadroomExemption[]; event: string | undefined; changed: Set<string> | null }): { failures: string[]; warnings: string[]; breaches: string[] };
