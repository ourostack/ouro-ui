declare module "node:child_process" {
  /*
   * `ouro-build-source.ts` is the one registry file that genuinely runs only under Node (a
   * Vite plugin), so, like `env.d.ts`'s `process.env.NODE_ENV`, its two Node calls
   * (`execFileSync`, `process.cwd()`) get their own minimal type here instead of depending on
   * `@types/node`: this is what `pnpm typecheck` checks the registry source against. An app's
   * own `@types/node` (a Vite project nearly always has one) merges with these, so neither
   * widens the other.
   *
   * This overload is deliberately loose (optional args, a permissive options bag): `@types/node`
   * declares `execFileSync` with several narrower, more specific overloads of its own, and an
   * app's own `@types/node` merges this declaration with those. A narrower overload here would
   * instead compete with theirs for the same call shape and could win, forcing every other
   * `execFileSync` call in the program (not just this file's) through its narrower type.
   */
  export function execFileSync(file: string, args?: readonly string[], options?: Record<string, unknown>): string;
}
declare namespace NodeJS {
  interface Process {
    cwd(): string;
  }
}
