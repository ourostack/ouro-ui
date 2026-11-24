# TypeScript 7.1 API findings

Notes from moving Ouro UI's tooling onto `typescript@7.1.0-beta`, written for the people who build TypeScript's programmatic API. Each note has a minimal repro. None of these has been reported anywhere yet.

The tooling's shared entry is `scripts/ts71.mts`, a thin layer over `typescript7/sync` and `typescript7/ast`. A file that needs more than it offers stays on TypeScript 6; the last section lists which and why.

## 1. Regression: TS7031 on a destructured, defaulted parameter (7.0.2 clean, 7.1.0-beta errors)

Hit in `registry/ouro/e2e/screen-reader/nvda.ts` against `@guidepup/playwright`. With `strict`, `noEmit`, target `es2022` and `moduleResolution: bundler`, this file type-checks on 7.0.2 and fails on 7.1.0-beta with `Binding element 'capture' implicitly has an 'any' type`:

```ts
type Prettify<T> = { [K in keyof T]: T[K] } & {};
interface CommandOptions { capture?: boolean | "initial"; other?: string }
type CaptureCommandOptions = Prettify<Pick<CommandOptions, "capture">>;
interface Reader { go(options?: CaptureCommandOptions): Promise<void> }
declare const reader: Reader;
reader.go = async ({ capture } = {}) => { void capture; };
```

Workaround: annotate the parameter with `Parameters<Reader["go"]>[0]`.

## 2. typescript-eslint and react-docgen-typescript cannot run on TypeScript 7

`typescript-eslint` 8.71.0 declares the peer range `typescript <6.1.0`, and Storybook's `react-docgen-typescript` needs the `ts.*` JavaScript API. Neither has a TypeScript 7 release, so a repository that lints with typescript-eslint or builds Storybook docs cannot drop TypeScript 6 yet. Ouro UI keeps `typescript` at 6.0.3 for them and aliases 7.1 as `typescript7`.

## 3. No hover or completion in the programmatic API

The 7.1 client offers a program, a checker, diagnostics, `getCompletionsAtPosition` on the wire protocol and JSDoc readers, but there is no equivalent of the language service's quick info (`getQuickInfoAtPosition`) that shows what an editor hover shows. Ouro UI's agent-snippet tests (`scripts/agent-types.test.mjs`) and the dev-message extractor (`site/scripts/agent-messages.mts`) read that hover text, so they stay on TypeScript 6.

## 4. No `preProcessFile`

TypeScript 6's `ts.preProcessFile(text, true, true).importedFiles` listed a file's module specifiers without a full parse. There is no 7.1 counterpart. `importedFiles()` in `scripts/ts71.mts` walks the syntax tree for `import`, `export … from`, `import x = require()`, `import()` and `require()` instead.

## 5. No `ts.sys`

Reading a file through the compiler host (`ts.sys.readFile`) has no equivalent on the client; `node:fs` replaces it.

## 6. `transpileModule` takes numeric enums, and `ModuleKind` is not exported from `/ast`

```ts
import { API } from "typescript/sync";
new API().transpileModule("export const a: number = 1;", { compilerOptions: { target: "es2022", module: "esnext" } });
```

The native side panics with `interface conversion: interface {} is string, not float64` instead of reporting a bad option. The options need the enum numbers, and `ScriptTarget` is exported from `typescript/ast` but `ModuleKind` is not, so the caller writes `99`.

## 7. `api.close()` from a `process.on("exit")` handler throws

```ts
import { API } from "typescript/sync";
const api = new API();
api.createSourceFile("a.ts", "export {}");
process.on("exit", () => api.close());
```

The process fails with `Unexpected EOF while reading from child process`. Leaving the client open exits cleanly, so the shim never closes it.

## 8. Renamed or missing helpers

Porting a file written against TypeScript 6's `ts.*` hit these:

| TypeScript 6 | 7.1 |
| --- | --- |
| `isClassLike` | `isClassLikeDeclaration` |
| `isParameter` | `isParameterDeclaration` |
| `isPropertySignature` | `isPropertySignatureDeclaration` |
| `isStringLiteralLike` | `isStringLiteralLikeNode` |
| `isTypeAssertionExpression` | `isTypeAssertion` |
| `isFunctionLike` | only `isFunctionLikeDeclaration`, which is narrower |
| `canHaveModifiers`, `getModifiers` | none; read `node.modifiers` |
| `ts.forEachChild(node, cb)` | `node.forEachChild(cb)` |
| `ts.createSourceFile(name, text, target, setParents, kind)` | `api.createSourceFile(name, text, { scriptKind })` on a client |
| `ts.factory.createObjectLiteralExpression()` as an empty fallback | none for a read-only tree |

## 9. Rough edges

- The package root exports only `version` and `versionMajorMinor`; everything else is under `typescript/sync`, `/async`, `/fs` or `/ast/*`, so a tool written for `import ts from "typescript"` has to change every import.
- The package is ESM only.
- The first call starts a native process, about 250 ms.
- Nodes decode lazily, and `SyntaxKind[kind]` returns an alias name for a range marker (`FirstStatement`) rather than the node's own name.
- The `using` examples in the beta post need Node 24; Node 22 has no `using`.
- Installing needs the platform's optional native package (`@typescript/typescript-<platform>`), so a lockfile resolved on one platform must carry all of them.

## What stays on TypeScript 6, and why

- `registry/ouro/lib/ouro/claims-check.mjs` and `registry/ouro/source-rules/source-rules.mjs` ship into apps. An app on `typescript ~7.0.2` has no JavaScript API, and the 7.1 client is still beta, so porting would raise the shipped floor to a prerelease. They keep the range `>=6.0.3`, and the `typecheck:oldest` check keeps 5.9.3, because it only type-checks the shipped source. Revisit when 7.1 is stable.
- The census's walkers in `scripts/ouro-census/walkers/` ship into products through Ouro Current, and a product runs them on its own `typescript` with nothing else installed, so [every vendored census file imports only Node's built-ins, `typescript` and other vendored files](scripts/ouro-census/manifest.node-test.mts "verify:fileLine(scripts/ouro-census/manifest.node-test.mts, /a vendored file imports only Node's built-ins, the product's own typescript and other vendored files/)"). Moved onto `scripts/ts71.mts`, they failed every product's census with `ERR_MODULE_NOT_FOUND` for `typescript7` (#3380).
- `scripts/gen-docs.mts` and `scripts/ax-docs.mts` read the checker (types, symbols, JSDoc) through the TypeScript 6 program; `scripts/agent-types.test.mjs` and `site/scripts/agent-messages.mts` read language-service hover text (finding 3); `scripts/upgrade-note.test.mjs` rewrites a tree with transformers.
- The 7.1-based `scripts/ts71.mts` covers the rest: parsing, tree walks, import scans and `transpileModule`.
