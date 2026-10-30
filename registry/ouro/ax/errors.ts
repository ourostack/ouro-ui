/**
 * One error shape for every agent surface: the CLI's stderr line, its `--json` error and an MCP tool error all carry
 * the same fields, so an agent learns one repair loop. The line mirrors Ouro HX's dev message format:
 * `<tool>: <thing>: <what's wrong>. Fix: <exact code>.`
 */
export interface AxErrorShape {
  /** A stable slug an agent can branch on, such as "unknown-flag", "missing-arg" or "needs-why". */
  code: string;
  /** The process exit code. */
  exit: number;
  /** What the error is about: a command ("send"), a flag ("send --why") or a tool. */
  thing: string;
  /** What's wrong, in the agent's words. */
  problem: string;
  /** The exact code to run instead, or null when nothing the agent runs can fix it. */
  fix: string | null;
}

/** The error every AX primitive throws: its message is the one line, its shape the data. */
export class AxError extends Error {
  readonly shape: AxErrorShape;
  constructor(shape: AxErrorShape) {
    super(errorMessage(shape));
    this.name = "AxError";
    this.shape = shape;
  }
  get exit(): number {
    return this.shape.exit;
  }
}

export function isAxError(value: unknown): value is AxError {
  return value instanceof AxError;
}

const sentence = (text: string) => text.trim().replace(/[.\s]+$/, "");

/** `<thing>: <problem>. Fix: <fix>.`, without the tool's prefix (a CLI adds its own). */
export function errorMessage(shape: Pick<AxErrorShape, "thing" | "problem" | "fix">): string {
  const head = `${shape.thing}: ${sentence(shape.problem)}.`;
  return shape.fix === null ? head : `${head} Fix: ${sentence(shape.fix)}.`;
}

/** The one stderr line: `<tool>: <thing>: <problem>. Fix: <fix>.` Line breaks in any part become spaces. */
export function errorLine(tool: string, shape: Pick<AxErrorShape, "thing" | "problem" | "fix">): string {
  return `${tool}: ${errorMessage(shape)}`.replace(/\s*[\r\n]+\s*/g, " ");
}

/** The `--json` and MCP form: `{ error: { code, exit, thing, problem, fix, message } }`. */
export function errorJson(shape: AxErrorShape): { error: AxErrorShape & { message: string } } {
  return { error: { ...shape, message: errorMessage(shape) } };
}

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j]!;
      row[j] = Math.min(above + 1, row[j - 1]! + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length]!;
}

/** The candidate an agent most likely meant: a unique prefix, or the nearest within two edits; null when none is close. */
export function didYouMean(word: string, candidates: readonly string[]): string | null {
  if (word === "") return null;
  const prefixed = candidates.filter((c) => c.startsWith(word) || word.startsWith(c));
  if (prefixed.length === 1) return prefixed[0]!;
  let best: string | null = null;
  let bestDistance = Math.min(3, Math.max(2, Math.floor(word.length / 2)) + 1);
  for (const c of candidates) {
    const d = distance(word, c);
    if (d < bestDistance) {
      best = c;
      bestDistance = d;
    }
  }
  return best;
}

/** Quotes a word for a POSIX shell only when it needs it, so a fix copies and runs as printed. */
export function shellWord(word: string): string {
  if (/^<[^>\s]+>$/.test(word) || /^[A-Za-z0-9_./:@#,=+-]+$/.test(word)) return word;
  return `"${word.replace(/(["\\$`])/g, "\\$1")}"`;
}

/** A command line from words, each quoted only when it needs it. */
export function commandLine(words: readonly string[]): string {
  return words.map(shellWord).join(" ");
}
