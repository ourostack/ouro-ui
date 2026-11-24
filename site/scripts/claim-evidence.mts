// Drops the evidence argument of every claim() call in the site's own modules when Vite builds them, so a page ships a
// sourced sentence's words and not its sources and checks. claim() returns its text and ignores its evidence
// (registry/ouro/lib/ouro/claims.ts), and pnpm claims:check reads the evidence from the source files, never from the
// bundle, so nothing that runs in a browser loses anything. Without it every sourced sentence on a page costs its words
// plus its sources and checks in the page's first JavaScript.
import { parseSync } from "vite";

/** The module that exports claim(), however an import names it. */
const CLAIMS_MODULE = /(?:^|\/)lib\/ouro\/claims(?:\.ts)?$/;

interface AstNode {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
}

const isNode = (value: unknown): value is AstNode => typeof value === "object" && value !== null && typeof (value as AstNode).type === "string";

/** The source with each claim(text, evidence) call's evidence removed: claim(text). Unchanged when it imports no claim(). */
export function stripClaimEvidence(code: string, id: string): string {
  if (!code.includes("claim(")) return code;
  const lang = id.endsWith(".tsx") ? "tsx" : id.endsWith(".ts") || id.endsWith(".mts") ? "ts" : id.endsWith(".jsx") ? "jsx" : "js";
  const { program, errors } = parseSync(id, code, { lang });
  if (errors.length) return code;
  const names = new Set<string>();
  for (const statement of program.body as unknown as AstNode[]) {
    if (statement.type !== "ImportDeclaration" || !CLAIMS_MODULE.test(String((statement.source as { value: string }).value))) continue;
    for (const specifier of statement.specifiers as AstNode[]) {
      const imported = specifier.imported as { name?: string; value?: string } | undefined;
      if (specifier.type === "ImportSpecifier" && (imported?.name ?? imported?.value) === "claim") names.add((specifier.local as { name: string }).name);
    }
  }
  if (!names.size) return code;
  const cuts: Array<[number, number]> = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!isNode(node)) return;
    const args = node.arguments as AstNode[] | undefined;
    const callee = node.callee as AstNode | undefined;
    if (node.type === "CallExpression" && callee?.type === "Identifier" && names.has(callee.name as string) && args && args.length >= 2) {
      // From the end of the text to the end of the last argument: `, { source, verify }`.
      cuts.push([args[0]!.end, args.at(-1)!.end]);
      return visit(args[0]);
    }
    for (const key of Object.keys(node)) if (key !== "start" && key !== "end" && key !== "type") visit(node[key]);
  };
  visit(program);
  let out = code;
  for (const [start, end] of cuts.sort((a, b) => b[0] - a[0])) out = out.slice(0, start) + out.slice(end);
  return out;
}

/** The Vite plugin: the site's own modules (not node_modules) lose their claims' evidence before anything else reads them. */
export function claimEvidencePlugin(): { name: string; enforce: "pre"; transform: (code: string, id: string) => { code: string; map: null } | undefined } {
  return {
    name: "strip-claim-evidence",
    enforce: "pre",
    transform: (code, id) => {
      const file = id.split("?")[0]!;
      if (file.includes("/node_modules/") || !/\.(?:[mc]?[jt]sx?)$/.test(file)) return undefined;
      const out = stripClaimEvidence(code, file);
      return out === code ? undefined : { code: out, map: null };
    },
  };
}
