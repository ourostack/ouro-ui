// `ouro-build-source.ts` is the one registry file that genuinely runs only under Node (a Vite
// plugin), so, like `env.d.ts`'s `process.env.NODE_ENV`, its two Node calls (`execFileSync`,
// `process.cwd()`) get their own minimal type here instead of depending on `@types/node`: this
// is what `pnpm typecheck` checks the registry source against. An app's own `@types/node` (a
// Vite project nearly always has one) merges with these, so neither widens the other.
declare module "node:child_process" {
  export function execFileSync(
    file: string,
    args: readonly string[],
    options: { cwd: string; encoding: "utf8" },
  ): string;
}
declare namespace NodeJS {
  interface Process {
    cwd(): string;
  }
}
