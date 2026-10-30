/**
 * A tool's exit codes as one table: the overview, every command's footer, `help --json` and the MCP error shape read
 * it, so the numbers never drift. Codes 0, 1 and 2 mean the same thing in every Ouro AX tool.
 */
export interface ExitCode {
  code: number;
  /** A slug an error names its exit by, such as "usage" or "unavailable". */
  name: string;
  /** A few words for the one-line summary. */
  short: string;
  /** The full meaning, for `help exit-codes`. */
  meaning: string;
}

export const BASE_EXIT_CODES: readonly ExitCode[] = Object.freeze([
  { code: 0, name: "ok", short: "ok", meaning: "ok" },
  { code: 1, name: "error", short: "error", meaning: "error: the message says what to do" },
  { code: 2, name: "usage", short: "usage", meaning: "usage: a missing or wrong argument; nothing was done" },
]);

export interface ExitTable {
  readonly codes: readonly ExitCode[];
  /** The number for a name; throws for a name the table does not have, so a typo fails in tests, not in an agent's run. */
  code(name: string): number;
  /** `Exit codes: 0 ok, 1 error, 2 usage, ...` */
  line(): string;
}

/**
 * The tool's table: the base codes (their meanings may be reworded, never their names) then its own, numbered from 3
 * with no gaps.
 */
export function defineExitCodes(codes: readonly ExitCode[] = BASE_EXIT_CODES): ExitTable {
  codes.forEach((entry, i) => {
    if (entry.code !== i) throw new Error(`exit codes: code ${entry.code} is at position ${i}. Fix: number the codes 0, 1, 2, ... with no gaps.`);
    const base = BASE_EXIT_CODES[i];
    if (base && entry.name !== base.name) throw new Error(`exit codes: code ${i} is named "${entry.name}". Fix: name it "${base.name}", as every Ouro AX tool does.`);
  });
  if (codes.length < BASE_EXIT_CODES.length) throw new Error("exit codes: the table needs 0 ok, 1 error and 2 usage. Fix: start from BASE_EXIT_CODES.");
  const names = new Map(codes.map((entry) => [entry.name, entry.code]));
  if (names.size !== codes.length) throw new Error("exit codes: two codes share a name. Fix: give each code its own name.");
  const frozen = Object.freeze(codes.map((entry) => Object.freeze({ ...entry })));
  return {
    codes: frozen,
    code(name) {
      const found = names.get(name);
      if (found === undefined) throw new Error(`exit codes: no code named "${name}". Fix: one of ${[...names.keys()].join(", ")}.`);
      return found;
    },
    line: () => `Exit codes: ${frozen.map((entry) => `${entry.code} ${entry.short}`).join(", ")}.`,
  };
}
