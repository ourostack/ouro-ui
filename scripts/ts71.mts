import { API } from "typescript7/sync";
import type { Node, SourceFile } from "typescript7/ast";
import { ScriptKind, ScriptTarget, SyntaxKind } from "typescript7/ast";
import { isCallExpression, isExportDeclaration, isExternalModuleReference, isIdentifier, isImportDeclaration, isImportEqualsDeclaration, isNoSubstitutionTemplateLiteral, isStringLiteral } from "typescript7/ast/is";

export * from "typescript7/ast";
export * from "typescript7/ast/is";
export { getLeadingCommentRanges, getTrailingCommentRanges } from "typescript7/ast/scanner";
export {
  isClassLikeDeclaration as isClassLike,
  isParameterDeclaration as isParameter,
  isPropertySignatureDeclaration as isPropertySignature,
  isStringLiteralLikeNode as isStringLiteralLike,
  isTypeAssertion as isTypeAssertionExpression,
} from "typescript7/ast/is";

let api: API | undefined;

/**
 * The one native TypeScript 7.1 client the repository's tooling shares. It is never closed: closing it from
 * an exit handler throws, and the native process ends with the Node process.
 */
function client(): API {
  api ??= new API();
  return api;
}

/** Parses `text` as the file at `path`, and returns its syntax tree; the language comes from the extension unless `kind` is given. */
export function createSourceFile(path: string, text: string, kind?: ScriptKind): SourceFile {
  const retained = client().createSourceFile(path, text, kind === undefined ? undefined : { scriptKind: kind });
  return (retained as unknown as { sourceFile: SourceFile }).sourceFile ?? (retained as unknown as SourceFile);
}

/** Strips the types from `text` and returns the JavaScript, as `ts.transpileModule(...).outputText` did. */
export function transpile(text: string, compilerOptions: Record<string, unknown> = {}): string {
  return client().transpileModule(text, { compilerOptions: { target: ScriptTarget.ES2022, module: 99 /* ModuleKind.ESNext: 7.1's /ast does not export ModuleKind */, ...compilerOptions } }).outputText;
}

/** Calls `visit` on each direct child of `node`, as TypeScript 6's `ts.forEachChild` did, and stops at the first truthy result. */
export function forEachChild<T>(node: Node, visit: (child: Node) => T | undefined): T | undefined {
  return (node as unknown as { forEachChild(visit: (child: Node) => T | undefined): T | undefined }).forEachChild(visit);
}

const functionLike = new Set<SyntaxKind>([
  SyntaxKind.FunctionDeclaration, SyntaxKind.FunctionExpression, SyntaxKind.ArrowFunction, SyntaxKind.MethodDeclaration,
  SyntaxKind.Constructor, SyntaxKind.GetAccessor, SyntaxKind.SetAccessor, SyntaxKind.MethodSignature, SyntaxKind.CallSignature,
  SyntaxKind.ConstructSignature, SyntaxKind.IndexSignature, SyntaxKind.FunctionType, SyntaxKind.ConstructorType,
]);

/** Whether `node` declares a function, method, accessor, constructor or signature. */
export const isFunctionLike = (node: Node): boolean => functionLike.has(node.kind);

/** The modifiers written on `node` (`export`, `async` and the like), or `undefined`. */
export const getModifiers = (node: Node) => (node as { modifiers?: readonly { kind: SyntaxKind }[] }).modifiers;

/** Every module specifier `text` imports, re-exports, `require`s or `import()`s, as TypeScript 6's `preProcessFile(text, true, true).importedFiles` listed them. */
export function importedFiles(path: string, text: string): string[] {
  const found: string[] = [];
  const literal = (node: Node | undefined): void => {
    if (node && (isStringLiteral(node) || isNoSubstitutionTemplateLiteral(node))) found.push(node.text);
  };
  const visit = (node: Node): void => {
    if (isImportDeclaration(node) || isExportDeclaration(node)) literal(node.moduleSpecifier);
    else if (isImportEqualsDeclaration(node) && isExternalModuleReference(node.moduleReference)) literal(node.moduleReference.expression);
    else if (isCallExpression(node) && (node.expression.kind === SyntaxKind.ImportKeyword || (isIdentifier(node.expression) && node.expression.text === "require"))) literal(node.arguments[0]);
    forEachChild(node, visit);
  };
  visit(createSourceFile(path, text));
  return found;
}
